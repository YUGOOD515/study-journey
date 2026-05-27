#!/usr/bin/env python3
"""
Import school source spreadsheets under src_data/ into raw_ tables.

This script intentionally keeps raw data separate from plan_ tables:
- 本科生选课 -> raw_term_course_sections
- 本科课程补退选 -> raw_term_added_courses
- 通识/专业/素质课程一览表 -> raw_course_catalog_previews
"""

from __future__ import annotations

import argparse
import re
import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


FINAL_KIND = "final"
ADD_KIND = "beginning_add"
CATALOG_KIND = "catalog_preview"


@dataclass(frozen=True)
class SourceFile:
    path: Path
    academic_year: str
    semester: str
    kind: str


def clean_text(value: Any) -> str | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    if text.endswith(".0"):
        head = text[:-2]
        if head.isdigit():
            return head
    return text


def clean_num(value: Any) -> float | None:
    text = clean_text(value)
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def clean_int(value: Any) -> int | None:
    n = clean_num(value)
    if n is None:
        return None
    return int(n)


def parse_source_file(path: Path) -> SourceFile | None:
    name = path.name
    if name == "培养方案.xlsx":
        return None

    year = re.search(r"(\d{4}-\d{4})学年", name)
    if not year:
        return None

    if "第1学期" in name:
        semester = "fall"
    elif "第2学期" in name:
        semester = "spring"
    else:
        return None

    if "本科生选课" in name:
        kind = FINAL_KIND
    elif "本科课程补退选" in name:
        kind = ADD_KIND
    elif "一览表" in name:
        kind = CATALOG_KIND
    else:
        return None

    return SourceFile(path=path, academic_year=year.group(1), semester=semester, kind=kind)


def first_nonempty_sheet(path: Path) -> tuple[str, pd.DataFrame]:
    workbook = pd.ExcelFile(path)
    for sheet in workbook.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet, header=None)
        df = df.dropna(how="all")
        if not df.empty:
            return sheet, df
    return workbook.sheet_names[0] if workbook.sheet_names else "Sheet1", pd.DataFrame()


def table_from_header(path: Path) -> tuple[str, pd.DataFrame]:
    sheet, df = first_nonempty_sheet(path)
    if df.empty:
        return sheet, df

    for index, row in df.iterrows():
        values = [clean_text(v) for v in row.tolist()]
        compact = [v for v in values if v]
        has_code = "课程编号" in compact or "课程号" in compact
        has_name = "课程名称" in compact or "课程名" in compact
        if has_code and has_name:
            headers = [v or f"__empty_{i}" for i, v in enumerate(values)]
            table = df.loc[index + 1 :].copy()
            table.columns = headers
            return sheet, table.dropna(how="all")

    raise ValueError(f"未找到表头行: {path.name}")


def pick(row: pd.Series, *names: str) -> Any:
    for name in names:
        if name in row.index:
            return row[name]
    return None


