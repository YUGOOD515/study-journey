# 后端设计说明

## 1. 当前后端位置

当前正式后端代码位于：

```text
app/server/
```

文件如下：

| 文件 | 作用 |
|---|---|
| `index.ts` | Express 应用入口，注册全部 API，包含大量 SQL 与业务规则 |
| `db.ts` | SQLite 连接、数据库路径解析、表结构检查与字段补齐 |
| `apply-migration.ts` | 执行单个迁移 SQL 文件 |

## 2. 当前后端依赖

后端主要依赖：

| 依赖 | 用途 |
|---|---|
| `express` | HTTP API 服务 |
| `cors` | 允许前端跨端口访问后端 |
| `node:sqlite` | SQLite 同步数据库访问 |
| `tsx` | TypeScript 开发环境运行 |

## 3. 当前后端问题

当前 `index.ts` 有 `1529` 行，承担了过多职责：

```text
Express 初始化
路由注册
请求参数校验
业务规则判断
SQL 拼接和执行
数据库字段转换
垃圾篓规则
raw 查询逻辑
错误处理
服务启动
```

这会造成三个问题：

1. 任何一个接口变化都可能影响整份文件。
2. SQL、业务规则和 HTTP 响应混在一起，难以测试。
3. 官方课程、自定义课程、raw 数据的边界容易在代码里重复判断。

## 4. 当前 API 分组

当前后端共注册 `37` 个 API 路由。

### 4.1 健康检查

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/health | app/server/index.ts:209 |

### 4.2 培养方案要求

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/program-requirements | app/server/index.ts:246 |

### 4.3 课程查询与课程编辑

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/courses | app/server/index.ts:225 |
| GET | /api/courses/:code | app/server/index.ts:232 |
| PATCH | /api/plan-courses/program/:code | app/server/index.ts:709 |
| PATCH | /api/plan-courses/custom/:id | app/server/index.ts:768 |
| GET | /api/courses-with-category | app/server/index.ts:1422 |

### 4.4 学期修读记录

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/semester-courses | app/server/index.ts:283 |
| POST | /api/semester-courses/official | app/server/index.ts:375 |
| PATCH | /api/semester-courses/official/:code | app/server/index.ts:410 |
| DELETE | /api/semester-courses/official/:code | app/server/index.ts:457 |
| POST | /api/semester-courses/manual | app/server/index.ts:586 |
| PATCH | /api/semester-courses/manual/:id | app/server/index.ts:599 |
| DELETE | /api/semester-courses/manual/:id | app/server/index.ts:687 |

### 4.5 个人计划

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/personal-plan | app/server/index.ts:841 |
| POST | /api/personal-plan/official | app/server/index.ts:943 |
| DELETE | /api/personal-plan/official/:code | app/server/index.ts:988 |
| POST | /api/personal-plan/manual | app/server/index.ts:1020 |
| PATCH | /api/personal-plan/:id | app/server/index.ts:1035 |
| DELETE | /api/personal-plan/:id | app/server/index.ts:1114 |
| DELETE | /api/personal-plan/official/:code/trash | app/server/index.ts:1135 |

### 4.6 垃圾篓

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/trash | app/server/index.ts:1153 |
| POST | /api/trash/program/:code/restore | app/server/index.ts:1242 |
| POST | /api/trash/custom/:id/restore | app/server/index.ts:1260 |
| DELETE | /api/trash/program/:code | app/server/index.ts:1279 |
| DELETE | /api/trash/custom/:id | app/server/index.ts:1298 |
| POST | /api/trash/restore-all | app/server/index.ts:1309 |
| DELETE | /api/trash/empty | app/server/index.ts:1327 |

### 4.7 学分归属

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/credit-assignments | app/server/index.ts:1343 |
| PUT | /api/credit-assignments/:code | app/server/index.ts:1361 |
| DELETE | /api/credit-assignments/:code | app/server/index.ts:1388 |

### 4.8 分类

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/categories | app/server/index.ts:1398 |
| GET | /api/categories/:code/courses | app/server/index.ts:1402 |

