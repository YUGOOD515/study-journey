-- 垃圾篓表。所有被用户"删除"的课程行（无论来自 plan_program_courses 还是 plan_custom_courses）
-- 都先写入这里的 payload（完整 JSON 快照）然后从原表删除；
-- 还原 = 从 payload 反序列化插回原表 + 从本表删除；
-- 永久删除 = 直接 DELETE 本表行。

PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE IF NOT EXISTS plan_trash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL CHECK (source_table IN ('plan_program_courses', 'plan_custom_courses')),
    course_code TEXT NOT NULL CHECK (TRIM(course_code) <> ''),
    course_name TEXT NOT NULL,
    payload TEXT NOT NULL,           -- JSON 序列化的原行
    deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_trash_course_code ON plan_trash(course_code);
CREATE INDEX IF NOT EXISTS idx_plan_trash_deleted_at ON plan_trash(deleted_at DESC);

COMMIT;
PRAGMA foreign_keys = ON;
