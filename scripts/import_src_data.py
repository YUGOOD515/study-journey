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
ACTUAL_KIND = "actual_schedule"
BASE_TERM_START_YEAR = 2024


@dataclass(frozen=True)
class SourceFile:
    path: Path
    academic_year: str
    semester: str
    kind: str
    term_number: int | None = None


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

    actual = re.match(r"(?P<year>\d{4}-\d{4})-(?P<sem>[12])-有课表课程\.xls[x]?$", name)
    if actual:
        sem_no = int(actual.group("sem"))
        start_year = int(actual.group("year").split("-")[0])
        term_number = (start_year - BASE_TERM_START_YEAR) * 2 + sem_no
        return SourceFile(
            path=path,
            academic_year=actual.group("year"),
            semester="fall" if sem_no == 1 else "spring",
            kind=ACTUAL_KIND,
            term_number=term_number,
        )

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


def section_code_or_source_row(value: Any, source_row: int) -> str:
    text = clean_text(value)
    return text if text is not None else f"__missing_source_row_{source_row}"


WEEKDAY_MAP = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "日": 7,
    "天": 7,
}

CLASS_TIME_RE = re.compile(
    r"(?P<weeks>[0-9,\-，、]+)周\s*星期(?P<weekday>[一二三四五六日天])\s*(?P<periods>\d+)节"
)


def split_locations(value: str | None) -> list[str | None]:
    if value is None:
        return []
    return [part.strip() or None for part in re.split(r"[,，]", value)]


def parse_week_intervals(text: str) -> list[tuple[int, int]]:
    intervals: list[tuple[int, int]] = []
    for part in re.split(r"[,，、]", text):
        token = part.strip()
        if not token:
            continue
        if "-" in token:
            start_text, end_text = token.split("-", 1)
            start = int(start_text)
            end = int(end_text)
        else:
            start = end = int(token)
        if end < start:
            start, end = end, start
        intervals.append((start, end))
    return intervals


def parse_period_range(text: str) -> tuple[int, int]:
    if len(text) % 2 != 0:
        raise ValueError(f"无法解析节次: {text}")
    periods = [int(text[i : i + 2]) for i in range(0, len(text), 2)]
    return periods[0], periods[-1]


def parse_actual_meetings(class_time: str | None, location_raw: str | None) -> list[dict[str, Any]]:
    if not class_time:
        return []

    locations = split_locations(location_raw)
    meetings: list[dict[str, Any]] = []
    matches = list(CLASS_TIME_RE.finditer(class_time))
    for slot_index, match in enumerate(matches):
        start_period, end_period = parse_period_range(match.group("periods"))
        weekday = WEEKDAY_MAP[match.group("weekday")]
        location = (
            locations[slot_index]
            if slot_index < len(locations)
            else locations[-1]
            if locations
            else None
        )
        for start_week, end_week in parse_week_intervals(match.group("weeks")):
            meetings.append(
                {
                    "start_week": start_week,
                    "end_week": end_week,
                    "weekday": weekday,
                    "start_period": start_period,
                    "end_period": end_period,
                    "location_text": location,
                }
            )
    return meetings


def ensure_actual_schedule_phase(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='raw_import_batches'"
    ).fetchone()
    if not row or "actual_schedule" in row[0]:
        return

    sql = row[0]
    sql = sql.replace(
        "phase TEXT NOT NULL CHECK (phase IN ('final', 'beginning_add'))",
        "phase TEXT NOT NULL CHECK (phase IN ('final', 'beginning_add', 'actual_schedule'))",
    ).replace(
        "phase TEXT NOT NULL CHECK (phase IN ('final','beginning_add'))",
        "phase TEXT NOT NULL CHECK (phase IN ('final','beginning_add','actual_schedule'))",
    )
    if sql == row[0]:
        raise RuntimeError("无法自动扩展 raw_import_batches.phase 的 CHECK 约束")

    conn.execute("PRAGMA writable_schema = ON")
    conn.execute(
        "UPDATE sqlite_master SET sql = ? WHERE type='table' AND name='raw_import_batches'",
        (sql,),
    )
    conn.execute("PRAGMA writable_schema = OFF")
    version = conn.execute("PRAGMA schema_version").fetchone()[0]
    conn.execute(f"PRAGMA schema_version = {int(version) + 1}")


