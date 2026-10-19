-- 每个用户一份的数据。所有表都以 user_id 开头建主键/索引，并在删除账号时级联删除。

-- 用户档案：入学年份决定「第 N 学期」与学校学年/学期的换算。
CREATE TABLE user_profiles (
    user_id TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
    enrollment_year INTEGER NOT NULL CHECK (enrollment_year BETWEEN 2000 AND 2100),
    initialized_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 我的计划（原单用户 my_plan_courses + user_id）。
CREATE TABLE my_plan_courses (
    user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
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
    course_code TEXT NOT NULL CHECK (TRIM(course_code) <> ''),
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
    PRIMARY KEY (user_id, course_code),
    CHECK (total_hours = lecture_hours + experiment_hours + extra_hours),
    CHECK (
        (requirement_type = '经法管融通' AND credit_count_to IS NOT NULL)
        OR
        (requirement_type <> '经法管融通' AND credit_count_to IS NULL)
    )
);

CREATE INDEX idx_my_plan_courses_user_trash ON my_plan_courses(user_id, is_deleted, deleted_at);
CREATE INDEX idx_my_plan_courses_user_term ON my_plan_courses(user_id, planned_term, actual_term);
CREATE INDEX idx_my_plan_courses_user_name ON my_plan_courses(user_id, course_name);

-- 我的学期课表片段（原 raw_actual_course_meetings；该表在单用户版本里保存的是个人课表，属于用户数据）。
CREATE TABLE user_course_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    batch_id INTEGER NOT NULL REFERENCES raw_import_batches(id) ON UPDATE CASCADE ON DELETE CASCADE,
    term INTEGER NOT NULL CHECK (term BETWEEN 1 AND 8),
    course_code TEXT NOT NULL CHECK (TRIM(course_code) <> ''),
    section_code TEXT NOT NULL CHECK (TRIM(section_code) <> ''),
    meeting_no INTEGER NOT NULL CHECK (meeting_no > 0),
    start_week INTEGER NOT NULL CHECK (start_week > 0),
    end_week INTEGER NOT NULL CHECK (end_week >= start_week),
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_period INTEGER NOT NULL CHECK (start_period > 0),
    end_period INTEGER NOT NULL CHECK (end_period >= start_period),
    location_text TEXT,
    course_name TEXT NOT NULL CHECK (TRIM(course_name) <> ''),
    teacher TEXT,
    class_group TEXT,
    course_nature TEXT,
    course_attribute TEXT,
    class_time_raw TEXT,
    location_raw TEXT,
    online_group TEXT,
    online_url TEXT,
    qr_code TEXT,
    source_sheet TEXT,
    source_row INTEGER NOT NULL CHECK (source_row > 0),
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, batch_id, source_row, meeting_no)
);

CREATE INDEX idx_user_course_meetings_term ON user_course_meetings(user_id, term, weekday, start_period, end_period);
CREATE INDEX idx_user_course_meetings_course ON user_course_meetings(user_id, course_code, section_code);

-- 用户对培养方案学分要求的个人调整；没有记录时使用 plan_program_requirements 的默认值。
CREATE TABLE user_requirement_overrides (
    user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    category_code TEXT NOT NULL,
    requirement_type_code TEXT NOT NULL CHECK (requirement_type_code IN ('required', 'elective', 'interdisciplinary')),
    required_credits REAL NOT NULL CHECK (required_credits >= 0),
    note TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, category_code, requirement_type_code),
    FOREIGN KEY (category_code, requirement_type_code)
      REFERENCES plan_program_requirements(category_code, requirement_type_code)
      ON UPDATE CASCADE ON DELETE CASCADE
);
