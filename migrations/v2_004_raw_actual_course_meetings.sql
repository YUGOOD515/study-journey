PRAGMA writable_schema = ON;

UPDATE sqlite_schema
SET sql = REPLACE(
    REPLACE(
      sql,
      "phase TEXT NOT NULL CHECK (phase IN ('final', 'beginning_add'))",
      "phase TEXT NOT NULL CHECK (phase IN ('final', 'beginning_add', 'actual_schedule'))"
    ),
    "phase TEXT NOT NULL CHECK (phase IN ('final','beginning_add'))",
    "phase TEXT NOT NULL CHECK (phase IN ('final','beginning_add','actual_schedule'))"
  )
WHERE type = 'table'
  AND name = 'raw_import_batches'
  AND sql NOT LIKE '%actual_schedule%';

PRAGMA writable_schema = OFF;

CREATE TABLE IF NOT EXISTS raw_actual_course_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
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

    UNIQUE(batch_id, source_row, meeting_no),
    FOREIGN KEY (batch_id)
      REFERENCES raw_import_batches(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_raw_actual_course_meetings_term
  ON raw_actual_course_meetings(term, weekday, start_period, end_period);

CREATE INDEX IF NOT EXISTS idx_raw_actual_course_meetings_course
  ON raw_actual_course_meetings(course_code, section_code);

CREATE INDEX IF NOT EXISTS idx_raw_actual_course_meetings_week
  ON raw_actual_course_meetings(term, start_week, end_week);