### 4.9 raw 原始数据

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/raw/batches | app/server/index.ts:1447 |
| GET | /api/raw/sections | app/server/index.ts:1454 |
| GET | /api/raw/added-courses | app/server/index.ts:1477 |
| GET | /api/raw/course-openings/:code | app/server/index.ts:1500 |

## 5. 后端核心业务规则

### 5.1 官方课程

官方课程存放在 `plan_program_courses`。规则：

```text
可以加入/移出我的计划
可以修改计划学期、实际学期、成绩、备注等用户状态
可以软删除进入垃圾篓
可以永久隐藏
不能物理删除
```

永久隐藏通过字段实现：

```text
is_permanently_deleted = 1
```

这个字段的意义不是“数据库里删除”，而是“用户视角不再显示”。数据库仍保留官方培养方案的最后备份。

### 5.2 自定义课程

自定义课程存放在 `plan_custom_courses`。规则：

```text
可以添加
可以编辑
可以进入垃圾篓
可以恢复
可以物理删除
```

自定义课程不需要 `is_permanently_deleted`。因为它本身就是用户创建或用户选择的课程，不承担官方培养方案备份职责。

### 5.3 通识教育选修与跨专业课程

当前数据库原则：

```text
通识教育-必修      → plan_program_courses
通识教育-选修      → plan_custom_courses
通识教育-跨专业    → plan_custom_courses
通识教育-经法管融通 → plan_custom_courses
```

不要把通识教育选修/跨专业课程放回 `plan_program_courses`。

### 5.4 raw 表

raw 表只读，不写用户状态。后端可以通过 raw 接口查询：

```text
开课批次
教学班
补退选新增课
课程开设记录
```

但 raw 表不应直接参与：

```text
成绩
计划学期
垃圾篓
是否已修读
是否正在修读
```

## 6. 数据库访问规则

当前后端使用同步 SQLite。访问规则建议如下：

1. 所有数据库连接从统一连接层取得。
2. 所有 SQL 写入都应该明确知道写入的是 `plan_program_courses` 还是 `plan_custom_courses`。
3. raw 表查询应放在独立模块，不和用户计划逻辑混写。
4. 数据库结构变化应写入 `migrations/`，不应长期依赖启动时自动 `ALTER TABLE`。

## 7. 建议目标结构

后端建议重构为：

```text
app/server/
├─ main.ts
├─ app.ts
├─ config/
│  └─ env.ts
├─ db/
│  ├─ connection.ts
│  ├─ schema-check.ts
│  └─ migrate.ts
├─ shared/
│  ├─ constants.ts
│  ├─ errors.ts
│  ├─ validators.ts
│  └─ mappers.ts
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

## 8. 模块职责

| 模块 | 职责 |
|---|---|
| `health` | 健康检查、数据库连通性、表结构检查结果 |
| `requirements` | 培养方案学分要求查询 |
| `courses` | 官方课程、自定义课程、课程编辑、课程字段转换 |
| `personal-plan` | 我的计划、待安排、计划学期调整 |
| `semester-records` | 已修、正在修读、成绩、实际学期 |
| `trash` | 垃圾篓、恢复、永久隐藏/物理删除 |
| `raw` | 学校原始数据查询 |
| `categories` | 类别列表、分类课程查询 |

## 9. 建议拆分顺序

### 第一步：只拆 routes

把 `index.ts` 中的路由按模块移动，不改 SQL 和业务逻辑。目标是把 `index.ts` 降到 50 行以内。

### 第二步：抽 shared

移动公共函数：

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
courseSelectSql
sendDbError
```

### 第三步：抽 repositories

所有 `db.prepare(...).get/all/run` 移到 repo 文件中。routes 不再直接写 SQL。

### 第四步：抽 services

把业务规则集中到 service 文件。例如：

```text
官方课程永久删除 = is_permanently_deleted = 1
自定义课程永久删除 = DELETE FROM plan_custom_courses
raw 表 = 只读
通识选修/跨专业 = plan_custom_courses
```

### 第五步：收敛 API 字段

统一 `course_nature`、`requirement_type`、`is_interdisciplinary`、`assigned_to`、`credit_count_to` 的转换位置，避免前后端多处重复转换。
