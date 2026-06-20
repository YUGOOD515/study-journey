-- v2_015: separate immutable official program courses from the user's editable plan.
--
-- plan_program_courses remains the official curriculum snapshot.
-- my_plan_courses is the only table used for user planning state, selected
-- sections, trash, scores, and course edits.

CREATE TABLE IF NOT EXISTS my_plan_courses (
    origin_type TEXT NOT NULL CHECK (origin_type IN ('official', 'manual', 'raw')),
    official_course_code TEXT,

    category_code TEXT NOT NULL CHECK (category_code IN (
        'general_education',
        'major_platform',
        'professional_education',
        'quality_education',
        'practice_education'
    )),
    category_name TEXT NOT NULL CHECK (category_name IN (
        '通识教育',
        '大类平台',
        '专业教育',
        '素质教育',
        '实践教育'
    )),
    requirement_type TEXT NOT NULL CHECK (requirement_type IN (
        '必修', '选修', '跨专业', '经法管融通'
    )),
    course_subcategory TEXT,

    course_code TEXT PRIMARY KEY CHECK (TRIM(course_code) <> ''),
    section_code TEXT,
    course_name TEXT NOT NULL CHECK (TRIM(course_name) <> ''),
    official_term TEXT,

    planned_term INTEGER CHECK (planned_term IS NULL OR planned_term BETWEEN 1 AND 8),
    actual_term INTEGER CHECK (actual_term IS NULL OR actual_term BETWEEN 1 AND 8),

    credits REAL NOT NULL CHECK (credits >= 0),
    total_hours INTEGER NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
    lecture_hours INTEGER NOT NULL DEFAULT 0 CHECK (lecture_hours >= 0),
    experiment_hours INTEGER NOT NULL DEFAULT 0 CHECK (experiment_hours >= 0),
    extra_hours INTEGER NOT NULL DEFAULT 0 CHECK (extra_hours >= 0),

    prerequisite_course_code TEXT,
    study_status TEXT NOT NULL DEFAULT '未修读' CHECK (study_status IN (
        '未修读', '计划修读', '正在修读', '已修读', '未通过'
    )),
    score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    credit_count_to TEXT CHECK (
        credit_count_to IS NULL OR credit_count_to IN ('通识教育-选修', '大类平台-选修')
    ),

    teacher TEXT,
    class_time TEXT,
    teaching_weeks TEXT,
    classroom TEXT,
    campus TEXT,
    department TEXT,
    raw_source_type TEXT CHECK (raw_source_type IS NULL OR raw_source_type IN ('section', 'added')),
    raw_batch_id INTEGER,
    raw_source_row INTEGER,

    preference_level INTEGER CHECK (preference_level IS NULL OR preference_level BETWEEN 1 AND 5),
    note TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    deleted_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (total_hours = lecture_hours + experiment_hours + extra_hours),
    CHECK (
        (requirement_type = '经法管融通' AND credit_count_to IS NOT NULL)
        OR
        (requirement_type <> '经法管融通' AND credit_count_to IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_my_plan_courses_origin
  ON my_plan_courses(origin_type, official_course_code);

CREATE INDEX IF NOT EXISTS idx_my_plan_courses_term
  ON my_plan_courses(planned_term, actual_term);

CREATE INDEX IF NOT EXISTS idx_my_plan_courses_status
  ON my_plan_courses(study_status);

CREATE INDEX IF NOT EXISTS idx_my_plan_courses_trash
  ON my_plan_courses(is_deleted, deleted_at);

