# Hover 卡片边界修复

本次修复针对课程 hover 信息卡片可能超出浏览器下边界的问题。

修改文件：

- `app/src/components/CourseHoverCard.tsx`

修复内容：

1. hover 卡片会根据当前视口高度自动重新计算 `top`。
2. 当课程卡片靠近页面底部时，hover 卡片会自动上移，避免“编辑”按钮被下边界遮住。
3. hover 卡片增加 `max-height: calc(100vh - 24px)`。
4. 如果编辑态内容过高，卡片内部滚动，而不是溢出屏幕。
5. 不修改后端、数据库和接口。

建议替换方式：只替换 `app/src/components/CourseHoverCard.tsx`。
