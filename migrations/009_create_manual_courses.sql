-- migrations/009_create_manual_courses.sql
-- Table: manual_courses
-- Purpose: 用户手动添加的、培养方案之外的课程（公选课等）。
--          与 semester_courses 平行存在；前者锚定 courses 表，本表完全自包含。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS manual_courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- 学期：1=大一秋, …, 8=大四春
    term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 8),

    -- 课程名（手动填）
    course_name TEXT NOT NULL CHECK (TRIM(course_name) <> ''),

    -- 学分
    credits REAL NOT NULL CHECK (credits >= 0),

    -- 归属板块（5 选 1，与 categoryStyle 一致）
    category_code TEXT NOT NULL CHECK (category_code IN (
        'general_education',
        'major_platform',
        'professional_education',
        'quality_education',
        'practice_education'
    )),

    -- 课程性质：必修 / 选修
    course_nature TEXT NOT NULL CHECK (course_nature IN ('必修', '选修')),

    -- 成绩
    score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),

    -- 备注（可选，如"通选 · 美学导论"）
    note TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_manual_courses_term
    ON manual_courses(term_number);

CREATE INDEX IF NOT EXISTS idx_manual_courses_category
    ON manual_courses(category_code);
