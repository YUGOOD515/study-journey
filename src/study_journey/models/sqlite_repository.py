"""本地版：计划存在本机的 SQLite 文件里。"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from .catalog import Catalog
from .plan import Calendar, PlanItem, check_move

SCHEMA = """
CREATE TABLE IF NOT EXISTS plan_items (
    code   TEXT PRIMARY KEY,
    term   INTEGER CHECK (term IS NULL OR term BETWEEN 1 AND 8),
    status TEXT NOT NULL DEFAULT '计划修读'
           CHECK (status IN ('未修读', '计划修读', '正在修读', '已修读', '未通过')),
    score  REAL CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    def items(self) -> list[PlanItem]:
        rows = {r["code"]: r for r in self.db.execute("SELECT * FROM plan_items")}
        items = []
        for code, course in self.catalog.courses.items():
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
