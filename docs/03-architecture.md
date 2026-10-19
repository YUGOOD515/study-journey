# 项目架构说明

> **注意（多用户版）**：项目已迁移到 Cloudflare Workers + D1，本文中 Express、`DB_PATH`、单用户表的描述已过时，运行、部署与数据库以 [`18-cloudflare-deployment.md`](18-cloudflare-deployment.md) 为准。

## 1. 总体架构

当前项目采用轻量本地架构：

```text
React 前端
   ↓ HTTP / JSON
Express 后端
   ↓ SQL
SQLite 数据库
```

学校 Excel 原始数据通过 Python 脚本导入 SQLite 的 `raw_*` 表。前端不直接读取 SQLite，也不直接读取 Excel。

## 2. 当前目录职责

```text
项目根目录/
├─ app/                 # 正式运行应用
│  ├─ server/           # Express 后端
│  └─ src/              # React 前端
├─ db/                  # SQLite 主库与数据库文件
├─ migrations/          # 数据库结构迁移 SQL
├─ scripts/             # Python 数据导入脚本
├─ seeds/               # 初始化/历史种子数据
├─ src_data/            # 学校原始 Excel 文件
└─ docs/                # 当前正式文档
```

### 2.1 `app/`

`app/` 是正式运行目录。里面同时包含前端和后端：

```text
app/
├─ server/     # 后端
├─ src/        # 前端
├─ package.json
└─ vite.config.ts
```

### 2.2 `app/server/`

当前后端由三类文件构成：

| 文件 | 行数 | 说明 |
|---|---:|---|
| `app/server/index.ts` | 1529 | Express 入口、路由、SQL、校验和业务逻辑集中在一起 |
| `app/server/db.ts` | 175 | SQLite 连接、路径解析、表结构检查/补丁 |
| `app/server/apply-migration.ts` | 51 | 执行迁移 SQL 的脚本 |

当前主要问题是 `index.ts` 过大，长期应拆分为 routes、services、repositories。

### 2.3 `app/src/`

前端核心结构：

```text
app/src/
├─ pages/          # 页面级组件
├─ components/     # 通用组件和课程卡片组件
├─ lib/            # API、统计、显示辅助函数
├─ hooks/          # 自定义 hook
├─ types.ts        # 前端类型定义
└─ main.tsx        # 前端入口
```

当前最大的前端文件：

| 文件 | 行数 | 说明 |
|---|---:|---|
| `app/src/pages/Timeline.tsx` | 1779 | 时间轴主页面，包含大量状态和交互 |
| `app/src/pages/Trail.tsx` | 762 | 旅迹页和学分可视化 |
| `app/src/components/CourseHoverCard.tsx` | 357 | 课程 hover 信息卡和编辑入口 |

## 3. 数据流

### 3.1 学校原始数据流

```text
src_data/*.xlsx / *.xls
        ↓
scripts/import_src_data.py
        ↓
raw_import_batches
raw_term_course_sections
raw_term_added_courses
raw_course_catalog_previews
        ↓
/api/raw/*
        ↓
前端候选课程查询、开课信息查询
```

raw 数据只描述学校文件中的事实，不表示用户已经选择或计划修读。

### 3.2 培养方案与个人计划数据流

```text
plan_program_requirements     # 学分要求
plan_program_courses          # 官方培养方案课程
plan_custom_courses           # 用户自选/自定义课程
        ↓
/api/program-requirements
/api/courses
/api/personal-plan
/api/semester-courses
/api/trash
        ↓
时间轴、旅迹页、课程卡片、垃圾篓
```

### 3.3 删除与恢复数据流

```text
官方课程删除
    → plan_program_courses.is_deleted = 1
    → 进入垃圾篓
    → 恢复时 is_deleted = 0
    → 永久删除时 is_permanently_deleted = 1，不物理删除

自定义课程删除
    → plan_custom_courses.is_deleted = 1
    → 进入垃圾篓
    → 恢复时 is_deleted = 0
    → 永久删除时物理 DELETE
```

## 4. 业务边界

项目数据分为三层：

| 层 | 表 | 说明 |
|---|---|---|
| 培养方案层 | `plan_program_requirements`、`plan_program_courses` | 由培养方案决定的结构性课程与学分要求 |
| 用户计划层 | `plan_custom_courses`，以及 `plan_program_courses` 中的用户状态字段 | 用户计划、成绩、实际学期、删除状态 |
| 学校原始数据层 | `raw_*` | 学校 Excel 导入的原始开课事实 |

当前 `plan_program_courses` 同时保存官方课程属性和用户状态字段，这是可运行的简化设计，但长期存在耦合。后续可考虑拆出用户计划状态表。

## 5. 当前架构问题

| 问题 | 影响 | 优先级 |
|---|---|---|
| `app/server/index.ts` 过大 | 改一个接口容易影响其他接口 | 高 |
| `Timeline.tsx` 过大 | 前端交互难以维护 | 高 |
| `migrations/` 中 v1 和 v2 混杂 | 新开发者难以判断哪些迁移仍有效 | 中 |
| `seeds/` 中旧种子数据仍保留 | 与 v2 数据库关系不清楚 | 中 |
| `db.ts` 启动时自动补字段 | 开发方便，但结构变更不够显式 | 中 |
| raw 表与 plan 表关联规则散在代码中 | 后续候选课程功能容易重复写逻辑 | 中 |

## 6. 目标架构

项目不需要大型框架，也不建议过早引入 ORM。较合适的目标是：

```text
app/server/
├─ main.ts
├─ app.ts
├─ config/
├─ db/
├─ shared/
└─ modules/
   ├─ health/
   ├─ requirements/
   ├─ courses/
   ├─ personal-plan/
   ├─ semester-records/
   ├─ trash/
   ├─ raw/
   └─ categories/
```

其中：

| 层 | 职责 |
|---|---|
| routes | HTTP 请求、响应、状态码 |
| services | 业务规则和跨表操作 |
| repositories | SQL 查询和写入 |
| mappers | 数据库字段与 API 字段转换 |
| validators | 请求参数校验 |
| db | 连接、PRAGMA、迁移检查 |

重构应分阶段进行，先拆文件，不改行为；再抽公共函数；最后抽 service/repo。
