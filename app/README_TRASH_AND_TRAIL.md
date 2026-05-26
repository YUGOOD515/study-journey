# 本次修改：旅迹统计口径与垃圾篓

## 修改范围

主要修改：

- `server/db.ts`
- `server/index.ts`
- `src/lib/api.ts`
- `src/lib/progress.ts`
- `src/pages/Timeline.tsx`
- `src/pages/Trail.tsx`
- `src/types.ts`
- `src/components/CourseCard.tsx`
- `src/components/ManualCourseCard.tsx`

新增迁移文件：

- `../migrations/v2_002_add_trash_fields.sql`

## 旅迹页面统计口径

旅迹页的“我的计划预览”不再统计仍在“待安排”抽屉中的课程，只统计真正放到“我的计划”时间轴上的课程，即 `plannedTerm != null` 的课程。

后端查询也会过滤被移入垃圾篓或永久隐藏的课程。

## 垃圾篓机制

官方培养方案课程：

- 删除：软删除，进入垃圾篓。
- 恢复：回到原来的计划学期 / 待安排状态。
- 永久删除：不物理删除课程记录，而是标记为 `is_permanently_deleted = 1`，从用户视角永久隐藏。

自定义课程：

- 删除：软删除，进入垃圾篓。
- 恢复：回到原来的计划学期 / 待安排状态。
- 永久删除：从 `plan_custom_courses` 物理删除。

## 数据库字段

后端启动时会自动检查并补齐这些字段：

```sql
plan_program_courses.is_deleted
plan_program_courses.deleted_at
plan_program_courses.deleted_note
plan_program_courses.is_permanently_deleted

plan_custom_courses.is_deleted
plan_custom_courses.deleted_at
plan_custom_courses.deleted_note
```

所以旧的 v2 数据库也可以直接使用，不需要手动执行迁移。若希望手动迁移，可参考 `migrations/v2_002_add_trash_fields.sql`。

## 新增接口

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