def ensure_schema(conn: sqlite3.Connection) -> None:
    columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(raw_term_course_sections)").fetchall()
    }
    if "classroom" not in columns:
        conn.execute("ALTER TABLE raw_term_course_sections ADD COLUMN classroom TEXT")
    if "group_name" not in columns:
        conn.execute("ALTER TABLE raw_term_course_sections ADD COLUMN group_name TEXT")

    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS raw_course_catalog_previews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            academic_year TEXT NOT NULL CHECK (academic_year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'),
            semester TEXT NOT NULL CHECK (semester IN ('spring', 'fall')),
            source_file TEXT NOT NULL CHECK (TRIM(source_file) <> ''),
            source_format TEXT CHECK (source_format IN ('xlsx', 'xls')),
            source_sheet TEXT,
            source_row INTEGER NOT NULL CHECK (source_row > 0),
            ordinal INTEGER,
            department TEXT,
            course_code TEXT NOT NULL CHECK (TRIM(course_code) <> ''),
            course_name TEXT NOT NULL CHECK (TRIM(course_name) <> ''),
            module_2022 TEXT,
            module_2024 TEXT,
            course_category TEXT,
            course_attribute TEXT,
            hours REAL CHECK (hours IS NULL OR hours >= 0),
            credits REAL CHECK (credits IS NULL OR credits >= 0),
            imported_at TEXT NOT NULL DEFAULT (datetime('now')),
            note TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_raw_catalog_preview_course_code
          ON raw_course_catalog_previews(course_code);
        CREATE INDEX IF NOT EXISTS idx_raw_catalog_preview_batch
          ON raw_course_catalog_previews(academic_year, semester);
        CREATE INDEX IF NOT EXISTS idx_raw_catalog_preview_module_2024
          ON raw_course_catalog_previews(module_2024);
        """
    )


def reset_raw_tables(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM raw_term_course_sections")
    conn.execute("DELETE FROM raw_term_added_courses")
    conn.execute("DELETE FROM raw_import_batches")
    conn.execute("DELETE FROM raw_course_catalog_previews")
    conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('raw_import_batches', 'raw_course_catalog_previews')")


def insert_batch(conn: sqlite3.Connection, source: SourceFile, note: str) -> int:
    cursor = conn.execute(
        """
        INSERT INTO raw_import_batches(academic_year, semester, phase, source_file, source_format, note)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            source.academic_year,
            source.semester,
            source.kind,
            source.path.name,
            source.path.suffix.lower().lstrip("."),
            note,
        ),
    )
    return int(cursor.lastrowid)


def import_final(conn: sqlite3.Connection, source: SourceFile) -> dict[str, int]:
    sheet, table = table_from_header(source.path)
    batch_id = insert_batch(conn, source, "本科生选课完整课程数据")
    inserted = 0
    skipped = 0

    for index, row in table.iterrows():
        course_code = clean_text(pick(row, "课程编号", "课程号"))
        section_code = clean_text(pick(row, "课序号"))
        course_name = clean_text(pick(row, "课程名称", "课程名"))
        if not course_code or not section_code or not course_name:
            skipped += 1
            continue

        conn.execute(
            """
            INSERT OR REPLACE INTO raw_term_course_sections(
                batch_id, course_code, section_code, course_name, hours, credits, teacher,
                class_time, teaching_weeks, enrollment_restriction, combined_class_name,
                campus, department, course_attribute, gender_requirement, enrollment_open,
                source_row, classroom, group_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                batch_id,
                course_code,
                section_code,
                course_name,
                clean_num(pick(row, "学时")),
                clean_num(pick(row, "学分")),
                clean_text(pick(row, "上课教师")),
                clean_text(pick(row, "上课时间")),
                clean_text(pick(row, "上课周次")),
                clean_text(pick(row, "选课限制说明")),
                clean_text(pick(row, "合班名称")),
                clean_text(pick(row, "上课校区")),
                clean_text(pick(row, "开课单位")),
                clean_text(pick(row, "课程属性")),
                clean_text(pick(row, "性别要求")),
                clean_text(pick(row, "选课开放")),
                int(index) + 1,
                clean_text(pick(row, "上课地点")),
                clean_text(pick(row, "分组名称")),
            ),
        )
        inserted += 1

    return {"inserted": inserted, "skipped": skipped, "batch_id": batch_id}


def import_added(conn: sqlite3.Connection, source: SourceFile) -> dict[str, int]:
    sheet, table = table_from_header(source.path)
    batch_id = insert_batch(conn, source, "本科课程补退选/新增课程数据")
    inserted = 0
    duplicate = 0
    skipped = 0
    seen: set[str] = set()

    for index, row in table.iterrows():
        course_code = clean_text(pick(row, "课程编号", "课程号"))
        course_name = clean_text(pick(row, "课程名称", "课程名"))
        if not course_code or not course_name:
            skipped += 1
            continue
        if course_code in seen:
            duplicate += 1
            continue
        seen.add(course_code)

        conn.execute(
            """
            INSERT INTO raw_term_added_courses(
                batch_id, course_code, course_name, department, learning_platform, credits,
                class_time, enrollment_restriction, module_2022, module_2024, remark1,
                remark2, source_row
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                batch_id,
                course_code,
                course_name,
                clean_text(pick(row, "开课单位")),
                clean_text(pick(row, "学习平台")),
                clean_num(pick(row, "学分")),
                clean_text(pick(row, "上课时间")),
                clean_text(pick(row, "选课限制说明")),
                clean_text(pick(row, "所属模块（适用2022版）", "所属模块(2022版)")),
                clean_text(pick(row, "所属模块（适用2024版）")),
                clean_text(pick(row, "备注1", "备注")),
                clean_text(pick(row, "备注2")),
                int(index) + 1,
            ),
        )
        inserted += 1

    return {"inserted": inserted, "skipped": skipped, "duplicate": duplicate, "batch_id": batch_id}


