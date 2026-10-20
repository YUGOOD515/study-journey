# 维护与重构计划

## 1. 当前已完成的清理

本轮文档整理已经完成：

```text
删除旧 Markdown 文件
建立根 README.md
建立 docs/ 文档体系
移除旧整包目录在正式文档中的引用
```

当前正式文档只保留：

```text
README.md
docs/*.md
```

## 2. 当前主要问题

| 问题 | 当前表现 | 优先级 |
|---|---|---|
| 后端入口过大 | `app/server/index.ts` 1529 行 | 高 |
| 时间轴页面过大 | `app/src/pages/Timeline.tsx` 1779 行 | 高 |
| 数据库迁移体系混杂 | `migrations/` 同时存在 v1 与 v2 文件 | 中 |
| 旧 seeds 仍保留 | `seeds/` 中旧表种子和 v2 种子混放 | 中 |
| raw 查询尚未充分产品化 | raw 表数据丰富，但前端候选课程功能仍可扩展 | 中 |
| API 字段转换散落 | `course_nature`、`requirement_type`、`credit_count_to` 等转换不够集中 | 中 |

## 3. 短期重构计划

### 3.1 拆分后端 routes

目标：不改变行为，只把 `index.ts` 拆成多个路由文件。

建议结构：

```text
app/server/modules/health/health.routes.ts
app/server/modules/requirements/requirements.routes.ts
app/server/modules/courses/courses.routes.ts
app/server/modules/personal-plan/personalPlan.routes.ts
app/server/modules/semester-records/semesterRecords.routes.ts
app/server/modules/trash/trash.routes.ts
app/server/modules/raw/raw.routes.ts
app/server/modules/categories/categories.routes.ts
```

完成标准：

```text
index.ts 少于 100 行
所有接口路径和返回结果保持不变
npm run build 通过
/api/health 正常
```

### 3.2 抽出 shared 工具函数

移动校验和转换函数：

```text
validateTerm
validateCredits
validateScore
validateCoursePatch
scoreToStudyStatus
assignmentToCreditCountTo
creditCountToToAssignment
visibleCourseNature
storedCustomRequirementType
programActiveWhere
customActiveWhere
```

完成标准：

```text
routes 文件不再重复定义公共校验函数
课程字段转换位置集中
```

### 3.3 拆分 Timeline 页面

建议拆分：

```text
TimelineHeader
TimelineTermColumn
TimelineCourseList
BottomDrawer
UnscheduledDrawer
TrashDrawer
TimelineToast
useTimelineData
useTimelineActions
```

完成标准：

```text
Timeline.tsx 少于 600 行
课程卡片渲染逻辑和抽屉逻辑分离
```

## 4. 中期重构计划

### 4.1 抽 service/repo

目标后端层次：

```text
routes      HTTP 请求响应
services    业务规则
repositories SQL 访问
mappers     字段转换
validators  请求校验
```

优先从垃圾篓模块开始，因为它业务规则最清晰：

```text
官方课程永久隐藏，不物理删除
自定义课程永久删除，物理删除
```

### 4.2 整理 migrations

建议将 v1 和 v2 迁移分离：

```text
migrations/
├─ archive-v1/
└─ v2/
```

或者保留现状但在 `migrations/README.md` 中说明哪些是当前有效迁移。由于本轮要求删除旧 MD，暂时没有新增局部 README；后续如果重构 migrations，可新增并同步登记到 `docs/00-document-index.md`。

### 4.3 整理 seeds

旧 seeds 对当前 v2 数据库的作用不清晰。建议：

```text
seeds/archive-v1/
seeds/v2_001_insert_data.sql
```

后续只保留 v2 初始化路径。

### 4.4 建立数据库检查脚本

建议新增：

```text
scripts/check_database.py
```

检查内容：

```text
PRAGMA integrity_check
PRAGMA foreign_key_check
必要表是否存在
通识教育选修/跨专业是否误入 plan_program_courses
plan_custom_courses 是否没有 is_permanently_deleted
raw 表行数是否异常
```

## 5. 长期重构计划

### 5.1 拆分官方课程定义与用户状态

当前 `plan_program_courses` 同时保存官方课程定义和用户状态。长期可拆成：

```text
program_courses
user_program_course_states
```

优点：

```text
官方培养方案更稳定
用户计划和成绩更清晰
删除/恢复逻辑更自然
多用户扩展更容易
```

不建议短期马上做，因为会牵动大量前后端接口。

### 5.2 完善候选课程系统

基于 raw 表建立候选课程查询：

```text
按学期筛选
按模块筛选
按开课单位筛选
按课程名/课程号搜索
显示是否已加入我的计划
一键加入 plan_custom_courses
```

### 5.3 增加测试

优先测试：

```text
垃圾篓行为
通识选修/跨专业归属
经法管融通学分计入
raw 查询接口
学分统计口径
```

## 6. 不建议立即做的事

| 不建议事项 | 原因 |
|---|---|
| 立即引入 NestJS | 项目规模还不需要，迁移成本高 |
| 立即引入 ORM | SQLite + 明确 SQL 更透明，当前表结构较简单 |
| 立即拆数据库大表 | 会牵动前后端，不适合和功能开发同时进行 |
| 合并 raw 表和 plan 表 | 两者语义不同，合并会污染用户计划数据 |
| 删除 v1 migrations 而不留说明 | 后续可能需要追溯早期结构来源 |

## 7. 推荐下一步执行顺序

1. 运行项目，确认本轮文档整理和旧 MD 删除没有影响功能。
2. 拆后端 routes，保持行为不变。
3. 抽 shared 校验和 mapper。
4. 抽 trash service/repo，作为后端分层样板。
5. 拆 Timeline 页面。
6. 增加数据库检查脚本。
7. 再考虑整理 migrations 和 seeds。
