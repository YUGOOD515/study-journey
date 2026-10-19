#!/usr/bin/env python3
"""从本地 SQLite（单用户版数据库）生成 Cloudflare D1 导入用的 SQL。

输出（默认写到仓库根目录 .d1-data/，已加入 .gitignore，不要提交）：

  public.sql    公共数据：开课批次、开课表、补选课、课程目录、培养方案及学分要求。
                培养方案里的个人状态（计划学期、修读状态、成绩、删除标记）会被清空。
  personal.sql  （传入 --email 时生成）把你的个人计划、成绩和课表导入到该邮箱对应的账号。
                账号需先在网站上注册；执行时会先清掉该账号现有的计划和课表。

用法：
  python3 scripts/build_d1_seed.py                              # 只生成 public.sql
  python3 scripts/build_d1_seed.py --email you@example.com      # 同时生成 personal.sql
  cd app && npx wrangler d1 execute study-journey --remote --file=../.d1-data/public.sql
"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "db" / "course_planner_v2.sqlite"
DEFAULT_OUT = ROOT / ".d1-data"
CHUNK_BYTES = 50_000  # D1 单条 SQL 上限 100KB（按 UTF-8 字节计），留余量

SHARED_TABLES = [
    "raw_import_batches",
    "raw_term_course_sections",
    "raw_term_added_courses",
    "raw_course_catalog_previews",
    "plan_program_requirements",
    "plan_program_courses",
]

PLAN_COLUMNS = [
    "origin_type", "official_course_code", "category_code", "category_name", "requirement_type",
    "course_subcategory", "course_code", "section_code", "course_name", "official_term",
    "planned_term", "actual_term", "credits", "total_hours", "lecture_hours", "experiment_hours",
    "extra_hours", "prerequisite_course_code", "study_status", "score", "credit_count_to", "teacher",
    "class_time", "teaching_weeks", "classroom", "campus", "department", "raw_source_type",
    "raw_batch_id", "raw_source_row", "preference_level", "note", "is_deleted", "deleted_at",
    "deleted_note", "created_at", "updated_at",
]

MEETING_COLUMNS = [
    "batch_id", "term", "course_code", "section_code", "meeting_no", "start_week", "end_week",
    "weekday", "start_period", "end_period", "location_text", "course_name", "teacher",
    "class_group", "course_nature", "course_attribute", "class_time_raw", "location_raw",
    "online_group", "online_url", "qr_code", "source_sheet", "source_row", "imported_at",
]


def lit(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    return "'" + str(value).replace("'", "''") + "'"


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def columns_of(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({quote_ident(table)})")]


def chunked_inserts(
    table: str, columns: list[str], rows, prefix: str = "INSERT INTO", suffix: str = ""
) -> list[str]:
    head = f"{prefix} {quote_ident(table)} ({', '.join(quote_ident(c) for c in columns)}) VALUES\n"
    tail = (" " + suffix if suffix else "") + ";"
    out: list[str] = []
    buf: list[str] = []
    size = len((head + tail).encode())
    for row in rows:
        values = "(" + ", ".join(row) + ")"
        vbytes = len(values.encode())
        if buf and size + vbytes + 2 > CHUNK_BYTES:
            out.append(head + ",\n".join(buf) + tail)
            buf, size = [], len((head + tail).encode())
        buf.append(values)
        size += vbytes + 2
    if buf:
        out.append(head + ",\n".join(buf) + tail)
    return out


# 被用户数据引用（ON DELETE CASCADE）的公共表只做 upsert，绝不 DELETE，
# 否则重复导入公共数据会把所有用户的课表片段 / 学分调整一起删掉。
UPSERT_KEYS = {
    "raw_import_batches": ["id"],
    "plan_program_requirements": ["category_code", "requirement_type_code"],
}


def neutralize_program_row(row: dict) -> dict:
    row = dict(row)
    row.update(
        planned_term=None,
        actual_term=None,
        study_status="未修读",
        score=None,
        preference_level=None,
        note=None,
        is_deleted=0,
        deleted_at=None,
        deleted_note=None,
    )
    return row


def build_public(conn: sqlite3.Connection, d1_columns: dict[str, list[str]]) -> str:
    parts = [
        "-- 由 scripts/build_d1_seed.py 生成：公共数据（不含个人状态）。可重复执行。",
        "PRAGMA defer_foreign_keys = true;",
    ]
    for table in reversed(SHARED_TABLES):
        if table not in UPSERT_KEYS:
            parts.append(f"DELETE FROM {quote_ident(table)};")
    for table in SHARED_TABLES:
        cols = [c for c in columns_of(conn, table) if c in d1_columns[table]]
        cur = conn.execute(f"SELECT {', '.join(quote_ident(c) for c in cols)} FROM {quote_ident(table)}")
        rows = []
        kept_codes = {
            r[0] for r in conn.execute(
                "SELECT course_code FROM plan_program_courses WHERE IFNULL(is_permanently_deleted, 0) = 0"
            )
        }
        for raw in cur:
            row = dict(zip(cols, raw))
            if table == "plan_program_courses":
                if row.get("is_permanently_deleted"):
                    continue
                row = neutralize_program_row(row)
                if row.get("prerequisite_course_code") not in kept_codes:
                    row["prerequisite_course_code"] = None
            rows.append([lit(row[c]) for c in cols])
        keys = UPSERT_KEYS.get(table)
        suffix = ""
        if keys:
            updates = ", ".join(f"{quote_ident(c)} = excluded.{quote_ident(c)}" for c in cols if c not in keys)
            suffix = f"ON CONFLICT({', '.join(quote_ident(k) for k in keys)}) DO UPDATE SET {updates}"
        parts.extend(chunked_inserts(table, cols, rows, suffix=suffix))
    return "\n".join(parts) + "\n"


def build_personal(conn: sqlite3.Connection, email: str, enrollment_year: int) -> str:
    uid = f"(SELECT id FROM \"user\" WHERE email = {lit(email.lower())})"
    parts = [
        f"-- 由 scripts/build_d1_seed.py 生成：{email} 的个人数据。会覆盖该账号现有的计划与课表。",
        "-- 账号必须已经注册；否则 user_id 为空，导入会失败。",
        f"INSERT INTO user_profiles(user_id, enrollment_year, initialized_at) VALUES ({uid}, {enrollment_year}, datetime('now'))"
        f" ON CONFLICT(user_id) DO UPDATE SET enrollment_year = excluded.enrollment_year, initialized_at = excluded.initialized_at, updated_at = datetime('now');",
        f"DELETE FROM user_course_meetings WHERE user_id = {uid};",
        f"DELETE FROM my_plan_courses WHERE user_id = {uid};",
        f"DELETE FROM user_requirement_overrides WHERE user_id = {uid};",
    ]
    src_cols = set(columns_of(conn, "my_plan_courses"))
    cols = [c for c in PLAN_COLUMNS if c in src_cols]
    rows = [
        [uid] + [lit(v) for v in raw]
        for raw in conn.execute(f"SELECT {', '.join(cols)} FROM my_plan_courses")
    ]
    parts.extend(chunked_inserts("my_plan_courses", ["user_id", *cols], rows))

    src_cols = set(columns_of(conn, "raw_actual_course_meetings"))
    mcols = [c for c in MEETING_COLUMNS if c in src_cols]
    rows = []
    for raw in conn.execute(f"SELECT {', '.join(mcols)} FROM raw_actual_course_meetings"):
        row = dict(zip(mcols, raw))
        # 原始课表 sheet 名是学号，导入时去掉
        if row.get("source_sheet") and str(row["source_sheet"]).isdigit():
            row["source_sheet"] = "personal-timetable"
        rows.append([uid] + [lit(row[c]) for c in mcols])
    parts.extend(chunked_inserts("user_course_meetings", ["user_id", *mcols], rows, "INSERT OR IGNORE INTO"))
    return "\n".join(parts) + "\n"


def d1_schema_columns() -> dict[str, list[str]]:
    """用 D1 迁移文件在内存里建表，拿到 D1 端的列名（以 D1 为准，避免多余列）。"""
    mem = sqlite3.connect(":memory:")
    for f in sorted((ROOT / "d1" / "migrations").glob("*.sql")):
        mem.executescript(f.read_text(encoding="utf-8"))
    return {t: columns_of(mem, t) for t in SHARED_TABLES}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--email", help="把个人数据导入到这个已注册邮箱的账号")
    ap.add_argument("--enrollment-year", type=int, default=2024)
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "public.sql").write_text(build_public(conn, d1_schema_columns()), encoding="utf-8")
    print(f"wrote {args.out / 'public.sql'}")
    if args.email:
        (args.out / "personal.sql").write_text(
            build_personal(conn, args.email, args.enrollment_year), encoding="utf-8"
        )
        print(f"wrote {args.out / 'personal.sql'}")


if __name__ == "__main__":
    main()
