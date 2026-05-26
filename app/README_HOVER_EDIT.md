# 课程悬浮卡片编辑改造说明

本版本基于 `site-v0.4.zip` 未修改主干完成。

## 修改范围

- `src/components/CourseCard.tsx`
- `src/components/ManualCourseCard.tsx`
- `src/components/CourseHoverCard.tsx`
- `src/hooks/useHoverIntentTriangle.ts`
- `src/pages/Timeline.tsx`
- `src/lib/api.ts`
- `src/types.ts`
- `server/index.ts`

## 功能变化

1. 时间轴、待安排、官方计划、我的计划中的课程 hover 信息卡片统一为同一套样式。
2. hover 信息卡片新增成绩展示。
3. 垃圾篓中的课程也支持 hover 信息卡片，并在 hover 卡片里提供“恢复 / 永久删除”。
4. 复用原有 hover 卡片视觉，在卡片内增加“编辑”状态，不额外新增独立样式的悬浮卡片。
5. 鼠标从课程卡片移动到右侧 hover 卡片时，使用三角形安全区延迟关闭，避免悬浮卡片误消失。
6. 第一阶段允许编辑：课程名、类别、性质、学分、讲课学时、实践学时、课外学时、计划学期、先修课程号、成绩。
7. 第一阶段不允许修改课程号。

## 后端接口

新增：

- `PATCH /api/plan-courses/program/:courseCode`
- `PATCH /api/plan-courses/custom/:id`

这两个接口只更新 `plan_` 类表，不修改 `raw_` 表。

## 使用注意

替换本版本后，在项目根目录运行：

```bash
cd app
npm install
npm run dev
```

如果你本地数据库已有数据，不要覆盖 `db/course_planner_v2.sqlite`。
