-- seeds/005_seed_quality_education_courses.sql
-- 数据来源：培养方案(1).xlsx / 工作表：素质教育12
-- 说明：
-- 1. 本脚本只写入有正式课程号的“素质教育”课程归属数据。
-- 2. 课程名称、学分、学时等课程本体信息不重复保存，请从 courses 表查询。
-- 3. 完成情况、分数属于个人修读记录，暂不写入本表。
-- 4. “课外素质教育”不是正式课程号，暂不写入本表，待后续单独建非课程要求表或你确认处理方式。

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

INSERT INTO quality_education_courses (
    course_code,
    course_nature,
    offered_term,
    source_sheet,
    source_row
)
VALUES
    ('B2200010', '必修', '1', '素质教育12', 2),
    ('B1500010', '必修', '1', '素质教育12', 3),
    ('B1500020', '必修', '2', '素质教育12', 4),
    ('B1500030', '必修', '3', '素质教育12', 5),
    ('B1500040', '必修', '4', '素质教育12', 6)
ON CONFLICT(course_code) DO UPDATE SET
    course_nature = excluded.course_nature,
    offered_term = excluded.offered_term,
    source_sheet = excluded.source_sheet,
    source_row = excluded.source_row;

COMMIT;
