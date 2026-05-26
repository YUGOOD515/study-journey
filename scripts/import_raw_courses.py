#!/usr/bin/env python3
"""
import_raw_courses.py

用途：向 course_planner_v2.sqlite 导入学校课程表原始数据。
raw_ 表不和 plan_ 表发生外键关联。

示例：
  python import_raw_courses.py --db course_planner_v2.sqlite \
    --file 2026-2027学年第一学期本科生选课.csv \
    --academic-year 2026-2027 --semester fall --phase final

  python import_raw_courses.py --db course_planner_v2.sqlite \
    --file 2026-2027学年第二学期本科课程补退选.csv \
    --academic-year 2026-2027 --semester spring --phase beginning_add
"""

import argparse
import csv
import sqlite3
from pathlib import Path

FINAL_COLUMNS = [
    '课程号', '课序号', '课程名', '学时', '学分', '上课教师', '上课时间', '上课周次',
    '选课限制说明', '合班名称', '上课校区', '开课单位', '课程属性', '性别要求', '选课开放'
]
ADD_COLUMNS = [
    '课程编号', '课程名称', '开课单位', '学习平台', '学分', '上课时间', '选课限制说明',
    '所属模块(2022版)', '所属模块（2024版）', '备注1', '备注2'
]

def clean_text(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None

def clean_num(v):
    s = clean_text(v)
    if s is None:
        return None
    try:
        return float(s)
    except ValueError:
        return None

def read_csv(path: Path):
    # 学校 CSV 若是 GBK，可自动回退。
    for enc in ('utf-8-sig', 'gb18030'):
        try:
            with path.open('r', encoding=enc, newline='') as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError('无法识别 CSV 编码，请手动转为 UTF-8 或 GB18030。')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--file', required=True)
    parser.add_argument('--academic-year', required=True, help='例如 2026-2027')
    parser.add_argument('--semester', required=True, choices=['spring', 'fall'])
    parser.add_argument('--phase', required=True, choices=['final', 'beginning_add'])
    parser.add_argument('--note', default=None)
    args = parser.parse_args()

    path = Path(args.file)
    if path.suffix.lower() != '.csv':
        raise SystemExit('这个脚本默认处理 CSV。请先把 Excel 另存为 CSV。')

    rows = read_csv(path)
    source_format = 'csv'

    conn = sqlite3.connect(args.db)
    conn.execute('PRAGMA foreign_keys = ON')
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO raw_import_batches(academic_year, semester, phase, source_file, source_format, note)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (args.academic_year, args.semester, args.phase, path.name, source_format, args.note))
    batch_id = cur.lastrowid

    if args.phase == 'final':
        missing = [c for c in FINAL_COLUMNS if c not in rows[0]] if rows else FINAL_COLUMNS
        if missing:
            raise SystemExit(f'缺少字段：{missing}')
        for idx, r in enumerate(rows, start=2):
            cur.execute("""
                INSERT INTO raw_term_course_sections(
                    batch_id, course_code, section_code, course_name, hours, credits, teacher, class_time,
                    teaching_weeks, enrollment_restriction, combined_class_name, campus, department,
                    course_attribute, gender_requirement, enrollment_open, source_row
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                batch_id, clean_text(r['课程号']), clean_text(r['课序号']), clean_text(r['课程名']),
                clean_num(r['学时']), clean_num(r['学分']), clean_text(r['上课教师']), clean_text(r['上课时间']),
                clean_text(r['上课周次']), clean_text(r['选课限制说明']), clean_text(r['合班名称']),
                clean_text(r['上课校区']), clean_text(r['开课单位']), clean_text(r['课程属性']),
                clean_text(r['性别要求']), clean_text(r['选课开放']), idx
            ))
    else:
        missing = [c for c in ADD_COLUMNS if c not in rows[0]] if rows else ADD_COLUMNS
        if missing:
            raise SystemExit(f'缺少字段：{missing}')
        for idx, r in enumerate(rows, start=2):
            cur.execute("""
                INSERT INTO raw_term_added_courses(
                    batch_id, course_code, course_name, department, learning_platform, credits, class_time,
                    enrollment_restriction, module_2022, module_2024, remark1, remark2, source_row
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                batch_id, clean_text(r['课程编号']), clean_text(r['课程名称']), clean_text(r['开课单位']),
                clean_text(r['学习平台']), clean_num(r['学分']), clean_text(r['上课时间']),
                clean_text(r['选课限制说明']), clean_text(r['所属模块(2022版)']),
                clean_text(r['所属模块（2024版）']), clean_text(r['备注1']), clean_text(r['备注2']), idx
            ))

    conn.commit()
    print(f'导入完成：batch_id={batch_id}, rows={len(rows)}')

if __name__ == '__main__':
    main()
