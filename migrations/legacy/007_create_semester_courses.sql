-- migrations/007_create_semester_courses.sql
-- Table: semester_courses
-- Purpose: Stores completed courses by undergraduate term.
-- Dependency: courses table must already exist.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS semester_courses (
    -- Term number: 1 = freshman fall, 2 = freshman spring, ..., 8 = senior spring
    term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 8),

    -- Course code
    course_code TEXT NOT NULL,

    -- Course score; nullable because some completed courses may not have a recorded score yet
    score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),

    PRIMARY KEY (term_number, course_code),

    FOREIGN KEY (course_code)
        REFERENCES courses(course_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_semester_courses_course_code
    ON semester_courses(course_code);
