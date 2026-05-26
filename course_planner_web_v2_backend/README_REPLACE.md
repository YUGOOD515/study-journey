# 替换使用说明

本包结构：

```text
course_planner_web_v2_backend/
├─ app/                       修改后的 Web 项目
└─ db/
   └─ course_planner_v2.sqlite  v2 数据库副本
```

## 推荐替换方式

假设你本地当前结构是：

```text
某个文件夹/
├─ app/
└─ db/
   └─ course_planner_v2.sqlite
```

操作：

1. 先备份旧项目：

```powershell
Rename-Item app app_backup_before_v2_backend
```

2. 把本包里的 `app` 文件夹复制到原位置。

3. 数据库如果你本地已经有最新的 `db/course_planner_v2.sqlite`，不要覆盖它；如果只是测试，可以使用本包里的 `db/course_planner_v2.sqlite`。

4. 进入 app 目录：

```powershell
cd app
npm install
npm run dev
```

5. 打开：

```text
http://localhost:5173
```

6. 后端健康检查：

```text
http://localhost:5174/api/health
```

## 数据库路径

后端默认读取：

```text
../db/course_planner_v2.sqlite
```

如果你的数据库不在这里，可以临时指定：

```powershell
$env:DB_PATH="C:\\你的路径\\course_planner_v2.sqlite"
npm run dev
```

## 主要改动

后端已经从旧表切换到 v2 表：

```text
plan_program_courses
plan_custom_courses
plan_program_requirements
raw_import_batches
raw_term_course_sections
raw_term_added_courses
```

原旧表不再访问：

```text
courses
program_requirements
semester_courses
manual_courses
personal_plan
credit_assignment
```

新增 raw 查询接口：

```text
GET /api/raw/batches
GET /api/raw/sections?course_code=&course_name=&batch_id=&limit=
GET /api/raw/added-courses?course_code=&course_name=&batch_id=&limit=
GET /api/raw/course-openings/:course_code
```
