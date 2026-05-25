-- seeds/003_seed_major_platform_courses.sql
-- 数据来源：培养方案(1).xlsx / 工作表：大类46+专业38 / 培养环节：大类平台
-- 说明：
-- 1. 本脚本只写入有课程号的“大类平台”课程归属数据。
-- 2. 课程名称、学分、学时等课程本体信息不重复保存，请从 courses 表查询。
-- 3. 完成学期、分数属于个人修读记录，暂不写入本表。
-- 4. 以下无课程号记录暂不写入：经法管融通。

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

INSERT INTO major_platform_courses (
    course_code,
    course_nature,
    offered_term,
    source_sheet,
    source_row
)
VALUES
    ('B0900470', '必修', '1', '大类46+专业38', 2),
    ('B0900490', '必修', '2', '大类46+专业38', 3),
    ('B0200242', '必修', '1', '大类46+专业38', 4),
    ('B0200193', '必修', '1', '大类46+专业38', 5),
    ('B0200133', '必修', '2', '大类46+专业38', 6),
    ('B0900434', '必修', '3', '大类46+专业38', 7),
    ('B0901323', '必修', '4', '大类46+专业38', 8),
    ('B0301940', '必修', '4', '大类46+专业38', 9),
    ('B0301812', '必修', '3', '大类46+专业38', 10),
    ('B0800243', '选修', '2', '大类46+专业38', 12),
    ('B0700013', '选修', '3', '大类46+专业38', 13),
    ('B0901470', '选修', '4', '大类46+专业38', 14),
    ('B0301700', '选修', '5', '大类46+专业38', 15),
    ('B1301960', '选修', '5', '大类46+专业38', 16),
    ('B0290050', '选修', '3', '大类46+专业38', 17)
ON CONFLICT(course_code) DO UPDATE SET
    course_nature = excluded.course_nature,
    offered_term = excluded.offered_term,
    source_sheet = excluded.source_sheet,
    source_row = excluded.source_row;

COMMIT;