def ensure_schema(conn: sqlite3.Connection) -> None:
    ensure_actual_schedule_phase(conn)

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

        CREATE TABLE IF NOT EXISTS raw_actual_course_meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL,
            term INTEGER NOT NULL CHECK (term BETWEEN 1 AND 8),
            course_code TEXT NOT NULL CHECK (TRIM(course_code) <> ''),
            section_code TEXT NOT NULL CHECK (TRIM(section_code) <> ''),
            meeting_no INTEGER NOT NULL CHECK (meeting_no > 0),
            start_week INTEGER NOT NULL CHECK (start_week > 0),
            end_week INTEGER NOT NULL CHECK (end_week >= start_week),
            weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
            start_period INTEGER NOT NULL CHECK (start_period > 0),
            end_period INTEGER NOT NULL CHECK (end_period >= start_period),
            location_text TEXT,
            course_name TEXT NOT NULL CHECK (TRIM(course_name) <> ''),
            teacher TEXT,
            class_group TEXT,
            course_nature TEXT,
            course_attribute TEXT,
            class_time_raw TEXT,
            location_raw TEXT,
            online_group TEXT,
            online_url TEXT,
            qr_code TEXT,
            source_sheet TEXT,
            source_row INTEGER NOT NULL CHECK (source_row > 0),
            imported_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(batch_id, source_row, meeting_no),
            FOREIGN KEY (batch_id)
              REFERENCES raw_import_batches(id)
              ON UPDATE CASCADE
              ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_raw_actual_course_meetings_term
          ON raw_actual_course_meetings(term, weekday, start_period, end_period);
        CREATE INDEX IF NOT EXISTS idx_raw_actual_course_meetings_course
          ON raw_actual_course_meetings(course_code, section_code);
        CREATE INDEX IF NOT EXISTS idx_raw_actual_course_meetings_week
          ON raw_actual_course_meetings(term, start_week, end_week);
        """
    )


def reset_raw_tables(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM raw_term_course_sections")
    conn.execute("DELETE FROM raw_term_added_courses")
    conn.execute("DELETE FROM raw_course_catalog_previews")
    conn.execute("DELETE FROM raw_actual_course_meetings")
    conn.execute("DELETE FROM raw_import_batches")
    conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('raw_import_batches', 'raw_course_catalog_previews', 'raw_actual_course_meetings')")


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
        source_row = int(index) + 1
        section_code = section_code_or_source_row(pick(row, "课序号"), source_row)
        course_name = clean_text(pick(row, "课程名称", "课程名"))
        if not course_code or not course_name:
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
                source_row,
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


def import_actual_schedule(conn: sqlite3.Connection, source: SourceFile) -> dict[str, int]:
    if source.term_number is None:
        raise ValueError(f"实际课表缺少 term_number: {source.path.name}")

    sheet, table = table_from_header(source.path)
    batch_id = insert_batch(conn, source, "实际课表课程数据")
    courses = 0
    meetings = 0
    skipped_courses = 0
    parse_failed = 0

    for index, row in table.iterrows():
        course_code = clean_text(pick(row, "课程编号", "课程号"))
        section_code = clean_text(pick(row, "课序号"))
        course_name = clean_text(pick(row, "课程名称", "课程名"))
        class_time_raw = clean_text(pick(row, "上课时间"))
        location_raw = clean_text(pick(row, "上课地点"))

        if not course_code or not section_code or not course_name:
            skipped_courses += 1
            continue

        try:
            parsed_meetings = parse_actual_meetings(class_time_raw, location_raw)
        except ValueError:
            parsed_meetings = []

        if not parsed_meetings:
            parse_failed += 1
            continue

        courses += 1
        for meeting_no, meeting in enumerate(parsed_meetings, start=1):
            conn.execute(
                """
                INSERT INTO raw_actual_course_meetings(
                    batch_id, term, course_code, section_code, meeting_no,
                    start_week, end_week, weekday, start_period, end_period, location_text,
                    course_name, teacher, class_group, course_nature, course_attribute,
                    class_time_raw, location_raw, online_group, online_url, qr_code,
                    source_sheet, source_row
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    batch_id,
                    source.term_number,
                    course_code,
                    section_code,
                    meeting_no,
                    meeting["start_week"],
                    meeting["end_week"],
                    meeting["weekday"],
                    meeting["start_period"],
                    meeting["end_period"],
                    meeting["location_text"],
                    course_name,
                    clean_text(pick(row, "授课教师", "上课教师")),
                    clean_text(pick(row, "上课班级", "合班名称")),
                    clean_text(pick(row, "课程性质")),
                    clean_text(pick(row, "课程属性")),
                    class_time_raw,
                    location_raw,
                    clean_text(pick(row, "网课群号")),
                    clean_text(pick(row, "网课链接网址")),
                    clean_text(pick(row, "二维码")),
                    sheet,
                    int(index) + 1,
                ),
            )
            meetings += 1

    return {
        "courses": courses,
        "meetings": meetings,
        "skipped_courses": skipped_courses,
        "parse_failed": parse_failed,
        "batch_id": batch_id,
    }


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
            elif source.kind == ACTUAL_KIND:
                result = import_actual_schedule(conn, source)
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
