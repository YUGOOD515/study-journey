"""学期课表：给某学期排进来的每门课选一个教学班，排成周课表并检查时间冲突。"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from itertools import combinations

from .catalog import Course
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
class SectionOption:
    section: Section
    conflicts: tuple[str, ...]  # 和已选的哪些课冲突（课程名）
    mine: bool
    chosen: bool


@dataclass(frozen=True)
class SectionGroup:
    """上课时间完全相同的一组教学班（大课常常同一时间开好几个班）。"""

    key: str
    meetings: tuple[Meeting, ...]
    options: tuple[SectionOption, ...]

    @property
    def conflicts(self) -> tuple[str, ...]:
        return self.options[0].conflicts

    @property
    def chosen(self) -> bool:
        return any(o.chosen for o in self.options)

    @property
    def mine(self) -> bool:
        return any(o.mine for o in self.options)

    @property
    def label(self) -> str:
        """'周一 1–2（3–6 周）；周三 3–4'。满 16 周的不写周次。"""
        parts = [m.short + ("" if len(m.weeks) >= 16 else f"（{m.weeks_label}）") for m in self.meetings]
        return "；".join(parts) or "线上课程或时间待定"


@dataclass(frozen=True)
class Pick:
    """正在给某门课挑教学班：课表上显示它所有可选的时间。"""

    row: "CourseRow"
    groups: list[SectionGroup]

    @property
    def count(self) -> int:
        return sum(len(g.options) for g in self.groups)


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
    # 挑教学班时的候选时间（虚线块）：同一天同样节次的各组教学班合成一块（它们可能周次不同）
    groups: tuple[SectionGroup, ...] = ()

    @property
    def ghost(self) -> bool:
        return bool(self.groups)

    @property
    def options(self) -> list[SectionOption]:
        return [o for g in self.groups for o in g.options]

    @property
    def target(self) -> SectionGroup:
        """点虚线块时在面板里定位到的那组：优先不冲突的。"""
        return next((g for g in self.groups if not g.conflicts), self.groups[0])

    @property
    def partly_conflicting(self) -> bool:
        return any(g.conflicts for g in self.groups) and not self.conflict

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
    pick: Pick | None = None
    chosen: dict[str, Section] = field(default_factory=dict)

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
    pick: str | None = None,
) -> Timetable:
    """choices：{课程号: 课序号}。课序号在开课数据里找不到（比如数据更新了）就当没选。

    pick：正在挑教学班的课程号。它已选的课块换成所有候选时间（虚线块）。
    """
    in_term = sorted((i for i in items if i.term == term), key=sort_key)
    chosen: dict[str, Section] = {}
    rows_raw = []
    for item in in_term:
        code = item.course.code
        sections = semester.sections.get(code, ()) if semester else ()
        sel = next((s for s in sections if s.seq == choices.get(code)), None)
        if sel:
            chosen[code] = sel
        mine = tuple(s.seq for s in sections if in_class(s.classes, my_class))
        rows_raw.append((item, sections, sel, mine))

    conflicts = find_conflicts(chosen)
    names = {i.course.code: i.course.name for i in in_term}
    clash_with: dict[str, set[str]] = {}
    for c in conflicts:
        clash_with.setdefault(c.first, set()).add(names[c.second])
        clash_with.setdefault(c.second, set()).add(names[c.first])
    rows = [
        CourseRow(item, sections, sel, mine, tuple(sorted(clash_with.get(item.course.code, ()))))
        for item, sections, sel, mine in rows_raw
    ]
    rows.sort(key=lambda r: (not r.sections, r.item.course.category == "practice_education"))

    max_week = max((w for s in chosen.values() for m in s.meetings for w in m.weeks), default=16)
    picked = next((r for r in rows if r.item.course.code == pick), None)
    by_day: dict[int, list[Block]] = {}
    if picked:
        others = {c: s for c, s in chosen.items() if c != pick}
        groups = group_sections(picked, others, names)
        course = picked.item.course
        slots: dict[tuple, list[tuple[SectionGroup, Meeting]]] = {}
        for g in groups:
            for m in g.meetings:
                if week is None or week in m.weeks:
                    slots.setdefault((m.day, m.periods), []).append((g, m))
        for (day, _), found in slots.items():
            gs = tuple(dict.fromkeys(g for g, _ in found))
            by_day.setdefault(day, []).append(
                Block(course.code, course.name, course.category, gs[0].options[0].section, found[0][1],
                      all(g.conflicts for g in gs), groups=gs)
            )
        max_week = max([max_week] + [w for s in picked.sections for m in s.meetings for w in m.weeks])
    else:
        groups = []
    for code, s in chosen.items():
        if picked and code == pick:
            continue
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
        pick=Pick(picked, groups) if picked else None,
        chosen=chosen,
    )


def clashes(section: Section, others: dict[str, Section], names: dict[str, str]) -> tuple[str, ...]:
    """这个教学班和已选的哪些课冲突（课程名）。"""
    return tuple(
        sorted({names.get(code, code) for code, o in others.items() if any(overlap(a, b) for a in section.meetings for b in o.meetings)})
    )


def group_sections(row: CourseRow, others: dict[str, Section], names: dict[str, str]) -> list[SectionGroup]:
    """把一门课的教学班按上课时间分组：不冲突的在前，本班所在的组最前。"""
    groups: dict[tuple, list[SectionOption]] = {}
    meetings: dict[tuple, tuple[Meeting, ...]] = {}
    for s in row.sections:
        key = tuple(sorted((m.day, m.periods, m.weeks) for m in s.meetings))
        meetings.setdefault(key, tuple(sorted(s.meetings, key=lambda m: (m.day, m.periods))))
        groups.setdefault(key, []).append(
            SectionOption(s, clashes(s, others, names), s.seq in row.mine, row.chosen is not None and row.chosen.seq == s.seq)
        )
    result = [
        SectionGroup(f"g{i}", meetings[key], tuple(sorted(opts, key=lambda o: (not o.mine, o.section.closed, o.section.seq))))
        for i, (key, opts) in enumerate(groups.items())
    ]
    result.sort(key=lambda g: (bool(g.conflicts), not g.mine, not g.meetings, g.meetings and (g.meetings[0].day, g.meetings[0].periods)))
    return result


# ---------- 找课：某个空闲时间能上哪些课 ----------

FINDER_KINDS = ("培养方案", "通识选修", "经法管融通", "素质教育", "其他专业课")


def finder_kind(course: Course) -> str:
    if course.in_program:
        return "培养方案"
    if course.nature == "经法管融通":
        return "经法管融通"
    if course.category == "quality_education":
        return "素质教育"
    if course.nature == "选修" and course.category == "general_education":
        return "通识选修"
    return "其他专业课"


@dataclass(frozen=True)
class FinderCourse:
    course: Course
    sections: tuple[Section, ...]  # 在这个时间、和已选课程不冲突的教学班
    note: str | None = None  # 如「原计划在第 7 学期」

    @property
    def kind(self) -> str:
        return finder_kind(self.course)


@dataclass(frozen=True)
class Finder:
    day: int | None
    period: int | None
    q: str
    groups: list[tuple[str, list[FinderCourse]]]

    @property
    def title(self) -> str:
        if self.day is None:
            return "加课"
        return f"周{DAY_NAMES[self.day - 1]}第 {self.period} 节能上的课"

    @property
    def total(self) -> int:
        return sum(len(cs) for _, cs in self.groups)


def find_courses(
    semester: Semester | None,
    candidates: dict[str, tuple[Course, str | None]],
    chosen: dict[str, Section],
    day: int | None = None,
    period: int | None = None,
    q: str = "",
) -> Finder:
    """candidates：{课程号: (课程, 备注)}，可以加进本学期的课。

    有时间时：找在这个时间上课、且和已选教学班不冲突的教学班；只有搜索词时：按课程名找，列出不冲突的教学班。
    """
    found: dict[str, list[FinderCourse]] = {k: [] for k in FINDER_KINDS}
    q = q.strip()
    if semester and (day is not None or q):
        for code, (course, note) in candidates.items():
            if q and q.lower() not in course.name.lower() and q.upper() not in code:
                continue
            fitting = tuple(
                s
                for s in semester.sections.get(code, ())
                if s.meetings
                and (day is None or any(m.day == day and period in m.periods for m in s.meetings))
                and not any(overlap(a, b) for o in chosen.values() for a in s.meetings for b in o.meetings)
            )
            if fitting:
                found[finder_kind(course)].append(FinderCourse(course, fitting, note))
    for courses in found.values():
        courses.sort(key=lambda c: (q and not c.course.name.startswith(q), -len(c.sections), c.course.name))
    return Finder(day, period, q, [(k, v) for k, v in found.items() if v])
