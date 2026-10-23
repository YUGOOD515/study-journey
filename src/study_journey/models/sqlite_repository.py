"""本地版：计划存在本机的 SQLite 文件里。"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from .catalog import Catalog, Course
from .plan import Calendar, MoveError, PlanItem, check_add, check_move

SCHEMA = """
CREATE TABLE IF NOT EXISTS plan_items (
    code   TEXT PRIMARY KEY,
    term   INTEGER CHECK (term IS NULL OR term BETWEEN 1 AND 8),
    status TEXT NOT NULL DEFAULT '计划修读'
           CHECK (status IN ('未修读', '计划修读', '正在修读', '已修读', '未通过')),
    score  REAL CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 学期课表：每学期每门课选定的教学班（课序号）
CREATE TABLE IF NOT EXISTS section_choices (
    term INTEGER NOT NULL CHECK (term BETWEEN 1 AND 8),
    code TEXT NOT NULL,
    seq  TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (term, code)
);
-- 培养方案以外、自己加的课程（通识选修、经法管融通、跨专业……）
CREATE TABLE IF NOT EXISTS custom_courses (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    nature      TEXT NOT NULL,
    credits     REAL NOT NULL,
    subcategory TEXT
);
CREATE TABLE IF NOT EXISTS section_terms (
    term INTEGER PRIMARY KEY  -- 设置过课表的学期（区分「没选」和「选完又清空」）
);
"""


class SqliteRepository:
    def __init__(self, catalog: Catalog, path: Path, calendar: Calendar):
        self.catalog = catalog
        self.calendar = calendar
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        if not self.db.execute("SELECT 1 FROM plan_items LIMIT 1").fetchone():
            self.reset()

    def courses(self) -> dict[str, Course]:
        found = dict(self.catalog.courses)
        for r in self.db.execute("SELECT * FROM custom_courses"):
            found.setdefault(r["code"], Course(
                code=r["code"], name=r["name"], category=r["category"], nature=r["nature"],
                credits=r["credits"], subcategory=r["subcategory"], in_program=False,
            ))
        return found

    def items(self) -> list[PlanItem]:
        rows = {r["code"]: r for r in self.db.execute("SELECT * FROM plan_items")}
        items = []
        for code, course in self.courses().items():
            r = rows.get(code)
            if r is None:
                items.append(PlanItem(course, None, "未修读"))
            else:
                items.append(PlanItem(course, r["term"], r["status"], r["score"]))
        return items

    def move(self, code: str, term: int | None) -> None:
        current = {i.course.code: i for i in self.items()}
        check_move(current.get(code), term, self.calendar)
        status = "计划修读" if term else "未修读"
        with self.db:
            self.db.execute(
                """INSERT INTO plan_items(code, term, status) VALUES (?, ?, ?)
                   ON CONFLICT(code) DO UPDATE SET term = excluded.term, status = excluded.status,
                   updated_at = datetime('now')""",
                (code, term, status),
            )

    def reset(self) -> None:
        """恢复为培养方案的默认安排：必修课按建议学期，选修课待安排。"""
        with self.db:
            self.db.execute("DELETE FROM plan_items")
            for code, course in self.catalog.courses.items():
                allowed = course.allowed_terms
                term = allowed[0] if course.is_required and len(allowed) < 8 else None
                if term is not None and term < self.calendar.current_term:
                    term = None  # 过去学期的修读记录要从教务系统导入，这里不猜
                self.db.execute(
                    "INSERT INTO plan_items(code, term, status) VALUES (?, ?, ?)",
                    (code, term, "计划修读" if term else "未修读"),
                )

    def choices(self, term: int) -> dict[str, str] | None:
        if not self.db.execute("SELECT 1 FROM section_terms WHERE term = ?", (term,)).fetchone():
            return None
        rows = self.db.execute("SELECT code, seq FROM section_choices WHERE term = ?", (term,))
        return {r["code"]: r["seq"] for r in rows}

    def choose(self, term: int, picks: dict[str, str | None]) -> None:
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO section_terms(term) VALUES (?)", (term,))
            for code, seq in picks.items():
                if seq is None:
                    self.db.execute("DELETE FROM section_choices WHERE term = ? AND code = ?", (term, code))
                else:
                    self.db.execute(
                        """INSERT INTO section_choices(term, code, seq) VALUES (?, ?, ?)
                           ON CONFLICT(term, code) DO UPDATE SET seq = excluded.seq, updated_at = datetime('now')""",
                        (term, code, seq),
                    )

    def clear_choices(self, term: int) -> None:
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO section_terms(term) VALUES (?)", (term,))
            self.db.execute("DELETE FROM section_choices WHERE term = ?", (term,))

    def add(self, course: Course, term: int) -> None:
        current = {i.course.code: i for i in self.items()}
        check_add(current.get(course.code), course, term, self.calendar)
        if course.code in self.catalog.courses:
            return self.move(course.code, term)
        with self.db:
            self.db.execute(
                """INSERT OR REPLACE INTO custom_courses(code, name, category, nature, credits, subcategory)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (course.code, course.name, course.category, course.nature, course.credits, course.subcategory),
            )
            self.db.execute(
                """INSERT INTO plan_items(code, term, status) VALUES (?, ?, '计划修读')
                   ON CONFLICT(code) DO UPDATE SET term = excluded.term, status = excluded.status""",
                (course.code, term),
            )

    def remove(self, code: str) -> None:
        if code in self.catalog.courses:
            return self.move(code, None)
        item = next((i for i in self.items() if i.course.code == code), None)
        if item is None:
            raise MoveError("找不到这门课程。")
        if item.locked:
            raise MoveError(f"「{item.course.name}」{item.status}，不能移除。")
        with self.db:
            self.db.execute("DELETE FROM custom_courses WHERE code = ?", (code,))
            self.db.execute("DELETE FROM plan_items WHERE code = ?", (code,))
            self.db.execute("DELETE FROM section_choices WHERE code = ?", (code,))
