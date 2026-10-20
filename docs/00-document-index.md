# 文档索引

本文档是当前项目的说明入口。正式说明由根目录 `README.md` 与 `docs/` 下的子文档组成，阶段性文档放在 `docs/archive/`。

## 推荐阅读顺序

> 运行、部署、数据以 `docs/18-cloudflare-deployment.md` 为准。01–08 中关于 Express / 本地 SQLite 的描述属于迁移前的旧架构，仅作业务背景参考。

| 顺序 | 文档 | 用途 |
|---:|---|---|
| 1 | `README.md` | 快速理解项目主线和启动方式 |
| 2 | `docs/18-cloudflare-deployment.md` | **Cloudflare 部署、多用户与账号体系（以此为准）** |
| 3 | `docs/01-project-overview.md` | 理解项目目标、业务概念和边界 |
| 4 | `docs/02-run-and-development.md` | 安装、启动、调试、常见问题 |
| 5 | `docs/03-architecture.md` | 理解目录结构、数据流和整体架构 |
| 6 | `docs/06-database-design.md` | 理解数据库表、字段和设计原则 |
| 7 | `docs/04-backend-design.md` | 理解后端接口、业务规则 |
| 8 | `docs/05-frontend-design.md` | 理解前端页面、组件、状态和交互 |
| 9 | `docs/07-data-import-and-raw-tables.md` | 理解学校 Excel 如何进入 raw 表 |
| 10 | `docs/08-api-reference.md` | 查询接口路径、请求字段和返回字段 |
| 11 | `docs/10-api-redesign.md` | API 契约与课程状态机 |
| 12 | `docs/16-credit-rule-finalization-and-frontend-plan.md` | 经法管融通学分口径定稿 |
| 13 | `docs/15-经法管融通学分规则-需求对齐问卷.md` | 经法管融通业务规则需求确认（16 的依据） |
| 14 | `docs/19-demo-mode.md` | 示例模式（临时账号、示例数据生成规则） |

## 归档文档

`docs/archive/` 下是阶段性的计划、分析和状态快照，内容可能已过时，只作历史参考：

| 文档 | 内容 |
|---|---|
| `docs/archive/09-maintenance-and-refactor-plan.md` | 迁移前的维护与重构计划 |
| `docs/archive/12-actual-schedule-and-course-selection-view-plan.md` | 学期课表数据导入与选课界面设计 |
| `docs/archive/13-term-schedule-redesign-plan.md` | 学期课表界面视觉升级计划 |
| `docs/archive/14-codebase-analysis-2026-05-29.md` | 2026-05-29 代码质量分析 |
| `docs/archive/17-project-status-and-roadmap-2026-05-31.md` | 2026-05-31 项目近况与路线图 |

## 按任务查找

| 任务 | 阅读文件 |
|---|---|
| 第一次启动项目 | `README.md`、`docs/18-cloudflare-deployment.md` |
| 部署到 Cloudflare / 导入个人数据 | `docs/18-cloudflare-deployment.md` |
| 查数据库表结构 | `d1/migrations/`、`docs/06-database-design.md` |
| 修改后端接口 | `docs/04-backend-design.md`、`docs/08-api-reference.md` |
| 修改前端页面 | `docs/05-frontend-design.md` |
| 导入学校 Excel | `docs/07-data-import-and-raw-tables.md` |
| 查询 API 契约 / 状态机 | `docs/10-api-redesign.md` |
| 学分统计口径 | `docs/16-credit-rule-finalization-and-frontend-plan.md` |

## 已被替代的旧文档

下列旧文档不再作为正式项目文档使用，内容已被整理进新的文档体系：

| 旧文档类型 | 新文档位置 |
|---|---|
| `app_README_summary.md` | `README.md`、`02-run-and-development.md`、`04-backend-design.md`、`05-frontend-design.md` |
| `README_database_v2.md` | `06-database-design.md` |
| `src_data导入报告_v1.md` | `07-data-import-and-raw-tables.md` |
| `raw表数据利用计划_v1.md` | `07-data-import-and-raw-tables.md` |
| 阶段性策划稿、访谈稿 | 不属于工程文档，不进入正式文档体系 |

## 文档维护规则

新增功能时，优先更新对应专题文档，不要再在功能目录下临时新增 README。只有在某个目录需要独立使用说明时，才允许新增局部 README，并且必须在 `00-document-index.md` 中登记。

涉及数据库结构变化时，同时更新：

1. `d1/migrations/` 中的 SQL 文件（线上 D1）；只影响本地导入库时改 `migrations/`。
2. `docs/06-database-design.md` 中的表结构说明。
3. `docs/08-api-reference.md` 中受影响的接口字段。

涉及接口变化时，同时更新：

1. `docs/04-backend-design.md` 的模块说明。
2. `docs/08-api-reference.md` 的接口说明。
3. `docs/05-frontend-design.md` 中对应前端调用位置。
