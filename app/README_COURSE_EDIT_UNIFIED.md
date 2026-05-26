# 课程添加与悬浮编辑口径统一

本次修改目标：统一“添加课程”弹窗与“课程悬浮卡片编辑态”的字段、选项和数据库写入口径。

## 保持不变

- 不修改前端端口：Vite 仍使用 `6173`。
- 不修改后端端口：API 仍使用 `6174`，也仍可通过 `PORT` 环境变量覆盖。
- 不修改数据库连接路径逻辑：默认仍读取 `../db/course_planner_v2.sqlite`，也仍支持 `DB_PATH` 覆盖。
- 不修改 `raw_` 表。
- 不允许修改课程号，避免主键变更带来的兼容性问题。

## 统一后的字段

“添加课程”和“悬浮卡片编辑”现在共用同一套课程编辑字段：

- 课程名
- 类别
- 课程性质
- 是否经法管融通
- 学分计入
- 学分
- 讲课学时
- 实践学时
- 课外学时
- 计划学期
- 先修课程号
- 成绩
- 备注

其中“经法管融通”不再混入类别按钮，而是独立开关。只有“通识教育”和“大类平台”允许开启经法管融通。

## 后端映射口径

前端统一使用：

- `course_nature`: `必修` / `选修` / `跨专业`
- `is_interdisciplinary`: `0` / `1`
- `assigned_to`: `interdisciplinary` / `elective`

后端写入 v2 数据库时自动转换：

- 普通课程：`requirement_type = course_nature`，`credit_count_to = NULL`
- 经法管融通课程：`requirement_type = '经法管融通'`，`credit_count_to` 按用户选择写入

这样可以继续满足数据库 CHECK 约束。

## 主要修改文件

- `src/lib/courseOptions.ts`
- `src/components/CourseEditFields.tsx`
- `src/components/ManualCourseDialog.tsx`
- `src/components/CourseHoverCard.tsx`
- `src/components/CourseCard.tsx`
- `src/components/ManualCourseCard.tsx`
- `src/pages/Timeline.tsx`
- `src/lib/api.ts`
- `src/types.ts`
- `server/index.ts`

