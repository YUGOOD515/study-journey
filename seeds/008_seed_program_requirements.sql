-- seeds/008_seed_program_requirements.sql
-- 数据来源：培养方案(1).xlsx 以及用户确认的大类平台（经法管融通）规则。
-- 说明：本脚本只写入培养方案各环节的学分要求，不写入具体课程。

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

INSERT INTO program_requirements (
    category_code,
    category_name,
    requirement_type,
    requirement_name,
    required_credits,
    source
)
VALUES
    ('general_education', '通识教育', 'required', '必修', 32, '通识教育48'),
    ('general_education', '通识教育', 'elective', '选修', 16, '通识教育48'),

    ('major_platform', '大类平台', 'required', '必修', 30, '大类46+专业38'),
    ('major_platform', '大类平台', 'elective', '选修', 10, '用户确认：大类平台选修要求至少 10 学分'),
    ('major_platform', '大类平台', 'interdisciplinary', '大类平台（经法管融通）', 6, '用户确认：经法管融通要求 6 学分'),

    ('professional_education', '专业教育', 'required', '必修', 18, '大类46+专业38'),
    ('professional_education', '专业教育', 'elective', '选修', 20, '大类46+专业38'),

    ('quality_education', '素质教育', 'required', '必修', 6, '素质教育12'),
    ('quality_education', '素质教育', 'elective', '选修', 6, '素质教育12'),

    ('practice_education', '实践教育', 'required', '必修', 16, '实践教育16'),
    ('practice_education', '实践教育', 'elective', '选修', 0, '实践教育16：原培养方案未列选修要求')
ON CONFLICT(category_code, requirement_type) DO UPDATE SET
    category_name = excluded.category_name,
    requirement_name = excluded.requirement_name,
    required_credits = excluded.required_credits,
    source = excluded.source;

COMMIT;
