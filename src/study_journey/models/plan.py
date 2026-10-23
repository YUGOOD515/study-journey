"""我的计划：每门课落在哪个学期、修读状态与成绩。"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date
from typing import Protocol

from .catalog import TERMS, Course

STATUSES = ("未修读", "计划修读", "正在修读", "已修读", "未通过")


@dataclass(frozen=True)
class PlanItem:
    course: Course
    term: int | None  # None = 待安排
    status: str = "计划修读"
    score: float | None = None

    @property
    def locked(self) -> bool:
        """已修读、正在修读、未通过的课程是事实记录，不能在规划里挪动。"""
        return self.status not in ("未修读", "计划修读")

    def moved_to(self, term: int | None) -> "PlanItem":
        return replace(self, term=term, status="计划修读" if term else "未修读")


@dataclass(frozen=True)
class Calendar:
    enrollment_year: int
    current_term: int

    def label(self, term: int) -> str:
        start = self.enrollment_year + (term - 1) // 2
        return f"{start} 秋" if term % 2 else f"{start + 1} 春"

    def year_label(self, year_index: int) -> str:
        start = self.enrollment_year + year_index
        return f"{start}–{start + 1}"


def calendar_for(enrollment_year: int, today: date | None = None) -> Calendar:
    """按北京时间习惯：8 月起为秋季学期，2 月起为春季学期。"""
    today = today or date.today()
    academic_start = today.year if today.month >= 8 else today.year - 1
    is_fall = today.month >= 8 or today.month == 1
    term = (academic_start - enrollment_year) * 2 + (1 if is_fall else 2)
    return Calendar(enrollment_year, min(max(term, 1), 8))


class MoveError(ValueError):
    pass


class PlanRepository(Protocol):
    calendar: Calendar

    def items(self) -> list[PlanItem]: ...

    def move(self, code: str, term: int | None) -> None: ...

    def reset(self) -> None: ...


def check_move(item: PlanItem | None, term: int | None, calendar: Calendar) -> None:
    """规划规则：只能安排未锁定的课程，且只能排到本学期及以后。"""
    if item is None:
        raise MoveError("找不到这门课程。")
    if item.locked:
        raise MoveError(f"「{item.course.name}」{item.status}，不能调整学期。")
    if term is not None and (term not in TERMS or term < calendar.current_term):
        raise MoveError(f"只能安排到第 {calendar.current_term}–8 学期。")
