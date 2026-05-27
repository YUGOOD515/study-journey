# 文档索引

本文档是当前项目的说明入口。旧的阶段性 Markdown 文件已经删除，正式说明统一由根目录 `README.md` 与 `docs/` 下的子文档组成。

## 推荐阅读顺序

| 顺序 | 文档 | 用途 |
|---:|---|---|
| 1 | `README.md` | 快速理解项目主线和启动方式 |
| 2 | `docs/01-project-overview.md` | 理解项目目标、业务概念和边界 |
| 3 | `docs/02-run-and-development.md` | 安装、启动、调试、常见问题 |
| 4 | `docs/03-architecture.md` | 理解目录结构、数据流和整体架构 |
| 5 | `docs/06-database-design.md` | 理解数据库表、字段和设计原则 |
| 6 | `docs/04-backend-design.md` | 理解后端接口、业务规则和拆分方向 |
| 7 | `docs/05-frontend-design.md` | 理解前端页面、组件、状态和交互 |
| 8 | `docs/07-data-import-and-raw-tables.md` | 理解学校 Excel 如何进入 raw 表 |
| 9 | `docs/08-api-reference.md` | 查询接口路径、请求字段和返回字段 |
| 10 | `docs/09-maintenance-and-refactor-plan.md` | 查看后续维护和重构路线 |

## 按任务查找

| 任务 | 阅读文件 |
|---|---|
| 第一次启动项目 | `README.md`、`docs/02-run-and-development.md` |
| 查数据库表结构 | `docs/06-database-design.md` |
| 修改后端接口 | `docs/04-backend-design.md`、`docs/08-api-reference.md` |
| 修改前端页面 | `docs/05-frontend-design.md` |
| 导入学校 Excel | `docs/07-data-import-and-raw-tables.md` |
| 判断一门课程应放哪个表 | `docs/06-database-design.md` |
| 清理旧代码或拆分后端 | `docs/09-maintenance-and-refactor-plan.md` |

## 当前正式文档清单

```text
README.md
docs/00-document-index.md
docs/01-project-overview.md
docs/02-run-and-development.md
docs/03-architecture.md
docs/04-backend-design.md
docs/05-frontend-design.md
docs/06-database-design.md
docs/07-data-import-and-raw-tables.md
docs/08-api-reference.md
docs/09-maintenance-and-refactor-plan.md
```

## 已被替代的旧文档

下列旧文档不再作为正式项目文档使用，内容已被整理进新的文档体系：

| 旧文档类型 | 新文档位置 |
|---|---|
| `app_README_summary.md` | `README.md`、`02-run-and-development.md`、`04-backend-design.md`、`05-frontend-design.md` |
| `README_database_v2.md` | `06-database-design.md` |
| `src_data导入报告_v1.md` | `07-data-import-and-raw-tables.md` |
| `raw表数据利用计划_v1.md` | `07-data-import-and-raw-tables.md`、`09-maintenance-and-refactor-plan.md` |
| 阶段性策划稿、访谈稿 | 不属于工程文档，不进入正式文档体系 |

## 文档维护规则

新增功能时，优先更新对应专题文档，不要再在功能目录下临时新增 README。只有在某个目录需要独立使用说明时，才允许新增局部 README，并且必须在 `00-document-index.md` 中登记。

涉及数据库结构变化时，同时更新：

1. `migrations/` 中的 SQL 文件。
2. `docs/06-database-design.md` 中的表结构说明。
3. `docs/08-api-reference.md` 中受影响的接口字段。

涉及接口变化时，同时更新：

1. `docs/04-backend-design.md` 的模块说明。
2. `docs/08-api-reference.md` 的接口说明。
3. `docs/05-frontend-design.md` 中对应前端调用位置。
