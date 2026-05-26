-- migrations/012_add_interdisciplinary_flag.sql
-- 给 personal_plan 与 manual_courses 添加 经法管融通 旗标与归属字段。
--
--   is_interdisciplinary INTEGER  : 0/1，是否标记为经法管融通
--   assigned_to          TEXT     : 'interdisciplinary' | 'elective'，
--                                   仅 is_interdisciplinary=1 时有意义；
--                                   默认 'interdisciplinary' = 计入大类平台·经法管融通桶；
--                                   切换为 'elective' = 计入自己 category_code 对应的选修桶。
--
-- 业务层只允许 is_interdisciplinary=1 出现在 category_code IN
--   ('general_education','major_platform') 上；API 层会校验，DB 层不强约束（SQLite ALTER 限制）。

PRAGMA foreign_keys = ON;

ALTER TABLE personal_plan
  ADD COLUMN is_interdisciplinary INTEGER NOT NULL DEFAULT 0;

ALTER TABLE personal_plan
  ADD COLUMN assigned_to TEXT NOT NULL DEFAULT 'interdisciplinary';

ALTER TABLE manual_courses
  ADD COLUMN is_interdisciplinary INTEGER NOT NULL DEFAULT 0;

ALTER TABLE manual_courses
  ADD COLUMN assigned_to TEXT NOT NULL DEFAULT 'interdisciplinary';
