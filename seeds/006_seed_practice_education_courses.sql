-- seeds/006_seed_practice_education_courses.sql
-- 数据来源：培养方案(1).xlsx / 工作表：实践教育16
-- 说明：
-- 1. 本脚本只写入有课程号的“实践教育”课程归属数据。
-- 2. 课程名称、学分、学时等课程本体信息不重复保存，请从 courses 表查询。
-- 3. 完成学期、分数属于个人修读记录，暂不写入本表。

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

INSERT INTO practice_education_courses (
    course_code,
    course_nature,
    offered_term,
    source_sheet,
    source_row
)
VALUES
    ('B2490090', '必修', '4', '实践教育16', 2),
    ('B1890120', '必修', '3', '实践教育16', 3),
    ('B2090030', '必修', '1', '实践教育16', 4),
    ('B1890010', '必修', '6', '实践教育16', 5),
    ('B1890070', '必修', '5-7', '实践教育16', 6),
    ('B1890030', '必修', '8', '实践教育16', 7)
ON CONFLICT(course_code) DO UPDATE SET
    course_nature = excluded.course_nature,
    offered_term = excluded.offered_term,
    source_sheet = excluded.source_sheet,
    source_row = excluded.source_row;

COMMIT;
