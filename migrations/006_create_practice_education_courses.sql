-- migrations/006_create_practice_education_courses.sql
-- Table: practice_education_courses
-- Purpose: Stores course membership in the practice-education module.
-- Dependency: courses table must already exist.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS practice_education_courses (
    -- Course code
    course_code TEXT PRIMARY KEY,

    -- Course nature: 必修 / 选修
    course_nature TEXT NOT NULL CHECK (course_nature IN ('必修', '选修')),

    -- Offered term; keeps the original curriculum-plan expression, e.g. 1, 2, 5-7, A
    offered_term TEXT,

    -- Source worksheet
    source_sheet TEXT NOT NULL DEFAULT '实践教育16',

    -- Source row number
    source_row INTEGER NOT NULL CHECK (source_row > 0),

    FOREIGN KEY (course_code)
        REFERENCES courses(course_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);
