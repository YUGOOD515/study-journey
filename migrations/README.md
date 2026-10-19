# 本地 SQLite 导入库建表脚本

线上数据库是 Cloudflare D1，迁移在 `d1/migrations/`，**以那里为准**。

本目录只用于在本地生成「学校数据导入库」`db/course_planner_v2.sqlite`，再由
`scripts/build_d1_seed.py` 生成 D1 的公共数据种子。执行顺序：

1. `v2_001_create_tables.sql`
2. `v2_002_add_trash_fields.sql`
3. `v2_003_raw_catalog_preview.sql`
4. `v2_004_raw_actual_course_meetings.sql`
5. `015_create_my_plan_courses.sql`

v1 时代的 `001`–`014` 迁移和 `seeds/` 种子已删除，需要时可在 Git 历史中找回。
