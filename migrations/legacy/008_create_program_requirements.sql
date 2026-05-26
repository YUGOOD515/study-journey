-- migrations/008_create_program_requirements.sql
-- 表中文名：培养方案学分要求表
-- 说明：本表只记录各培养环节下不同课程性质的学分要求，不记录具体课程。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS program_requirements (
    -- 培养环节代码，例如 general_education、major_platform
    category_code TEXT NOT NULL,

    -- 培养环节名称，例如 通识教育、大类平台
    category_name TEXT NOT NULL,

    -- 要求类型：required=必修，elective=选修，interdisciplinary=大类平台（经法管融通）
    requirement_type TEXT NOT NULL CHECK (
        requirement_type IN ('required', 'elective', 'interdisciplinary')
    ),

    -- 要求名称，使用中文名称便于直接展示
    requirement_name TEXT NOT NULL,

    -- 要求学分
    required_credits REAL NOT NULL CHECK (required_credits >= 0),

    -- 数据来源工作表或人工确认来源
    source TEXT,

    PRIMARY KEY (category_code, requirement_type),

    CHECK (TRIM(category_code) <> ''),
    CHECK (TRIM(category_name) <> ''),
    CHECK (TRIM(requirement_name) <> '')
);
