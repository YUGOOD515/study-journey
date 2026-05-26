# 学旅 app 修改汇总说明

本文用于替代 `app` 目录下分散的多个 `README_*.md`。当前版本以 v2 数据库为基础，前端默认端口为 `6173`，后端默认端口为 `6174`。

## 1. 运行方式

项目推荐目录结构：

```text
项目根目录/
├─ app/
└─ db/
   └─ course_planner_v2.sqlite
```

在 `app` 目录运行：

```bash
npm install
npm run dev
```

访问地址：

```text
前端：http://localhost:6173
后端：http://localhost:6174
健康检查：http://localhost:6174/api/health
```

默认数据库路径：

```text
../db/course_planner_v2.sqlite
```

如果数据库放在其他位置，可以用环境变量覆盖。

Windows PowerShell：

```powershell
$env:DB_PATH="C:\\path\\to\\course_planner_v2.sqlite"
npm run dev
```

macOS / Linux：

```bash
DB_PATH=/path/to/course_planner_v2.sqlite npm run dev
```

## 2. 数据库适配

后端已从旧表结构迁移到 v2 数据库结构。

旧表不再作为主要数据源：

```text
courses
program_requirements
semester_courses
manual_courses
personal_plan
credit_assignment
```

当前主要使用：

```text
plan_program_courses
plan_custom_courses
plan_program_requirements
raw_import_batches
raw_term_course_sections
raw_term_added_courses
```

其中：

```text
plan_ 表：培养方案、个人计划、成绩、垃圾篓、课程编辑
raw_ 表：学校 CSV 原始课程数据，只查询，不与 plan_ 表建立外键关系
```

后端保留 `DB_PATH` 覆盖逻辑，保留 v2 数据库健康检查。

## 3. 主要接口

常用接口包括：

```text
GET    /api/health
GET    /api/program-requirements
GET    /api/courses-with-category
GET    /api/categories
GET    /api/categories/:code/courses
GET    /api/semester-courses
GET    /api/personal-plan
POST   /api/personal-plan/official
DELETE /api/personal-plan/official/:code
POST   /api/personal-plan/manual
PATCH  /api/personal-plan/:id
DELETE /api/personal-plan/:id
PATCH  /api/plan-courses/program/:courseCode
PATCH  /api/plan-courses/custom/:id
```

raw 查询接口：

```text
GET /api/raw/batches
GET /api/raw/sections?batch_id=&course_code=&course_name=&limit=
GET /api/raw/added-courses?batch_id=&course_code=&course_name=&limit=
GET /api/raw/course-openings/:course_code
```

垃圾篓接口：

```text
GET    /api/trash
DELETE /api/personal-plan/official/:code/trash
POST   /api/trash/program/:code/restore
POST   /api/trash/custom/:id/restore
DELETE /api/trash/program/:code
DELETE /api/trash/custom/:id
POST   /api/trash/restore-all
DELETE /api/trash/empty
```

## 4. 时间轴与旅迹统计

时间轴页面默认打开“我的计划”，顶部顺序为：

```text
我的计划 | 官方计划
```

旅迹页统计口径已调整为“用户实际计划路径”：

```text
只统计已经放入我的计划时间轴的课程
不统计仍在待安排中的课程
不统计垃圾篓中的课程
不统计永久隐藏的官方课程
```

因此，`plannedTerm = null` 的课程不会进入旅迹页预计学分统计。

## 5. 待安排与垃圾篓

底部悬浮栏包含：

```text
待安排
垃圾篓
```

设计原则：

```text
不占据页面文档流
展开后悬浮在时间轴上方
课程卡片宽度与时间轴卡片一致：158px
宽度不足时自动换行，不横向滚动
课程过多时只保留纵向滚动
```

垃圾篓规则：

```text
官方课程：删除后软删除进入垃圾篓；永久删除为用户视角永久隐藏，不物理删除课程记录
自定义课程：删除后进入垃圾篓；永久删除为物理删除
```

后端启动时会自动检查并补齐垃圾篓字段：

```text
plan_program_courses.is_deleted
plan_program_courses.deleted_at
plan_program_courses.deleted_note
plan_program_courses.is_permanently_deleted
plan_custom_courses.is_deleted
plan_custom_courses.deleted_at
plan_custom_courses.deleted_note
```

## 6. 课程 hover 卡片与编辑

课程 hover 信息卡片已统一用于：

```text
时间轴课程
待安排课程
官方计划课程
我的计划课程
垃圾篓课程
```

hover 卡片展示：

