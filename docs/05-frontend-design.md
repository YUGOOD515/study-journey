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
| Tailwind CSS | 样式工具类 |
| @visx/sankey / d3-sankey | 旅迹页数据流可视化 |

## 3. 页面结构

当前主要页面：

| 页面 | 文件 | 行数 | 作用 |
|---|---|---:|---|
| 时间轴 | `app/src/pages/Timeline.tsx` | 1779 | 我的计划、官方计划、待安排、垃圾篓、课程添加与编辑 |
| 旅迹 | `app/src/pages/Trail.tsx` | 762 | 学分进度、课程路径、分类统计和可视化 |

## 4. 组件结构

| 组件 | 文件 | 作用 |
|---|---|---|
| `CourseCard` | `components/CourseCard.tsx` | 官方课程卡片 |
| `ManualCourseCard` | `components/ManualCourseCard.tsx` | 自定义/用户课程卡片 |
| `CourseHoverCard` | `components/CourseHoverCard.tsx` | hover 信息卡、轻量编辑入口 |
| `CourseEditFields` | `components/CourseEditFields.tsx` | 添加/编辑课程的统一字段表单 |
| `ManualCourseDialog` | `components/ManualCourseDialog.tsx` | 添加自定义课程弹窗 |
| `CustomSelect` | `components/CustomSelect.tsx` | 自定义下拉菜单，替代浏览器原生 select |
| `ProgressBar` | `components/ProgressBar.tsx` | 学分进度条 |
| `ThemeToggle` | `components/ThemeToggle.tsx` | 明暗主题切换 |
| `InterdisciplinaryFlow` | `components/InterdisciplinaryFlow.tsx` | 经法管融通/学分流向可视化 |

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
| `Timeline.tsx` 过大 | 状态、布局、业务操作混杂 | 拆页面组件和自定义 hook |
| 课程字段转换散落 | 容易出现前后端口径不一致 | 统一到 `lib/courseOptions.ts` 和 API mapper |
| hover 编辑逻辑较重 | 组件既显示又编辑 | 拆 `CourseHoverView` 与 `CourseHoverEditForm` |
| raw 数据功能尚未完全前端化 | raw 表已有数据，但候选课程查询仍可扩展 | 增加候选课程选择器 |

## 9. 前端维护原则

1. 页面文件只保留页面布局和数据组织，不继续堆业务细节。
2. 通用显示逻辑放入 `lib/`，不要在多个组件里重复写。
3. 课程类型定义优先从 `types.ts` 引用，不要在组件中重复声明。
4. 所有 API 调用集中在 `lib/api.ts`，不要在页面中直接散写 fetch。
5. 添加新字段时，同时更新 `types.ts`、`lib/api.ts`、后端 API 文档和数据库文档。
