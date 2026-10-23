"""演示数据：固定的一位大三同学，访客的改动只存在自己的浏览器会话里。"""
from __future__ import annotations

import json
from collections.abc import MutableMapping
from datetime import date

from .catalog import DATA_DIR, Catalog, Course
from .plan import Calendar, PlanItem, check_move

SESSION_KEY = "demo_moves"
SECTIONS_KEY = "demo_sections"


def demo_calendar(today: date | None = None) -> Calendar:
    """让演示同学永远在读大三：秋季是第 5 学期，春季是第 6 学期。"""
    today = today or date.today()
    academic_start = today.year if today.month >= 8 else today.year - 1
    is_fall = today.month >= 8 or today.month == 1
    return Calendar(enrollment_year=academic_start - 2, current_term=5 if is_fall else 6)


def _status(term: int, current: int) -> str:
    if term < current:
        return "已修读"
    return "正在修读" if term == current else "计划修读"


class DemoRepository:
    def __init__(self, catalog: Catalog, session: MutableMapping):
        self.catalog = catalog
        self.session = session
        self.calendar = demo_calendar()

    def _base(self) -> dict[str, PlanItem]:
        raw = json.loads((DATA_DIR / "demo.json").read_text(encoding="utf-8"))
        base: dict[str, PlanItem] = {}
        for entry in raw["courses"]:
            if custom := entry.get("custom"):
                course = Course(code=entry["code"], in_program=False, **custom)
            else:
                course = self.catalog.courses[entry["code"]]
            status = _status(entry["term"], self.calendar.current_term)
            score = entry.get("score") if status == "已修读" else None
            base[course.code] = PlanItem(course, entry["term"], status, score)
        # 培养方案里没选的课程放进“待安排”
        for code, course in self.catalog.courses.items():
            base.setdefault(code, PlanItem(course, None, "未修读"))
        return base

    def items(self) -> list[PlanItem]:
        items = self._base()
        for code, term in self.session.get(SESSION_KEY, {}).items():
            if code in items and not items[code].locked:
                items[code] = items[code].moved_to(term)
        return list(items.values())

    def move(self, code: str, term: int | None) -> None:
        current = {i.course.code: i for i in self.items()}
        check_move(current.get(code), term, self.calendar)
        moves = dict(self.session.get(SESSION_KEY, {}))
        moves[code] = term
        self.session[SESSION_KEY] = moves

    def reset(self) -> None:
        self.session.pop(SESSION_KEY, None)
        self.session.pop(SECTIONS_KEY, None)

    def choices(self, term: int) -> dict[str, str] | None:
        found = self.session.get(SECTIONS_KEY, {}).get(str(term))
        return dict(found) if found is not None else None

    def choose(self, term: int, picks: dict[str, str | None]) -> None:
        all_terms = dict(self.session.get(SECTIONS_KEY, {}))
        current = dict(all_terms.get(str(term), {}))
        for code, seq in picks.items():
            if seq is None:
                current.pop(code, None)
            else:
                current[code] = seq
        all_terms[str(term)] = current
        self.session[SECTIONS_KEY] = all_terms

    def clear_choices(self, term: int) -> None:
        all_terms = dict(self.session.get(SECTIONS_KEY, {}))
        all_terms[str(term)] = {}
        self.session[SECTIONS_KEY] = all_terms

    @property
    def my_class(self) -> str:
        """演示同学是数字金融专业 1 班。"""
        return f"数金{self.calendar.enrollment_year % 100:02d}01班"