```text
课程号
课程名
类别
性质
学分
学时
计划学期 / 开课学期
先修课程号
成绩
备注
经法管融通信息
```

支持在 hover 卡片内进行轻量编辑。第一阶段允许编辑：

```text
课程名
类别
课程性质
是否经法管融通
学分计入
学分
讲课学时
实践学时
课外学时
计划学期
先修课程号
成绩
备注
```

不允许修改课程号，避免主键变更导致兼容性问题。

hover 卡片已处理：

```text
鼠标从课程卡片移动到 hover 卡片时的三角形安全区
靠近浏览器底部时自动上移
内容过高时卡片内部滚动
出现 / 消失的淡入、轻微上移和缩放动效
```

垃圾篓中的 hover 卡片提供：

```text
恢复
永久删除
```

## 7. 添加课程与编辑课程口径统一

添加课程弹窗和 hover 编辑卡片使用统一字段口径：

```text
课程名
类别
课程性质
是否经法管融通
学分计入
学分
讲课学时
实践学时
课外学时
计划学期
先修课程号
成绩
备注
```

统一前端口径：

```text
course_nature：必修 / 选修 / 跨专业
is_interdisciplinary：0 / 1
assigned_to：interdisciplinary / elective
```

后端写入数据库时自动转换：

```text
普通课程：requirement_type = course_nature，credit_count_to = NULL
经法管融通课程：requirement_type = 经法管融通，credit_count_to 非空
```

这样可以满足 v2 数据库的 CHECK 约束。

经法管融通不再作为“通识·经融 / 大类·经融”混入类别按钮，而是独立开关。只有“通识教育”和“大类平台”允许开启经法管融通。

## 8. 自定义下拉菜单

课程编辑字段中的原生 `<select>` 已替换为自定义下拉菜单组件。

作用范围：

```text
添加课程：类别、性质、计划学期、学分计入
hover 编辑卡片：类别、性质、计划学期、学分计入
```

目的：避免系统原生下拉菜单直角、样式不可控的问题，使菜单弹层保持圆角、柔和边框、轻阴影和整体统一风格。

## 9. 时间轴提示 toast

时间轴中修改课程、拖拽课程、删除/恢复课程时的提示，已从文档流长条提示改为浮窗 toast。

规则：

```text
不挤压时间轴布局
未展开底部抽屉时，靠近底部悬浮栏上方
展开待安排 / 垃圾篓后，自动移动到大卡片上方
位置根据抽屉实际高度动态计算
保留淡入、轻微上移、缩放动效
支持自动消失和手动关闭
```

## 10. 重要修复记录

已修复的问题包括：

```text
/api/semester-courses 因缺少先修课程 JOIN 导致 HTTP 500
hover 卡片底部超出屏幕导致编辑按钮不可点击
关闭垃圾篓时待安排卡片短暂闪现
经法管融通自定义课程添加触发 CHECK constraint failed
待安排 / 垃圾篓课程卡片尺寸与时间轴不一致
底部抽屉横向溢出或出现横向滚动
时间轴提示位置固定、遮挡底部抽屉
```

## 11. 主要修改文件索引

后端：

```text
server/index.ts
server/db.ts
```

前端核心：

```text
src/pages/Timeline.tsx
src/pages/Trail.tsx
src/lib/api.ts
src/lib/progress.ts
src/types.ts
```

课程组件：

```text
src/components/CourseCard.tsx
src/components/ManualCourseCard.tsx
src/components/CourseHoverCard.tsx
src/components/CourseEditFields.tsx
src/components/ManualCourseDialog.tsx
src/components/CustomSelect.tsx
```

辅助逻辑：

```text
src/hooks/useHoverIntentTriangle.ts
src/lib/courseOptions.ts
```

## 12. 清理建议

如果要减少 `app` 目录下 README 文件数量，可以保留本文件作为汇总说明，并删除历史阶段性说明文件：

```text
README_BACKEND_V2.md
README_TRASH_AND_TRAIL.md
README_HOVER_EDIT.md
README_HOVER_EDIT_HOTFIX.md
README_HOVER_BOUNDARY_HOTFIX.md
README_INTERDISCIPLINARY_ADD_HOTFIX.md
README_COURSE_EDIT_UNIFIED.md
README_CUSTOM_DROPDOWN_HOTFIX.md
README_FLOATING_HINT_TOAST.md
README_DRAWER_*.md
README_FLOATING_HINT_STACK_HOTFIX.md
```

建议最终保留：

```text
README.md
```

或者将本文改名为：

```text
app/README.md
```
