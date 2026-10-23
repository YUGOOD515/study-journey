"""毕业学分进度。口径见 docs/16 §2（经法管融通计入大类平台，上限 6 学分，超出部分计入通识选修）。"""
from __future__ import annotations

from dataclasses import dataclass, field

from .catalog import CATEGORY_ORDER, Catalog
from .plan import PlanItem

INTERDISCIPLINARY_CAP = 6
STATUS_PRIORITY = {"已修读": 0, "正在修读": 1, "计划修读": 2, "未修读": 3, "未通过": 4}


@dataclass
class Bucket:
    category: str
    type: str
    name: str
    required: float
    earned: float = 0
    in_progress: float = 0
    planned: float = 0
    items: list[PlanItem] = field(default_factory=list)

    def add(self, item: PlanItem) -> None:
        self.items.append(item)
        kind = credit_kind(item)
        if kind:
            setattr(self, kind, getattr(self, kind) + item.course.credits)

    def layers(self) -> tuple[float, float, float]:
        """按要求学分截断后的（已修, 在修, 计划），避免某一项超修掩盖另一项的缺口。"""
        e = min(self.earned, self.required)
        ei = min(self.earned + self.in_progress, self.required)
        eip = min(self.earned + self.in_progress + self.planned, self.required)
        return e, ei - e, eip - ei


@dataclass
class CategoryProgress:
    code: str
    name: str
    required: float
    buckets: list[Bucket]

    def _layer(self, index: int) -> float:
        return sum(b.layers()[index] for b in self.buckets)

    @property
    def earned(self) -> float:
        return self._layer(0)

    @property
    def in_progress(self) -> float:
        return self._layer(1)

    @property
    def planned(self) -> float:
        return self._layer(2)

    @property
    def missing(self) -> float:
        return max(self.required - self.earned - self.in_progress - self.planned, 0)


@dataclass
class Progress:
    categories: list[CategoryProgress]
    overflow: list[PlanItem]

    @property
    def required(self) -> float:
        return sum(c.required for c in self.categories)

    def total(self, attr: str) -> float:
        return sum(getattr(c, attr) for c in self.categories)


def credit_kind(item: PlanItem) -> str | None:
    """学分计入哪一列；未安排（待安排）和未通过不计。"""
    if item.term is None:
        return None
    return {"已修读": "earned", "正在修读": "in_progress", "计划修读": "planned", "未修读": "planned"}.get(
        item.status
    )


def compute(items: list[PlanItem], catalog: Catalog) -> Progress:
    buckets = {(r.category, r.type): Bucket(r.category, r.type, r.name, r.credits) for r in catalog.requirements}
    general_elective = buckets[("general_education", "elective")]
    to_major: list[PlanItem] = []
    for item in items:
        c = item.course
        if c.nature == "经法管融通":
            if c.credit_count_to == "通识教育-选修":
                general_elective.add(item)
            else:
                to_major.append(item)
            continue
        if c.nature == "跨专业":
            general_elective.add(item)
            continue
        key = (c.category, "required" if c.is_required else "elective")
        if key in buckets:
            buckets[key].add(item)

    # 大类平台方向的经法管：已修 > 在修 > 计划，学分大的优先，整门装入直到 6 学分，放不下的整门计入通识选修
    to_major.sort(key=lambda i: (STATUS_PRIORITY.get(i.status, 9), -i.course.credits))
    major = buckets[("major_platform", "interdisciplinary")]
    remaining, overflow = INTERDISCIPLINARY_CAP, []
    for item in to_major:
        if credit_kind(item) and item.course.credits > remaining + 1e-9:
            general_elective.add(item)
            overflow.append(item)
            continue
        major.add(item)
        if credit_kind(item):
            remaining -= item.course.credits

    categories = [
        CategoryProgress(
            code=code,
            name=catalog.category_names[code],
            required=catalog.category_required(code),
            buckets=[b for b in buckets.values() if b.category == code],
        )
        for code in CATEGORY_ORDER
    ]
    return Progress(categories, overflow)
