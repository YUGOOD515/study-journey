PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS courses;

CREATE TABLE courses (
    -- 课程号
    course_code TEXT PRIMARY KEY,

    -- 课程名称
    course_name TEXT NOT NULL,

    -- 学分
    credits REAL NOT NULL CHECK (credits >= 0),

    -- 课堂学时
    lecture_hours INTEGER NOT NULL DEFAULT 0 CHECK (lecture_hours >= 0),

    -- 实验学时
    experiment_hours INTEGER NOT NULL DEFAULT 0 CHECK (experiment_hours >= 0),

    -- 课外学时
    extra_hours INTEGER NOT NULL DEFAULT 0 CHECK (extra_hours >= 0),

    -- 先修课程号
    prerequisite_course_code TEXT,

    CHECK (TRIM(course_code) <> ''),
    CHECK (TRIM(course_name) <> ''),

    FOREIGN KEY (prerequisite_course_code)
        REFERENCES courses(course_code)
);