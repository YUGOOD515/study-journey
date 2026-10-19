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


<!-- archive-preparation:2026-10-14:start -->
## 使用与归档说明（2026-10-14）

React / Vite / Tailwind 前端与 Express / node:sqlite 后端，展示培养方案、学期课表和学习规划。主库为 db/course_planner_v2.sqlite，另有教务数据抓取和导入工具。

### 结构与入口

- `README.md`：当前项目说明。
- [app/package.json](app/package.json)：前后端开发和构建脚本。
- [app/server/index.ts](app/server/index.ts)：Express API。
- [app/server/db.ts](app/server/db.ts)：数据库路径与初始化。
- [app/src/App.tsx](app/src/App.tsx)：React 应用。
- [docs/00-document-index.md](docs/00-document-index.md)：文档索引。

### 使用前提

使用支持 node:sqlite 的 Node 版本，按 docs/02-run-and-development.md 准备数据库；在 app 内执行 npm ci、npm run dev。前端默认 6173，后端 6174。数据库缺失时不能假定会完整自动重建，迁移、种子与导入流程需结合文档；本轮未启动服务。

### 归档分工

**GitHub：** app 源码、依赖锁文件、迁移、导入脚本、docs；seeds 需确认不含真实成绩 / 个人计划后才纳入。优先沿用现有仓库，保留未提交修改。

**夸克网盘：** db/ 一致性备份、src_data/ 学校表格和 fetch/outputs 仅私人归档；公开演示应另造虚构学生数据。

### 当前限制

目前已跟踪 SQLite 且有未提交数据库修改；不能整库直接发布，也不能认为 .gitignore 会消除历史数据。

本次仅完成本地结构、关键入口与依赖检查，以及 README 准备，未验证全部运行功能。本轮未创建 GitHub 仓库或夸克分享链接，也未上传本次归档；后续归档须经目录所有者批准。

作者自有内容尚未统一选择开源许可证；第三方源码和资源沿用原许可，目录内出现的第三方许可证不自动覆盖其他文件。
<!-- archive-preparation:2026-10-14:end -->
