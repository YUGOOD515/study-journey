-- seeds/002_seed_general_education_courses.sql
-- 数据来源：培养方案(1).xlsx / 工作表：通识教育48
-- 说明：
-- 1. 本脚本只写入有课程号的通识教育课程归属数据。
-- 2. 课程名称、学分、学时等课程本体信息不重复保存，请从 courses 表查询。
-- 3. 完成学期、分数属于个人修读记录，暂不写入本表。
-- 4. 以下无课程号记录暂不写入：户外运动、国家蓝图与青年未来：“十五五规划的时代解读”。

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

INSERT INTO general_education_courses (
    course_code,
    course_nature,
    course_category,
    offered_term,
    source_sheet,
    source_row
)
VALUES
    ('B2490050', '必修', NULL, '1', '通识教育48', 2),
    ('B2400055', '必修', NULL, '1', '通识教育48', 3),
    ('B2400015', '必修', NULL, '2', '通识教育48', 4),
    ('B2400080', '必修', NULL, '2', '通识教育48', 5),
    ('B2400090', '必修', NULL, '3', '通识教育48', 6),
    ('B2490014', '必修', NULL, '1-8', '通识教育48', 7),
    ('B1100023', '必修', NULL, '1', '通识教育48', 8),
    ('B1100030', '必修', NULL, '2', '通识教育48', 9),
    ('B1302460', '必修', NULL, '1', '通识教育48', 10),
    ('B1302450', '必修', NULL, '2', '通识教育48', 11),
    ('B2090020', '必修', NULL, '1', '通识教育48', 12),
    ('B0600270', '必修', NULL, '3', '通识教育48', 13),
    ('B0400150', '必修', NULL, '4', '通识教育48', 14),
    ('B1380110', '选修', '科学思维与人文精神', NULL, '通识教育48', 26),
    ('B1080250', '选修', '创新创业与就业实践', NULL, '通识教育48', 27),
    ('B1580390', '选修', '科学思维与人文精神', NULL, '通识教育48', 28),
    ('B1580270', '选修', '交叉融通与全面发展', NULL, '通识教育48', 29),
    ('M1885380', '选修', NULL, NULL, '通识教育48', 30),
    ('B0480240', '选修', '大类平台（经法管融通）', NULL, '通识教育48', 31),
    ('B0902750', '跨专业', '跨专业类别', NULL, '通识教育48', 39),
    ('B1302680', '跨专业', '跨专业类别', NULL, '通识教育48', 40),
    ('B0900163', '跨专业', '跨专业类别', NULL, '通识教育48', 41),
    ('B0900974', '跨专业', '跨专业类别', NULL, '通识教育48', 42)
ON CONFLICT(course_code) DO UPDATE SET
    course_nature = excluded.course_nature,
    course_category = excluded.course_category,
    offered_term = excluded.offered_term,
    source_sheet = excluded.source_sheet,
    source_row = excluded.source_row;

COMMIT;
