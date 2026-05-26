# Hover Edit Hotfix

修复 `/api/semester-courses` 返回 HTTP 500 的问题。

原因：`server/index.ts` 中 `/api/semester-courses` 的官方课程和自定义课程查询使用了 `pre.course_name AS prerequisite_course_name`，但该查询缺少 `LEFT JOIN plan_program_courses pre ...`，导致 SQLite 报错：`no such column: pre.course_name`。

修复：在两个查询中补充先修课程 JOIN。

建议替换文件：

```text
app/server/index.ts
```

替换后重启：

```powershell
cd app
npm run dev
```


## Hover 卡片边界修复

补充修复：`CourseHoverCard` 会根据浏览器视口高度自动上移，并在内容过高时启用内部滚动，避免底部“编辑”按钮超出屏幕。
