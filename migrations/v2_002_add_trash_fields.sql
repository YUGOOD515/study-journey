-- v2_002_add_trash_fields.sql
-- 为“课程删除与垃圾篓”机制增加软删除字段。
-- SQLite 旧版本不支持 ADD COLUMN IF NOT EXISTS；本项目后端启动时也会自动检查并补齐这些字段。

ALTER TABLE plan_program_courses ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1));
ALTER TABLE plan_program_courses ADD COLUMN deleted_at TEXT;
ALTER TABLE plan_program_courses ADD COLUMN deleted_note TEXT;
ALTER TABLE plan_program_courses ADD COLUMN is_permanently_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_permanently_deleted IN (0, 1));

ALTER TABLE plan_custom_courses ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1));
ALTER TABLE plan_custom_courses ADD COLUMN deleted_at TEXT;
ALTER TABLE plan_custom_courses ADD COLUMN deleted_note TEXT;

CREATE INDEX IF NOT EXISTS idx_plan_program_courses_trash
  ON plan_program_courses(is_deleted, is_permanently_deleted, deleted_at);

CREATE INDEX IF NOT EXISTS idx_plan_custom_courses_trash
  ON plan_custom_courses(is_deleted, deleted_at);
