-- course_planner_v2 schema
-- 结构目标：一个 SQLite 文件，raw_ 与 plan_ 分离。
-- raw_：直接来自学校课程表 CSV/Excel，不和 plan_ 建任何外键。
-- plan_：培养方案、用户规划、成绩、毕业要求。

PRAGMA foreign_keys = OFF;
BEGIN;

DROP TRIGGER IF EXISTS trg_plan_program_courses_updated_at;
DROP TRIGGER IF EXISTS trg_plan_custom_courses_updated_at;
DROP TRIGGER IF EXISTS trg_plan_program_requirements_updated_at;

DROP TABLE IF EXISTS plan_custom_courses;
DROP TABLE IF EXISTS plan_program_courses;
DROP TABLE IF EXISTS plan_program_requirements;
DROP TABLE IF EXISTS raw_term_added_courses;
DROP TABLE IF EXISTS raw_term_course_sections;
DROP TABLE IF EXISTS raw_import_batches;

-- =========================
-- raw_：学校课程表原始数据
-- =========================

CREATE TABLE raw_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year TEXT NOT NULL CHECK (academic_year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'),
    semester TEXT NOT NULL CHECK (semester IN ('spring', 'fall')),
    phase TEXT NOT NULL CHECK (phase IN ('final', 'beginning_add')),
    source_file TEXT NOT NULL CHECK (TRIM(source_file) <> ''),
    source_format TEXT CHECK (source_format IN ('csv', 'xlsx', 'xls')),
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    note TEXT
);

-- 每个学期期末：绝大部分课程数据。主键：batch_id + 课程号 + 课序号。
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
    source_row INTEGER NOT NULL CHECK (source_row > 0),

    PRIMARY KEY (batch_id, course_code, section_code),
    FOREIGN KEY (batch_id)
        REFERENCES raw_import_batches(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- 下学期刚开始：补选、增加课程。主键：batch_id + 课程号。
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

-- =========================
-- plan_：培养方案与个人规划
-- =========================

-- 培养方案中已经安排好的课程。主键：课程号。
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
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

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

-- 用户自定义课程：通选、跨专业选课、额外计划课程等。主键：课程号。
CREATE TABLE plan_custom_courses (
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

    term_number INTEGER CHECK (term_number IS NULL OR term_number BETWEEN 1 AND 8),

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

    -- 仅经法管融通课程必须选择一个计入方向，防止两个都计入或两个都不计入。
    credit_count_to TEXT CHECK (
        credit_count_to IS NULL OR credit_count_to IN ('通识教育-选修', '大类平台-选修')
    ),

    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (total_hours = lecture_hours + experiment_hours + extra_hours),
    CHECK (
        (requirement_type = '经法管融通' AND credit_count_to IS NOT NULL)
        OR
        (requirement_type <> '经法管融通' AND credit_count_to IS NULL)
    )
);

-- 毕业要求表。用于之后做学分统计、达成情况校验。
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

-- =========================
-- 索引
-- =========================

CREATE INDEX idx_raw_sections_course_code ON raw_term_course_sections(course_code);
CREATE INDEX idx_raw_sections_course_name ON raw_term_course_sections(course_name);
CREATE INDEX idx_raw_sections_batch ON raw_term_course_sections(batch_id);
CREATE INDEX idx_raw_added_course_code ON raw_term_added_courses(course_code);
CREATE INDEX idx_raw_added_course_name ON raw_term_added_courses(course_name);
CREATE INDEX idx_raw_added_batch ON raw_term_added_courses(batch_id);

CREATE INDEX idx_plan_program_category ON plan_program_courses(category_code, requirement_type);
CREATE INDEX idx_plan_program_planned_term ON plan_program_courses(planned_term);
CREATE INDEX idx_plan_program_actual_term ON plan_program_courses(actual_term);
CREATE INDEX idx_plan_program_status ON plan_program_courses(study_status);
CREATE INDEX idx_plan_program_prerequisite ON plan_program_courses(prerequisite_course_code);

CREATE INDEX idx_plan_custom_category ON plan_custom_courses(category_code, requirement_type);
CREATE INDEX idx_plan_custom_term ON plan_custom_courses(term_number);
CREATE INDEX idx_plan_custom_status ON plan_custom_courses(study_status);

-- =========================
-- updated_at 触发器
-- =========================

CREATE TRIGGER trg_plan_program_courses_updated_at
AFTER UPDATE ON plan_program_courses
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE plan_program_courses
    SET updated_at = datetime('now')
    WHERE course_code = NEW.course_code;
END;

CREATE TRIGGER trg_plan_custom_courses_updated_at
AFTER UPDATE ON plan_custom_courses
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE plan_custom_courses
    SET updated_at = datetime('now')
    WHERE course_code = NEW.course_code;
END;

CREATE TRIGGER trg_plan_program_requirements_updated_at
AFTER UPDATE ON plan_program_requirements
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE plan_program_requirements
    SET updated_at = datetime('now')
    WHERE category_code = NEW.category_code
      AND requirement_type_code = NEW.requirement_type_code;
END;

COMMIT;
PRAGMA foreign_keys = ON;
