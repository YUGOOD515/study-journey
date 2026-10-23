"""八学期时间轴：把计划整理成按学期分列的视图数据，并给出排课提醒。"""
from __future__ import annotations

from dataclasses import dataclass

from .catalog import CATEGORY_ORDER, TERMS
from .offerings import Semester
from .plan import Calendar, PlanItem, stage

NATURE_ORDER = {"必修": 0, "选修": 1, "经法管融通": 2, "跨专业": 3}


@dataclass(frozen=True)
class Card:
    item: PlanItem
    warning: str | None = None


def stage_name(term: int) -> str:
    """第 5 学期 → '大三上'。界面上学期一律这样称呼，副信息才写「2026 秋」。"""
    return stage(term)


def stage_range(terms) -> str:
    """建议学期：[5] → '大三上'，[5, 6] → '大三上–大三下'，全部 8 个 → '不限'。"""
    terms = list(terms)
    if len(terms) >= 8:
        return "不限"
    return stage(terms[0]) if len(terms) == 1 else f"{stage(terms[0])}–{stage(terms[-1])}"


@dataclass(frozen=True)
class TermColumn:
    term: int
    label: str
    cards: list[Card]
    is_current: bool
    is_past: bool

    @property
    def stage(self) -> str:
        """'大三上'、'大三下'。"""
        return stage_name(self.term)

    @property
    def credits(self) -> float:
        return sum(c.item.course.credits for c in self.cards if c.item.status != "未通过")


@dataclass(frozen=True)
class Timeline:
    columns: list[TermColumn]

    @property
    def upcoming(self) -> list[TermColumn]:
        return [c for c in self.columns if not c.is_past]


def sort_key(item: PlanItem):
    c = item.course
    return (CATEGORY_ORDER.index(c.category), NATURE_ORDER.get(c.nature, 9), c.code)


def warning_for(
    item: PlanItem,
    terms: dict[str, int | None],
    names: dict[str, str],
    offerings: dict[int, Semester] | None = None,
) -> str | None:
    if item.locked or item.term is None:
        return None
    notes = []
    semester = (offerings or {}).get(item.term)
    # 实践类课程（军训、实习、论文）不在选课表里，不提示
    if semester and item.course.category != "practice_education" and not semester.offers(item.course.code):
        notes.append(f"{semester.label}的开课表里没有找到这门课")
    allowed = item.course.allowed_terms
    if item.term not in allowed:
        notes.append(f"培养方案建议在{stage_range(allowed)}修读")
    pre = item.course.prerequisite_code
    if pre and pre in terms:
        pre_term = terms[pre]
        if pre_term is None or pre_term >= item.term:
            notes.append(f"先修课「{names[pre]}」需安排在更早的学期")
    return "；".join(notes) or None


def build(items: list[PlanItem], calendar: Calendar, offerings: dict[int, Semester] | None = None) -> Timeline:
    """offerings：{学期序号: 该学期开课数据}，只放已经发布了开课表的学期。"""
    terms = {i.course.code: i.term for i in items}
    names = {i.course.code: i.course.name for i in items}
    by_term: dict[int | None, list[Card]] = {}
    for item in sorted(items, key=sort_key):
        by_term.setdefault(item.term, []).append(Card(item, warning_for(item, terms, names, offerings)))
    columns = [
        TermColumn(
            term=t,
            label=calendar.label(t),
            cards=by_term.get(t, []),
            is_current=t == calendar.current_term,
            is_past=t < calendar.current_term,
        )
        for t in TERMS
    ]
    return Timeline(columns=columns)


# ---------- 左栏：按毕业要求分组的课程库 ----------

@dataclass(frozen=True)
class LibraryGroup:
    """一项毕业要求（如「通识教育·选修」）：进度 + 这一组的课程。"""

    category: str
    name: str  # 必修 / 选修 / 经法管融通
    required: float
    counted: float  # 已修 + 在修 + 计划（按要求截断）
    cards: list[Card]  # 待安排的在前

    @property
    def missing(self) -> float:
        return max(self.required - self.counted, 0)

    @property
    def pending(self) -> list[Card]:
        return [c for c in self.cards if c.item.term is None]


@dataclass(frozen=True)
class LibrarySection:
    category: str
    name: str
    required: float
    counted: float
    groups: list[LibraryGroup]

    @property
    def missing(self) -> float:
        return max(self.required - self.counted, 0)


def library(progress) -> list[LibrarySection]:
    """把学分进度的各个桶变成左栏：每类毕业要求一节，节里按必修 / 选修 / 经法管融通分组。"""
    sections = []
    for cat in progress.categories:
        groups = []
        for b in cat.buckets:
            seen, cards = set(), []
            for item in sorted(b.items, key=lambda i: (i.term is not None, sort_key(i))):
                if item.course.code in seen:
                    continue
                seen.add(item.course.code)
                cards.append(Card(item))
            groups.append(LibraryGroup(cat.code, b.name, b.required, sum(b.layers()), cards))
        sections.append(LibrarySection(cat.code, cat.name, cat.required, cat.earned + cat.in_progress + cat.planned, groups))
    return sections