def import_catalog(conn: sqlite3.Connection, source: SourceFile) -> dict[str, int]:
    sheet, table = table_from_header(source.path)
    inserted = 0
    skipped = 0

    for index, row in table.iterrows():
        course_code = clean_text(pick(row, "课程编号", "课程号"))
        course_name = clean_text(pick(row, "课程名称", "课程名"))
        if not course_code or not course_name:
            skipped += 1
            continue

        conn.execute(
            """
            INSERT INTO raw_course_catalog_previews(
                academic_year, semester, source_file, source_format, source_sheet,
                source_row, ordinal, department, course_code, course_name, module_2022,
                module_2024, course_category, course_attribute, hours, credits
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source.academic_year,
                source.semester,
                source.path.name,
                source.path.suffix.lower().lstrip("."),
                sheet,
                int(index) + 1,
                clean_int(pick(row, "序号")),
                clean_text(pick(row, "开课单位")),
                course_code,
                course_name,
                clean_text(pick(row, "所属模块（适用2022版）", "所属模块(2022版)")),
                clean_text(pick(row, "所属模块（适用2024版）")),
                clean_text(pick(row, "课程类别")),
                clean_text(pick(row, "课程属性")),
                clean_num(pick(row, "学时")),
                clean_num(pick(row, "学分")),
            ),
        )
        inserted += 1

    return {"inserted": inserted, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="db/course_planner_v2.sqlite")
    parser.add_argument("--src", default="src_data")
    parser.add_argument("--no-backup", action="store_true")
    args = parser.parse_args()

    db_path = Path(args.db)
    src_dir = Path(args.src)
    if not db_path.exists():
        raise SystemExit(f"数据库不存在: {db_path}")
    if not src_dir.exists():
        raise SystemExit(f"数据目录不存在: {src_dir}")

    if not args.no_backup:
        backup = db_path.with_suffix(db_path.suffix + ".bak_before_src_data_import")
        shutil.copy2(db_path, backup)
        print(f"backup={backup}")

    sources = [s for p in sorted(src_dir.iterdir(), key=lambda x: x.name) if (s := parse_source_file(p))]
    if not sources:
        raise SystemExit("没有识别到可导入的源文件")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        ensure_schema(conn)
        reset_raw_tables(conn)

        summary: list[tuple[str, str, dict[str, int]]] = []
        for source in sources:
            if source.kind == FINAL_KIND:
                result = import_final(conn, source)
            elif source.kind == ADD_KIND:
                result = import_added(conn, source)
            elif source.kind == CATALOG_KIND:
                result = import_catalog(conn, source)
            else:
                continue
            summary.append((source.kind, source.path.name, result))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    for kind, name, result in summary:
        print(f"{kind}: {name} -> {result}")


if __name__ == "__main__":
    main()
