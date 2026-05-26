# 后端 v2 数据库适配说明

本版本已把后端从旧表结构迁移到 `course_planner_v2.sqlite`。

## 默认数据库位置

默认读取：

```text
../db/course_planner_v2.sqlite
```

也就是如果项目目录是：

```text
某个文件夹/
├─ app/
└─ db/
   └─ course_planner_v2.sqlite
```

则在 `app` 目录中运行：

```bash
npm run dev
```

即可连接数据库。

如果你的数据库放在别处，可以用环境变量覆盖：

Windows PowerShell：

```powershell
$env:DB_PATH="C:\\path\\to\\course_planner_v2.sqlite"
npm run dev
```

macOS / Linux：

```bash
DB_PATH=/path/to/course_planner_v2.sqlite npm run dev
```

## 已适配的接口

保留原有前端接口路径，减少前端改动：

```text
GET    /api/health
GET    /api/courses
GET    /api/courses/:code
GET    /api/program-requirements
GET    /api/semester-courses
POST   /api/semester-courses/official
PATCH  /api/semester-courses/official/:code
DELETE /api/semester-courses/official/:code
POST   /api/semester-courses/manual
PATCH  /api/semester-courses/manual/:id
DELETE /api/semester-courses/manual/:id
GET    /api/personal-plan
POST   /api/personal-plan/official
DELETE /api/personal-plan/official/:code
POST   /api/personal-plan/manual
PATCH  /api/personal-plan/:id
DELETE /api/personal-plan/:id
GET    /api/credit-assignments
PUT    /api/credit-assignments/:code
DELETE /api/credit-assignments/:code
GET    /api/categories
GET    /api/categories/:code/courses
GET    /api/courses-with-category
```

新增 raw 查询接口：

```text
GET /api/raw/batches
GET /api/raw/sections?batch_id=&course_code=&course_name=&limit=
GET /api/raw/added-courses?batch_id=&course_code=&course_name=&limit=
GET /api/raw/course-openings/:course_code
```

## v2 表映射

旧后端使用的旧表已经不再访问：

```text
courses
program_requirements
semester_courses
manual_courses
personal_plan
credit_assignment
```

现在改为：

```text
plan_program_courses
plan_custom_courses
plan_program_requirements
raw_import_batches
raw_term_course_sections
raw_term_added_courses
```

`raw_` 表只查询学校 CSV 原始数据，不和 `plan_` 表建立外键关系。

## 使用方式

1. 用本包中的文件覆盖你的 `app` 项目。
2. 确认数据库位于 `../db/course_planner_v2.sqlite`。
3. 在 `app` 目录运行：

```bash
npm install
npm run dev
```

4. 打开：

```text
http://localhost:6173
```

5. 后端健康检查：

```text
http://localhost:6174/api/health
```

## 注意

`plan_custom_courses` 没有旧版 `manual_courses.id` 字段。后端现在用 SQLite `rowid` 作为兼容 id 返回给前端，所以现有前端的手动课程编辑、删除逻辑仍可继续使用。

`updated_at` 由数据库触发器维护。后端不再手动拼接 `updated_at = datetime('now')`。
