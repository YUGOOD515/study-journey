-- 学旅 D1 业务表。
--
-- 数据边界：
--   共享只读（所有用户共用，由维护者导入）：raw_import_batches / raw_term_course_sections /
--     raw_term_added_courses / raw_course_catalog_previews / plan_program_courses / plan_program_requirements
--   每个用户一份（user_id 隔离，删除账号时级联删除）：user_profiles / my_plan_courses /
--     user_course_meetings / user_requirement_overrides
--
-- plan_program_courses 中 planned_term / actual_term / study_status / score / is_deleted 等列是
-- 历史单用户版本遗留的“用户状态”列。多用户版本中它们保持中性默认值，用户状态只写 my_plan_courses。

CREATE TABLE raw_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year TEXT NOT NULL CHECK (academic_year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'),
    semester TEXT NOT NULL CHECK (semester IN ('spring', 'fall')),
    phase TEXT NOT NULL CHECK (phase IN ('final', 'beginning_add', 'actual_schedule')),
    source_file TEXT NOT NULL CHECK (TRIM(source_file) <> ''),
    source_format TEXT CHECK (source_format IN ('csv', 'xlsx', 'xls')),
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    note TEXT
);

CREATE TABLE raw_term_course_sections (
    batch_id INTEGER NOT NULL,
    course_code TEXT NOT NULL CHECK (TRIM(course_code) <> ''),
    section_code TEXT NOT NULL CHECK (TRIM(section_code) <> ''),
    course_name TEXT NOT NULL CHECK (TRIM(course_name) <> ''),
    hours REAL CHECK (hours IS NULL OR hours >= 0),
    credits REAL CHECK (credits IS NULL OR credits >= 0),
    teacher TEXT,
    class_time TEXT,
    teaching_weeks TEXT,
    enrollment_restriction TEXT,
    combined_class_name TEXT,
    campus TEXT,
    department TEXT,
    course_attribute TEXT,
    gender_requirement TEXT,
    enrollment_open TEXT,
    source_row INTEGER NOT NULL CHECK (source_row > 0), classroom TEXT, group_name TEXT,

    PRIMARY KEY (batch_id, course_code, section_code),
    FOREIGN KEY (batch_id)
        REFERENCES raw_import_batches(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE raw_term_added_courses (
    batch_id INTEGER NOT NULL,
    course_code TEXT NOT NULL CHECK (TRIM(course_code) <> ''),
    course_name TEXT NOT NULL CHECK (TRIM(course_name) <> ''),
    department TEXT,
    learning_platform TEXT,
    credits REAL CHECK (credits IS NULL OR credits >= 0),
    class_time TEXT,
    enrollment_restriction TEXT,
    module_2022 TEXT,
    module_2024 TEXT,
    remark1 TEXT,
    remark2 TEXT,
    source_row INTEGER NOT NULL CHECK (source_row > 0),

    PRIMARY KEY (batch_id, course_code),
    FOREIGN KEY (batch_id)
        REFERENCES raw_import_batches(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE raw_course_catalog_previews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year TEXT NOT NULL CHECK (academic_year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'),
        semester TEXT NOT NULL CHECK (semester IN ('spring', 'fall')),
        source_file TEXT NOT NULL CHECK (TRIM(source_file) <> ''),
        source_format TEXT CHECK (source_format IN ('xlsx', 'xls')),
        source_sheet TEXT,
        source_row INTEGER NOT NULL CHECK (source_row > 0),
        ordinal INTEGER,
        department TEXT,
        course_code TEXT NOT NULL CHECK (TRIM(course_code) <> ''),
        course_name TEXT NOT NULL CHECK (TRIM(course_name) <> ''),
        module_2022 TEXT,
        module_2024 TEXT,
        course_category TEXT,
        course_attribute TEXT,
        hours REAL CHECK (hours IS NULL OR hours >= 0),
        credits REAL CHECK (credits IS NULL OR credits >= 0),
        imported_at TEXT NOT NULL DEFAULT (datetime('now')),
        note TEXT
    );

CREATE TABLE plan_program_requirements (
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
    requirement_type_code TEXT NOT NULL CHECK (requirement_type_code IN (
        'required', 'elective', 'interdisciplinary'
    )),
    requirement_name TEXT NOT NULL CHECK (TRIM(requirement_name) <> ''),
    required_credits REAL NOT NULL CHECK (required_credits >= 0),
    source TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY (category_code, requirement_type_code)
);

CREATE TABLE plan_program_courses (
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

    credits REAL NOT NULL CHECK (credits >= 0),
    total_hours INTEGER NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
    lecture_hours INTEGER NOT NULL DEFAULT 0 CHECK (lecture_hours >= 0),
    experiment_hours INTEGER NOT NULL DEFAULT 0 CHECK (experiment_hours >= 0),
    extra_hours INTEGER NOT NULL DEFAULT 0 CHECK (extra_hours >= 0),

    -- 先修条件：当前按单个课程号存储；若以后确实需要多个，可拆成 plan_course_prerequisites 关系表。
    prerequisite_course_code TEXT,

    actual_term INTEGER CHECK (actual_term IS NULL OR actual_term BETWEEN 1 AND 8),
    study_status TEXT NOT NULL DEFAULT '未修读' CHECK (study_status IN (
        '未修读', '计划修读', '正在修读', '已修读', '未通过'
    )),
    score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),

    -- 经法管融通课程的学分归属。普通课程应为空。
    credit_count_to TEXT CHECK (
        credit_count_to IS NULL OR credit_count_to IN ('通识教育-选修', '大类平台-选修')
    ),

    source_sheet TEXT,
    source_row INTEGER CHECK (source_row IS NULL OR source_row > 0),
    preference_level INTEGER CHECK (preference_level IS NULL OR preference_level BETWEEN 1 AND 5),
    note TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)), deleted_at TEXT, deleted_note TEXT, is_permanently_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_permanently_deleted IN (0, 1)),

    CHECK (total_hours = lecture_hours + experiment_hours + extra_hours),
    CHECK (
        course_subcategory IS NULL
        OR course_subcategory NOT LIKE '%经法管融通%'
        OR credit_count_to IS NOT NULL
    ),
    FOREIGN KEY (prerequisite_course_code)
        REFERENCES plan_program_courses(course_code)
        ON UPDATE CASCADE
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_raw_sections_course_code ON raw_term_course_sections(course_code);
CREATE INDEX idx_raw_sections_course_name ON raw_term_course_sections(course_name);
CREATE INDEX idx_raw_sections_batch ON raw_term_course_sections(batch_id);
CREATE INDEX idx_raw_added_course_code ON raw_term_added_courses(course_code);
CREATE INDEX idx_raw_added_course_name ON raw_term_added_courses(course_name);
CREATE INDEX idx_raw_added_batch ON raw_term_added_courses(batch_id);
CREATE INDEX idx_plan_program_category ON plan_program_courses(category_code, requirement_type);
CREATE INDEX idx_plan_program_prerequisite ON plan_program_courses(prerequisite_course_code);
CREATE INDEX idx_raw_catalog_preview_course_code
      ON raw_course_catalog_previews(course_code);
CREATE INDEX idx_raw_catalog_preview_batch
      ON raw_course_catalog_previews(academic_year, semester);
CREATE INDEX idx_raw_catalog_preview_module_2024
      ON raw_course_catalog_previews(module_2024);
