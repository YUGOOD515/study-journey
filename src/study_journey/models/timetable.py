"""学期课表：给某学期排进来的每门课选一个教学班，排成周课表并检查时间冲突。"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from itertools import combinations

from .offerings import DAY_NAMES, Meeting, Section, Semester, compress
from .plan import PlanItem
from .timeline import sort_key

PERIODS = range(1, 13)
# 学校的节次：上午 1–5、下午 6–9、晚上 10–12
PERIOD_GROUPS = (("上午", 1, 5), ("下午", 6, 9), ("晚上", 10, 12))
SEARCH_LIMIT = 20000  # 自动排课最多尝试的组合数


# ---------- 班级匹配 ----------

def shift_class(name: str | None, years: int) -> str | None:
    """'数金2401班' 往前推 1 年 → '数金2301班'。参考往年开课表时，要找当年同年级的班。"""
    if not name or not years:
        return name
    if m := re.fullmatch(r"(.*?)(\d{2})(\d{2})班", name):
        return f"{m[1]}{int(m[2]) - years:02d}{m[3]}班"
    return name


def in_class(classes: tuple[str, ...], name: str | None) -> bool:
    """教学班的合班名单里是否有这个班；也认「数金[2401-2402]班」这种写法。"""
    if not name:
        return False
    # 大一在首义校区上课时班级名前面会加「首」，如「首数金2401班」
    classes = tuple(c[1:] if c.startswith("首") else c for c in classes)
    if name in classes:
        return True
    m = re.fullmatch(r"(.*?)(\d{4})班", name)
    if not m:
        return False
    prefix, number = m[1], int(m[2])
    for c in classes:
        if r := re.fullmatch(r"(.*?)\[(\d{4})-(\d{4})\]班", c):
            if r[1] == prefix and int(r[2]) <= number <= int(r[3]):
                return True
    return False


# ---------- 冲突 ----------

def overlap(a: Meeting, b: Meeting) -> tuple[int, ...]:
    """两次上课的冲突周次（同一天、节次有交集、周次有交集）；不冲突返回空。"""
    if a.day != b.day or not set(a.periods) & set(b.periods):
        return ()
    return tuple(sorted(set(a.weeks) & set(b.weeks)))


@dataclass(frozen=True)
class Conflict:
    first: str  # 课程号
    second: str
    day: int
    periods: tuple[int, ...]
    weeks: tuple[int, ...]

    @property
    def when(self) -> str:
        return f"周{DAY_NAMES[self.day - 1]} 第 {compress(self.periods)} 节（第 {compress(self.weeks)} 周）"


def find_conflicts(chosen: dict[str, Section]) -> list[Conflict]:
    found = []
    for (ca, sa), (cb, sb) in combinations(sorted(chosen.items()), 2):
        for ma in sa.meetings:
            for mb in sb.meetings:
                if weeks := overlap(ma, mb):
                    periods = tuple(sorted(set(ma.periods) & set(mb.periods)))
                    found.append(Conflict(ca, cb, ma.day, periods, weeks))
    return found


def section_clash(a: Section, b: Section) -> int:
    """两个教学班冲突的「周次 × 节次」数，用来衡量冲突有多严重。"""
    return sum(len(overlap(ma, mb)) * len(set(ma.periods) & set(mb.periods)) for ma in a.meetings for mb in b.meetings)


# ---------- 自动排课 ----------

def penalty(section: Section, my_class: str | None, course_has_my_class: bool) -> int:
    """单个教学班的不合适程度：不是本班的、限性别的、已关闭的往后排。"""
    p = 0
    if course_has_my_class and not in_class(section.classes, my_class):
        p += 20
    if section.gender:
        p += 5
    if section.closed:
        p += 1
    return p


def auto_arrange(
    candidates: dict[str, tuple[Section, ...]],
    fixed: dict[str, Section],
    my_class: str | None = None,
) -> dict[str, Section]:
    """给 candidates 里的课程各挑一个教学班：先让冲突最少，再尽量选本班的。

    fixed 是已经选好的教学班，保持不动。分支定界搜索，组合太多时在上限内取最好结果。
    """
    courses = []
    for code, sections in candidates.items():
        has_mine = any(in_class(s.classes, my_class) for s in sections)
        ranked = sorted(sections, key=lambda s: penalty(s, my_class, has_mine))
        courses.append((code, [(s, penalty(s, my_class, has_mine)) for s in ranked[:40]]))
    courses.sort(key=lambda c: len(c[1]))  # 选择少的先定

    best: dict = {"cost": None, "pick": {}}
    tried = 0

    def search(i: int, pick: dict[str, Section], cost: int) -> None:
        nonlocal tried
        if best["cost"] is not None and cost >= best["cost"]:
            return
        if i == len(courses):
            best["cost"], best["pick"] = cost, dict(pick)
            return
        code, options = courses[i]
        placed = list(fixed.values()) + list(pick.values())
        scored = sorted(
            ((sum(section_clash(s, o) for o in placed) * 100 + p, s) for s, p in options),
            key=lambda x: x[0],
        )
        for extra, s in scored:
            tried += 1
            if tried > SEARCH_LIMIT and best["cost"] is not None:
                return
            pick[code] = s
            search(i + 1, pick, cost + extra)
            del pick[code]

    search(0, {}, 0)
    return best["pick"]


# ---------- 视图数据 ----------

@dataclass(frozen=True)
class CourseRow:
    item: PlanItem
    sections: tuple[Section, ...]
    chosen: Section | None
    mine: tuple[str, ...]  # 本班的课序号
    conflicts: tuple[str, ...] = ()  # 和哪些课冲突（课程名）

    @property
    def online_only(self) -> bool:
        return self.chosen is not None and not self.chosen.meetings


@dataclass(frozen=True)
class Block:
    code: str
    name: str
    category: str
    section: Section
    meeting: Meeting
    conflict: bool
    lane: int = 0
    lanes: int = 1

    @property
    def start(self) -> int:
        return min(self.meeting.periods)

    @property
    def end(self) -> int:
        return max(self.meeting.periods)


@dataclass(frozen=True)
class Timetable:
    term: int
    label: str
    semester: Semester | None
    is_reference: bool
    my_class: str | None
    rows: list[CourseRow]
    days: list[int]
    blocks: dict[int, list[Block]]  # 星期 → 课块
    conflicts: list[Conflict]
    week: int | None  # None = 全部周
    max_week: int
    names: dict[str, str] = field(default_factory=dict)

    @property
    def unplaced(self) -> list[CourseRow]:
        """有开课、但还没选教学班的课。"""
        return [r for r in self.rows if r.sections and r.chosen is None]

    @property
    def not_offered(self) -> list[CourseRow]:
        return [r for r in self.rows if not r.sections]

    @property
    def credits(self) -> float:
        return sum(r.item.course.credits for r in self.rows)


def assign_lanes(blocks: list[Block]) -> list[Block]:
    """同一天时间重叠的课块并排显示：按开始节次分配车道，每组重叠的课块共享车道数。"""
    blocks = sorted(blocks, key=lambda b: (b.start, b.end, b.code))
    result: list[Block] = []
    group: list[Block] = []
    group_end = 0
    lanes_end: list[int] = []

    def flush():
        n = max((b.lane for b in group), default=-1) + 1
        result.extend(Block(**{**b.__dict__, "lanes": n}) for b in group)

    for b in blocks:
        if group and b.start > group_end:
            flush()
            group, lanes_end, group_end = [], [], 0
        lane = next((i for i, end in enumerate(lanes_end) if end < b.start), len(lanes_end))
        if lane == len(lanes_end):
            lanes_end.append(b.end)
        else:
            lanes_end[lane] = b.end
        group.append(Block(**{**b.__dict__, "lane": lane}))
        group_end = max(group_end, b.end)
    if group:
        flush()
    return result


def build(
    term: int,
    label: str,
    items: list[PlanItem],
    semester: Semester | None,
    is_reference: bool,
    choices: dict[str, str],
    my_class: str | None = None,
    week: int | None = None,
) -> Timetable:
    """choices：{课程号: 课序号}。课序号在开课数据里找不到（比如数据更新了）就当没选。"""
    in_term = sorted((i for i in items if i.term == term), key=sort_key)
    chosen: dict[str, Section] = {}
    rows_raw = []
    for item in in_term:
        code = item.course.code
        sections = semester.sections.get(code, ()) if semester else ()
        pick = next((s for s in sections if s.seq == choices.get(code)), None)
        if pick:
            chosen[code] = pick
        mine = tuple(s.seq for s in sections if in_class(s.classes, my_class))
        rows_raw.append((item, sections, pick, mine))

    conflicts = find_conflicts(chosen)
    names = {i.course.code: i.course.name for i in in_term}
    clash_with: dict[str, set[str]] = {}
    for c in conflicts:
        clash_with.setdefault(c.first, set()).add(names[c.second])
        clash_with.setdefault(c.second, set()).add(names[c.first])
    rows = [
        CourseRow(item, sections, pick, mine, tuple(sorted(clash_with.get(item.course.code, ()))))
        for item, sections, pick, mine in rows_raw
    ]
    rows.sort(key=lambda r: (not r.sections, r.item.course.category == "practice_education"))

    max_week = max((w for s in chosen.values() for m in s.meetings for w in m.weeks), default=16)
    by_day: dict[int, list[Block]] = {}
    for code, s in chosen.items():
        item = next(i for i in in_term if i.course.code == code)
        for m in s.meetings:
            if week is not None and week not in m.weeks:
                continue
            clash = any(
                (weeks := overlap(m, other)) and (week is None or week in weeks)
                for oc, os_ in chosen.items() if oc != code for other in os_.meetings
            )
            by_day.setdefault(m.day, []).append(Block(code, item.course.name, item.course.category, s, m, clash))
    days = [d for d in range(1, 8) if d <= 5 or by_day.get(d)]
    return Timetable(
        term=term,
        label=label,
        semester=semester,
        is_reference=is_reference,
        my_class=my_class,
        rows=rows,
        days=days,
        blocks={d: assign_lanes(by_day.get(d, [])) for d in days},
        conflicts=[c for c in conflicts if week is None or week in c.weeks],
        week=week,
        max_week=max(max_week, 16),
        names=names,
    )
