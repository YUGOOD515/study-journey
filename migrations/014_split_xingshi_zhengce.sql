-- migrations/014_split_xingshi_zhengce.sql
-- 把"形势与政策(1—8)"（B2490014，2 学分，offered_term="1-8"）拆成 8 门，
-- 每学期一门、每门 0.25 学分，分别锁定到学期 1..8。
--
-- 旧数据：
--   courses: B2490014 / 形势与政策(1—8) / 2.0
--   general_education_courses: B2490014 / 必修 / "1-8"
--   personal_plan: 可能有一条 B2490014 的 override（需清理，因为 FK ON DELETE CASCADE）
--   semester_courses: 暂无已修记录
--
-- 新数据：
--   B2490014_1 .. B2490014_8 / 形势与政策(1) .. 形势与政策(8) / 0.25 学分
--   general_education_courses 各一条 / 必修 / offered_term="1".."8"

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- 1. 删旧的子表行（general_education_courses 对 courses 是 ON DELETE RESTRICT，必须先删）
DELETE FROM general_education_courses WHERE course_code = 'B2490014';
DELETE FROM personal_plan      WHERE course_code = 'B2490014';
DELETE FROM semester_courses   WHERE course_code = 'B2490014';
DELETE FROM credit_assignment  WHERE course_code = 'B2490014';
DELETE FROM courses            WHERE course_code = 'B2490014';

-- 2. 插入 8 门新课
INSERT INTO courses (course_code, course_name, credits) VALUES
  ('B2490014_1', '形势与政策(1)', 0.25),
  ('B2490014_2', '形势与政策(2)', 0.25),
  ('B2490014_3', '形势与政策(3)', 0.25),
  ('B2490014_4', '形势与政策(4)', 0.25),
  ('B2490014_5', '形势与政策(5)', 0.25),
  ('B2490014_6', '形势与政策(6)', 0.25),
  ('B2490014_7', '形势与政策(7)', 0.25),
  ('B2490014_8', '形势与政策(8)', 0.25);

-- 3. 插入对应的通识子表行（每门锁定一个学期）
INSERT INTO general_education_courses
  (course_code, course_nature, course_category, offered_term, source_sheet, source_row) VALUES
  ('B2490014_1', '必修', NULL, '1', '迁移014_拆分形势与政策', 1),
  ('B2490014_2', '必修', NULL, '2', '迁移014_拆分形势与政策', 2),
  ('B2490014_3', '必修', NULL, '3', '迁移014_拆分形势与政策', 3),
  ('B2490014_4', '必修', NULL, '4', '迁移014_拆分形势与政策', 4),
  ('B2490014_5', '必修', NULL, '5', '迁移014_拆分形势与政策', 5),
  ('B2490014_6', '必修', NULL, '6', '迁移014_拆分形势与政策', 6),
  ('B2490014_7', '必修', NULL, '7', '迁移014_拆分形势与政策', 7),
  ('B2490014_8', '必修', NULL, '8', '迁移014_拆分形势与政策', 8);

COMMIT;

PRAGMA foreign_keys = ON;
