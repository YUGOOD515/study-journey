-- v2_003: keep school course catalog preview sheets as raw data.
--
-- These sheets are not the same as raw_term_added_courses:
-- - added courses describe add/drop phase offerings and include class time/platform.
-- - catalog previews describe the semester-wide course catalog/module mapping.
--
-- No foreign keys to plan_ tables are used. raw_ remains imported source data.

ALTER TABLE raw_term_course_sections ADD COLUMN classroom TEXT;
ALTER TABLE raw_term_course_sections ADD COLUMN group_name TEXT;

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

CREATE INDEX idx_raw_catalog_preview_course_code
  ON raw_course_catalog_previews(course_code);

CREATE INDEX idx_raw_catalog_preview_batch
  ON raw_course_catalog_previews(academic_year, semester);

CREATE INDEX idx_raw_catalog_preview_module_2024
  ON raw_course_catalog_previews(module_2024);
