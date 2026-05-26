-- migrations/011_create_credit_assignment.sql
-- Table: credit_assignment
-- Purpose: 经法管融通课程默认计入「大类平台·经法管融通」；本表保存用户手动覆盖：
--          assigned_to='elective' 时，把该课从经法管融通搬回"原属板块·选修"。
--          没有覆盖记录 = 走默认（interdisciplinary）。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS credit_assignment (
    course_code TEXT PRIMARY KEY,
    assigned_to TEXT NOT NULL CHECK (assigned_to IN ('interdisciplinary', 'elective')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_code)
        REFERENCES courses(course_code)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);
