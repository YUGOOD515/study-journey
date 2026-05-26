-- migrations/010_create_personal_plan.sql
-- Table: personal_plan
-- Purpose: 用户自己的选课规划层。官方培养方案保持只读；这里仅保存用户拖拽后的计划位置和手动添加课程。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personal_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- official = 培养方案内课程的个人计划覆盖；manual = 用户手动添加的计划课程
    item_type TEXT NOT NULL CHECK (item_type IN ('official', 'manual')),

    -- official 使用 course_code；manual 课程不在 courses 表里，因此为空
    course_code TEXT,

    -- 计划放在哪个学期
    planned_term INTEGER NOT NULL CHECK (planned_term BETWEEN 1 AND 8),

    -- manual 课程自带信息；official 课程信息从 courses + category tables 联查
    manual_course_name TEXT,
    manual_credits REAL CHECK (manual_credits IS NULL OR manual_credits >= 0),
    manual_category_code TEXT CHECK (
        manual_category_code IS NULL OR manual_category_code IN (
            'general_education',
            'major_platform',
            'professional_education',
            'quality_education',
            'practice_education'
        )
    ),
    manual_course_nature TEXT CHECK (
        manual_course_nature IS NULL OR manual_course_nature IN ('必修', '选修')
    ),
    note TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (
        (
            item_type = 'official'
            AND course_code IS NOT NULL
            AND manual_course_name IS NULL
            AND manual_credits IS NULL
            AND manual_category_code IS NULL
            AND manual_course_nature IS NULL
        )
        OR
        (
            item_type = 'manual'
            AND course_code IS NULL
            AND manual_course_name IS NOT NULL
            AND manual_credits IS NOT NULL
            AND manual_category_code IS NOT NULL
            AND manual_course_nature IS NOT NULL
        )
    ),

    FOREIGN KEY (course_code)
        REFERENCES courses(course_code)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_personal_plan_official_course
    ON personal_plan(course_code)
    WHERE item_type = 'official' AND course_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_plan_term
    ON personal_plan(planned_term);

CREATE INDEX IF NOT EXISTS idx_personal_plan_manual_category
    ON personal_plan(manual_category_code);
