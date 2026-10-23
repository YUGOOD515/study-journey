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
        """已修读、正在修读、未通过的课程是修读记录：只有在编辑模式里才能调整。"""
        return self.status not in ("未修读", "计划修读")

    def moved_to(self, term: int | None, current_term: int) -> "PlanItem":
        """换学期后的状态跟着学期走：过去 = 已修读（原来就有的成绩和“未通过”保留），
        本学期 = 正在修读 / 计划修读，以后 = 计划修读，待安排 = 未修读。"""
        if term is None:
            return replace(self, term=None, status="未修读", score=None)
        if term < current_term:
            if self.status in ("已修读", "未通过"):
                return replace(self, term=term)
            return replace(self, term=term, status="已修读", score=None)
        if term == current_term:
            return replace(self, term=term, status="正在修读" if self.locked else "计划修读", score=None)
        return replace(self, term=term, status="计划修读", score=None)


@dataclass(frozen=True)
class Calendar:
    enrollment_year: int
    current_term: int

    def label(self, term: int) -> str:
        start = self.enrollment_year + (term - 1) // 2
        return f"{start} 秋" if term % 2 else f"{start + 1} 春"

    def semester_id(self, term: int) -> str:
        """第 term 学期对应的学校学期编号，如 2024 级第 5 学期 → '2026-2027-1'。"""
        start = self.enrollment_year + (term - 1) // 2
        return f"{start}-{start + 1}-{1 if term % 2 else 2}"

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

    def record(self, code: str, term: int | None, status: str, score: float | None) -> None:
        """直接写入一门课的学期、状态和成绩（编辑历史记录、撤销改动）。"""
        ...

    def reset(self) -> None: ...

    def choices(self, term: int) -> dict[str, str] | None:
        """某学期选定的教学班 {课程号: 课序号}；从没设置过返回 None。"""
        ...

    def choose(self, term: int, picks: dict[str, str | None]) -> None:
        """设置教学班；课序号为 None 表示取消选择。"""
        ...

    def clear_choices(self, term: int) -> None: ...

    def add(self, course: Course, term: int) -> None:
        """加入培养方案以外的课程（自选课程）。"""
        ...

    def remove(self, code: str) -> None:
        """移除自选课程；培养方案里的课程只能移回待安排。"""
        ...


def stage(term: int) -> str:
    return ("大一", "大二", "大三", "大四")[(term - 1) // 2] + ("上" if term % 2 else "下")


def check_add(existing: PlanItem | None, course: Course, term: int, calendar: Calendar) -> None:
    if existing is not None and existing.term is not None:
        raise MoveError(f"「{course.name}」已经安排在{stage(existing.term)}。")
    if term not in TERMS or term < calendar.current_term:
        raise MoveError(f"新加的课只能安排到{stage(calendar.current_term)}及以后。")


def check_move(item: PlanItem | None, term: int | None) -> None:
    """编辑模式里任何课程都能换到任何学期（包括已经过去的学期，用来修正修读记录）。"""
    if item is None:
        raise MoveError("找不到这门课程。")
    if term is not None and term not in TERMS:
        raise MoveError("学期不对。")


def check_record(item: PlanItem | None, term: int | None, status: str, score: float | None, calendar: Calendar) -> None:
    """状态要和学期对得上；成绩只有过去学期的课才有。"""
    check_move(item, term)
    if term is None:
        allowed = ("未修读",)
    elif term < calendar.current_term:
        allowed = ("已修读", "未通过")
    elif term == calendar.current_term:
        allowed = ("正在修读", "计划修读")
    else:
        allowed = ("计划修读",)
    if status not in allowed:
        raise MoveError(f"{stage(term) if term else '待安排'}的课只能是：{'、'.join(allowed)}。")
    if score is not None and (status not in ("已修读", "未通过") or not 0 <= score <= 100):
        raise MoveError("成绩要在 0–100 之间，而且只有已经修完的课才有成绩。")
