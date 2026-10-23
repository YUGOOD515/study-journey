"""八学期时间轴：把计划整理成按学期分列的视图数据，并给出排课提醒。"""
from __future__ import annotations

from dataclasses import dataclass

from .catalog import CATEGORY_ORDER, TERMS
from .plan import Calendar, PlanItem

NATURE_ORDER = {"必修": 0, "选修": 1, "经法管融通": 2, "跨专业": 3}


@dataclass(frozen=True)
class Card:
    item: PlanItem
    warning: str | None = None


@dataclass(frozen=True)
class TermColumn:
    term: int
    label: str
    cards: list[Card]
    is_current: bool
    is_past: bool

    @property
    def credits(self) -> float:
        return sum(c.item.course.credits for c in self.cards if c.item.status != "未通过")


@dataclass(frozen=True)
class Timeline:
    years: list[list[TermColumn]]  # 每学年两列
    pending: dict[str, list[Card]]  # 按类别分组的待安排课程


def sort_key(item: PlanItem):
    c = item.course
    return (CATEGORY_ORDER.index(c.category), NATURE_ORDER.get(c.nature, 9), c.code)


def warning_for(item: PlanItem, terms: dict[str, int | None], names: dict[str, str]) -> str | None:
    if item.locked or item.term is None:
        return None
    notes = []
    allowed = item.course.allowed_terms
    if item.term not in allowed:
        notes.append(f"培养方案建议在第 {allowed[0]}{'–' + str(allowed[-1]) if len(allowed) > 1 else ''} 学期修读")
    pre = item.course.prerequisite_code
    if pre and pre in terms:
        pre_term = terms[pre]
        if pre_term is None or pre_term >= item.term:
            notes.append(f"先修课「{names[pre]}」需安排在更早的学期")
    return "；".join(notes) or None


def build(items: list[PlanItem], calendar: Calendar) -> Timeline:
    terms = {i.course.code: i.term for i in items}
    names = {i.course.code: i.course.name for i in items}
    by_term: dict[int | None, list[Card]] = {}
    for item in sorted(items, key=sort_key):
        by_term.setdefault(item.term, []).append(Card(item, warning_for(item, terms, names)))
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
    pending: dict[str, list[Card]] = {}
    for card in by_term.get(None, []):
        pending.setdefault(card.item.course.category, []).append(card)
    return Timeline(years=[columns[i : i + 2] for i in range(0, 8, 2)], pending=pending)
