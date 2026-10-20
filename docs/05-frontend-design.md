# 前端设计说明

## 1. 当前前端位置

当前正式前端代码位于：

```text
app/src/
```

入口文件：

```text
app/src/main.tsx
app/src/App.tsx
```

样式入口：

```text
app/src/index.css
```

## 2. 前端技术栈

| 技术 | 用途 |
|---|---|
| React 18 | 页面和组件 |
| Vite | 开发服务器和构建 |
| TypeScript | 类型约束 |
| Tailwind CSS | 样式工具类（主题 token 全部在 `tailwind.config.js` + `index.css`） |
| Radix UI | Dialog / Popover / Menu / Tooltip 等无样式交互原语 |
| dnd-kit | 时间轴拖拽 |

## 2.1 设计系统（redesign 分支起）

整体原则：克制、层级清晰、网格对齐；不使用氛围光、渐变、错峰入场动画、hover 上浮等装饰。

| 维度 | 规则 |
|---|---|
| 字体 | 正文系统无衬线（PingFang SC / 系统 UI 字体）；**所有数字**使用 `.num`（`ui-monospace` 等宽 + `tabular-nums`），保证纵向对齐 |
| 字号 | 只有 6 档：`2xs` 11/16、`xs` 12/18（正文默认）、`sm` 13/20、`base` 15/22、`lg` 20/28（页面标题）、`xl` 28/32（总览大数字） |
| 字重 | 400 / 500 / 600 三档 |
| 圆角 | `rounded-sm` 2px（徽标、进度条、标签）、`rounded` 4px（按钮、输入框、课程卡）、`rounded-md` 6px（面板、弹窗） |
| 间距 | 4px 基准；页面容器统一 `max-w-[1440px] px-4 sm:px-6` |
| 颜色 | 沿用原版色系：暖米白 `bg`、`ink / sub / faint` 文本层级；`line / line-strong` 实色描边；`fill / fill-strong` 实色底；`brand` 暖橘用于主按钮、选中态、焦点、进度与"本学期 / 今天"；`warn` 用于超限与提醒；`danger` 用于删除 |
| 类别色 | 5 个培养方案板块各一色（`--cat-*`）。课程卡与课表色块统一用 `categorySurface()`：必修 = 类别浅底 + 类别描边，选修 = 更浅底 + 更浅描边；课程名用类别文字色。四边等宽 1px，**任何卡片都不加左侧强调色条** |
| 图标 | 与个人网站（selfsite）同一套 Lucide，线宽统一 1.6，由 `LucideProvider` 下发；全站只从 `lib/icons.ts` 引入，使用 Lucide 规范名（如 `TriangleAlert`、`LoaderCircle`） |
| 模式 | 每次打开默认**查看模式**（只读），需要调整时在顶栏切到编辑 |
| 阴影 | 只有浮层（菜单、弹窗、悬停卡）使用 `shadow-pop`，其余一律用 1px 描边 |
| 动效 | 仅 120ms 淡入与手机底部抽屉滑入；遵守 `prefers-reduced-motion` |
| 焦点 | 统一 `focus-visible` 2px brand 轮廓 |
| 深色模式 | 同一套 token 的深色值，组件内不判断主题 |

通用组件位于 `components/ui/`：`Button / IconButton`、`Field / Input / PasswordInput`、`Select`、`Segmented`、`Menu`、`Popover`、`Tooltip`、`Dialog / Confirm`、`Toaster`，以及布局组件 `Page / PageHeader / Metric / SectionHeader / Bar` 和 `Panel / Badge / EmptyState / Skeleton`。

页面骨架统一为：顶栏（48px）→ `PageHeader`（标题 + 说明 + 右侧等宽指标 + 工具栏 + 底部分隔线）→ 内容区块（`SectionHeader` + `Panel`）。

## 3. 页面结构

| 页面 | 文件 | 作用 |
|---|---|---|
| 时间轴 | `app/src/pages/Timeline.tsx`（+ `pages/timeline/`） | 我的计划、官方计划、待安排、垃圾篓、课程添加与编辑 |
| 旅迹 | `app/src/pages/Trail.tsx` | 学分总览、经法管融通学分归属、五大板块对齐表格（可展开查看课程并填写成绩） |
| 学期课表 | `app/src/pages/TermSchedule.tsx` | 周课表网格（节次 × 星期）、手机按天列表、课程周次分布 |
| 登录 / 注册 | `app/src/pages/AuthPage.tsx` | 单列表单 |

## 4. 组件结构

| 组件 | 文件 | 作用 |
|---|---|---|
| `CourseCard` | `components/CourseCard.tsx` | 课程卡片（`custom` 属性用于自定义/用户课程）；导出 `courseSurface()` 统一类别色表达 |
| `CourseTile` | `components/CourseTile.tsx` | 课程卡外壳：悬停卡、详情弹窗、菜单、拖拽 |
| `CourseHoverCard` | `components/CourseHoverCard.tsx` | hover 信息卡、轻量编辑入口 |
| `CourseEditFields` | `components/CourseEditFields.tsx` | 添加/编辑课程的统一字段表单 |
| `AddCourseDialog` | `components/AddCourseDialog.tsx` | 搜索添加 / 手动添加课程 |
| `ProgressBar` | `components/ProgressBar.tsx` | 三段式学分进度条（已修 / 在修 / 计划） |
| `InterdisciplinaryFlow` | `components/InterdisciplinaryFlow.tsx` | 经法管融通学分归属：去向汇总 + 每门课分段切换 |
| `AccountMenu` / `ThemeToggle` / `EditModeToggle` | `components/` | 顶栏右侧控件 |

