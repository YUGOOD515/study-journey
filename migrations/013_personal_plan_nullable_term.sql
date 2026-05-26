-- migrations/013_personal_plan_nullable_term.sql
-- 把 personal_plan.planned_term 改为 NULLable。
-- 语义约定：
--   planned_term = N (1..8)  → 用户把这门课/手动条目放在第 N 学期
--   planned_term IS NULL     → 用户明确把它放进"待安排"抽屉（与"无记录"不同）
-- SQLite 不能直接 ALTER 改 NOT NULL，必须 rebuild。

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE personal_plan_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    item_type TEXT NOT NULL CHECK (item_type IN ('official', 'manual')),

    course_code TEXT,

    -- ← 改动：去掉 NOT NULL；保留范围 CHECK
    planned_term INTEGER CHECK (
        planned_term IS NULL OR planned_term BETWEEN 1 AND 8
    ),

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

    is_interdisciplinary INTEGER NOT NULL DEFAULT 0,
    assigned_to TEXT NOT NULL DEFAULT 'interdisciplinary',

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

INSERT INTO personal_plan_new (
    id, item_type, course_code, planned_term,
    manual_course_name, manual_credits, manual_category_code, manual_course_nature,
    note, is_interdisciplinary, assigned_to, created_at, updated_at
)
SELECT
    id, item_type, course_code, planned_term,
    manual_course_name, manual_credits, manual_category_code, manual_course_nature,
    note, is_interdisciplinary, assigned_to, created_at, updated_at
FROM personal_plan;

DROP TABLE personal_plan;
ALTER TABLE personal_plan_new RENAME TO personal_plan;

CREATE UNIQUE INDEX IF NOT EXISTS ux_personal_plan_official_course
    ON personal_plan(course_code)
    WHERE item_type = 'official' AND course_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_plan_term
    ON personal_plan(planned_term);

CREATE INDEX IF NOT EXISTS idx_personal_plan_manual_category
    ON personal_plan(manual_category_code);

COMMIT;

PRAGMA foreign_keys = ON;
