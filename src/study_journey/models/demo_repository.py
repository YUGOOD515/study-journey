"""演示数据：固定的一位大三同学，访客的改动只存在自己的浏览器会话里。"""
from __future__ import annotations

import json
from collections.abc import MutableMapping
from dataclasses import replace
from datetime import date

from .catalog import DATA_DIR, Catalog, Course
from .plan import Calendar, MoveError, PlanItem, check_add, check_move, check_record

SESSION_KEY = "demo_moves"
SECTIONS_KEY = "demo_sections"
CUSTOM_KEY = "demo_custom"  # 访客自己加的课程 {课程号: 课程字段}


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
        for code, fields in self.session.get(CUSTOM_KEY, {}).items():
            if code not in items:
                items[code] = PlanItem(Course(code=code, in_program=False, **fields), None, "未修读")
        # 访客的改动：{课程号: {"term", "status", "score"}}（旧版只存了学期号）
        for code, saved in self.session.get(SESSION_KEY, {}).items():
            if code not in items:
                continue
            if isinstance(saved, dict):
                items[code] = replace(items[code], term=saved["term"], status=saved["status"], score=saved.get("score"))
            elif not items[code].locked:
                items[code] = items[code].moved_to(saved, self.calendar.current_term)
        return list(items.values())

    def move(self, code: str, term: int | None) -> None:
        item = {i.course.code: i for i in self.items()}.get(code)
        check_move(item, term)
        moved = item.moved_to(term, self.calendar.current_term)
        self._write(code, moved.term, moved.status, moved.score)

    def record(self, code: str, term: int | None, status: str, score: float | None) -> None:
        item = {i.course.code: i for i in self.items()}.get(code)
        check_record(item, term, status, score, self.calendar)
        self._write(code, term, status, score)

    def _write(self, code: str, term: int | None, status: str, score: float | None) -> None:
        moves = dict(self.session.get(SESSION_KEY, {}))
        moves[code] = {"term": term, "status": status, "score": score}
        self.session[SESSION_KEY] = moves

    def reset(self) -> None:
        self.session.pop(SESSION_KEY, None)
        self.session.pop(SECTIONS_KEY, None)
        self.session.pop(CUSTOM_KEY, None)

    def add(self, course: Course, term: int) -> None:
        current = {i.course.code: i for i in self.items()}
        check_add(current.get(course.code), course, term, self.calendar)
        if course.code not in current:
            custom = dict(self.session.get(CUSTOM_KEY, {}))
            custom[course.code] = {
                "name": course.name, "category": course.category, "nature": course.nature,
                "credits": course.credits, "subcategory": course.subcategory,
            }
            self.session[CUSTOM_KEY] = custom
        self.move(course.code, term)

    def remove(self, code: str) -> None:
        custom = dict(self.session.get(CUSTOM_KEY, {}))
        if code not in custom:
            return self.move(code, None)  # 培养方案里的课程（或演示自带的课程）移回待安排
        current = {i.course.code: i for i in self.items()}
        if current[code].locked:
            raise MoveError(f"「{current[code].course.name}」{current[code].status}，不能移除。")
        custom.pop(code)
        self.session[CUSTOM_KEY] = custom
        moves = dict(self.session.get(SESSION_KEY, {}))
        moves.pop(code, None)
        self.session[SESSION_KEY] = moves

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
