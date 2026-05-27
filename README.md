# 学旅 Study Journey

学旅是一个面向本科课程规划的本地 Web 应用，用于管理培养方案课程、用户自选课程、八学期时间轴、学分进度、垃圾篓，以及学校原始开课数据查询。

当前项目以 `app/` 为正式运行目录，以 `db/course_planner_v2.sqlite` 为主数据库。旧的阶段性 Markdown 文件已经删除，正式文档统一放在 `docs/` 下。

## 快速启动

```bash
cd app
npm install
npm run dev
```

启动后访问：

```text
前端：http://localhost:6173
后端：http://localhost:6174
健康检查：http://localhost:6174/api/health
```

默认数据库路径为：

```text
../db/course_planner_v2.sqlite
```

如果数据库放在其他位置，可以通过环境变量覆盖：

```bash
DB_PATH=/absolute/or/relative/path.sqlite npm run dev
```

## 当前主目录

```text
项目根目录/
├─ app/          # React 前端 + Express 后端
├─ db/           # SQLite 主库
├─ migrations/   # 数据库迁移 SQL
├─ scripts/      # 学校原始数据导入脚本
├─ seeds/        # 初始化/历史种子数据
├─ src_data/     # 学校原始 Excel 数据
└─ docs/         # 当前正式文档体系
```

## 核心数据原则

项目当前采用三类数据边界：

```text
plan_program_courses   官方培养方案课程
plan_custom_courses    用户自选/自定义课程
raw_*                  学校原始开课数据
```

通识教育中的选修课、跨专业课属于用户自选范围，当前已从 `plan_program_courses` 迁入 `plan_custom_courses`。官方培养方案课程可以软删除并永久隐藏，但不做物理删除；自定义课程可以进入垃圾篓，也可以被物理删除。

## 文档导航

建议按以下顺序阅读：

1. [文档索引](docs/00-document-index.md)
2. [项目总览](docs/01-project-overview.md)
3. [运行与开发说明](docs/02-run-and-development.md)
4. [项目架构说明](docs/03-architecture.md)
5. [后端设计说明](docs/04-backend-design.md)
6. [前端设计说明](docs/05-frontend-design.md)
7. [数据库设计说明](docs/06-database-design.md)
8. [数据导入与 raw 表说明](docs/07-data-import-and-raw-tables.md)
9. [API 接口说明](docs/08-api-reference.md)
10. [维护与重构计划](docs/09-maintenance-and-refactor-plan.md)

## 当前状态摘要

- 前端：React + Vite，默认端口 `6173`。
- 后端：Express + `node:sqlite`，默认端口 `6174`。
- 数据库：SQLite v2，主库 `db/course_planner_v2.sqlite`。
- 当前数据库共有 `7` 张业务表，其中 `plan_program_courses` `75` 行，`plan_custom_courses` `21` 行。
- 学校原始数据已导入 `raw_*` 表，`raw_term_course_sections` `9864` 行，`raw_term_added_courses` `117` 行，`raw_course_catalog_previews` `1178` 行。

## 注意事项

不要把 `raw_*` 表直接当作用户课程计划表。`raw_*` 只保存学校原始事实，用户状态应写入 `plan_program_courses` 或 `plan_custom_courses`。

不要把通识教育选修、通识教育跨专业课程放回 `plan_program_courses`。这些课程是用户选择的课程，应放在 `plan_custom_courses`。

不要在普通开发中直接修改 SQLite 二进制文件后忘记同步迁移说明。结构变化应优先写入 `migrations/`。