## 5. 前端工具函数

| 文件 | 作用 |
|---|---|
| `lib/api.ts` | 封装后端 API 调用和请求类型 |
| `lib/progress.ts` | 学分进度、统计口径、分类汇总 |
| `lib/courseCardDisplay.ts` | 课程卡片显示字段处理 |
| `lib/categoryStyle.ts` | 分类样式配置 |
| `lib/courseOptions.ts` | 课程类别、性质、学期等选项 |
| `lib/offeredTerm.ts` | 开课学期显示转换 |
| `hooks/useHoverIntentTriangle.ts` | hover 卡片安全区判断 |
| `hooks/useTheme.ts` | 主题状态管理 |
| `types.ts` | 前端共享类型 |

## 6. 核心交互

### 6.1 时间轴

时间轴页面承担最多功能：

```text
我的计划 / 官方计划切换
课程按 1-8 学期排列
课程加入计划
课程移出计划
修改计划学期
录入成绩
添加自定义课程
hover 查看和编辑课程
待安排抽屉
垃圾篓抽屉
toast 提示
```

当前 `Timeline.tsx` 过大，建议后续拆成：

```text
TimelinePage
TimelineHeader
TermColumn
TermCourseList
BottomDrawer
UnscheduledDrawer
TrashDrawer
ToastLayer
TimelineState/useTimelineData
```

### 6.2 课程 hover 卡片

hover 卡片统一用于：

```text
时间轴课程
待安排课程
官方计划课程
我的计划课程
垃圾篓课程
```

hover 卡片显示：

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

### 6.3 添加与编辑课程

添加课程和 hover 编辑使用统一字段：

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

前端字段口径：

| 字段 | 含义 |
|---|---|
| `course_nature` | 显示给用户的课程性质：必修、选修、跨专业 |
| `is_interdisciplinary` | 是否作为经法管融通课程处理 |
| `assigned_to` | 经法管融通学分计入方向：`interdisciplinary` 或 `elective` |
| `planned_term` | 官方课程的计划学期 |
| `term_number` | 自定义课程的学期 |

> **进度与学分统计（旅迹页）的唯一真相源是后端 `/api/progress`**（口径见 [docs/16](16-credit-rule-finalization-and-frontend-plan.md)）。
> `lib/progress.ts` 不再自行计算学分桶，只通过 `bundlesFromProgress` / `flowItemsFromProgress` 把后端结果映射为页面结构；经法管融通计入「大类平台」上限 6 学分，超出自动计入「通识教育·选修」，旅迹页会给出溢出提示。

## 7. 与后端接口关系

| 前端功能 | 后端接口 |
|---|---|
| 健康检查 | `GET /api/health` |
| 课程列表 | `GET /api/courses`、`GET /api/courses-with-category` |
| 学分要求 | `GET /api/program-requirements` |
| 时间轴课程 | `GET /api/personal-plan`、`GET /api/semester-courses` |
| 添加官方课程到计划 | `POST /api/personal-plan/official` |
| 添加自定义课程 | `POST /api/personal-plan/manual` |
| 编辑官方课程 | `PATCH /api/plan-courses/program/:code` |
| 编辑自定义课程 | `PATCH /api/plan-courses/custom/:id` |
| 删除/恢复课程 | `DELETE /api/personal-plan/...`、`POST /api/trash/...` |
| raw 查询 | `GET /api/raw/*` |

## 8. 当前前端问题

| 问题 | 影响 | 建议 |
|---|---|---|
| `Timeline.tsx` 仍偏大 | 状态与业务操作集中 | 继续把拖拽与数据操作拆成自定义 hook |
| 课程字段转换散落 | 容易出现前后端口径不一致 | 统一到 `lib/courseOptions.ts` 和 API mapper |
| hover 编辑逻辑较重 | 组件既显示又编辑 | 拆 `CourseHoverView` 与 `CourseHoverEditForm` |
| raw 数据功能尚未完全前端化 | raw 表已有数据，但候选课程查询仍可扩展 | 增加候选课程选择器 |

## 9. 前端维护原则

1. 页面文件只保留页面布局和数据组织，不继续堆业务细节。
2. 通用显示逻辑放入 `lib/`，不要在多个组件里重复写。
3. 课程类型定义优先从 `types.ts` 引用，不要在组件中重复声明。
4. 所有 API 调用集中在 `lib/api.ts`，不要在页面中直接散写 fetch。
5. 添加新字段时，同时更新 `types.ts`、`lib/api.ts`、后端 API 文档和数据库文档。
6. 新增界面只使用 `tailwind.config.js` 中定义的字号、圆角、颜色 token；不写任意值字号（如 `text-[10px]`）和半透明描边（如 `border-sub/15`）。
7. 数字一律包在 `.num` 中；表格数字列右对齐。
