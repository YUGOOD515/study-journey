-- migrations/002_create_general_education_courses.sql
-- 表中文名：通识教育课程表
-- 说明：本表只记录课程在“通识教育”模块中的归属关系，不重复保存课程名称、学分、学时等课程本体信息。
-- 依赖：必须先存在 courses 表。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS general_education_courses (
    -- 课程号
    course_code TEXT PRIMARY KEY,

    -- 课程性质：必修 / 选修 / 跨专业
    course_nature TEXT NOT NULL CHECK (course_nature IN ('必修', '选修', '跨专业')),

    -- 课程类别：选修类别、跨专业类别等；必修课可为空
    course_category TEXT,

    -- 开课学期：保留培养方案中的原始写法，例如 1、2、1-8
    offered_term TEXT,

    -- 来源工作表
    source_sheet TEXT NOT NULL DEFAULT '通识教育48',

    -- 来源行号
    source_row INTEGER NOT NULL CHECK (source_row > 0),

    FOREIGN KEY (course_code)
        REFERENCES courses(course_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);