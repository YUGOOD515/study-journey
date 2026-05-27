# raw 表数据利用计划 v1

> 目标：把当前数据库里 `raw_` 开头的学校原始课程数据真正接入“学旅”，让网站不只展示培养方案和个人计划，还能辅助选课、看开课班级、判断时间冲突，并把合适的课程加入“我的计划”。

---

## 1. 当前进度判断

### 1.1 从 Git 记录看

当前主线已经进入 `v0.4.4` 附近，核心变化是：

| 版本 | 主要内容 |
|---|---|
| `v0.2` | 时间轴、旅迹、个人计划、计划课程和已修课程分离 |
| `v0.3` | 加入选课栏，数据库开始重构 |
| `v0.4` | 垃圾篓、待安排、个人计划统计口径优化 |
| `v0.4.1` | hover 课程卡片支持快速编辑 |
| `v0.4.3` | 优化课程编辑和悬浮栏视觉效果 |
| `v0.4.4` | README 汇总，说明当前项目结构和接口 |

一句话：现在网站已经不是单纯展示课程，而是一个可以维护个人学习计划的本地工具。

### 1.2 从 Markdown 文档看

当前文档里已经明确：

- 前端默认端口：`6173`
- 后端默认端口：`6174`
- 当前数据库：`db/course_planner_v2.sqlite`
- 主要业务表：
  - `plan_program_courses`
  - `plan_custom_courses`
  - `plan_program_requirements`
- 原始课程表：
  - `raw_import_batches`
  - `raw_term_course_sections` 
  - `raw_term_added_courses`

文档现在对 `raw_` 的定位是：只查询，不和 `plan_` 表建立外键关系。

这个定位是合理的。`raw_` 是学校每学期导入的原始数据，会变化；`plan_` 是用户自己的培养方案和计划，不应该被学校原表直接覆盖。

### 1.3 从数据库看

当前数据库里 `raw_` 表的情况：

| 表 | 行数 | 用途 |
|---|---:|---|
| `raw_import_batches` | 2 | 记录导入批次，例如 2024-2025 春季、2025-2026 秋季补退选 |
| `raw_term_course_sections` | 3260 | 学校完整开课班级数据，包含教师、上课时间、周次、校区、限制、是否开放 |
| `raw_term_added_courses` | 37 | 补退选新增课程，多数是 Mooc / 通识选修 |

匹配情况：

| 项目 | 数量 |
|---|---:|
| 培养方案课程总数 | 86 |
| 能在 `raw_term_course_sections` 里按课程号匹配到的培养方案课程 | 52 |
| 能在 `raw_term_added_courses` 里按课程号匹配到的培养方案课程 | 1 |

这说明 raw 数据不是“替代培养方案”的数据源，而是“补充开课信息”的数据源。

### 1.4 从当前代码看

后端已经有 raw 查询接口：

```text
GET /api/raw/batches
GET /api/raw/sections?batch_id=&course_code=&course_name=&limit=
GET /api/raw/added-courses?batch_id=&course_code=&course_name=&limit=
GET /api/raw/course-openings/:course_code
```

但前端目前还没有 raw 数据类型，也没有页面正式消费这些接口。

所以下一阶段不是“从零做 raw 后端”，而是：

1. 补齐 raw 类型和 API 封装
2. 在前端找到合适位置展示 raw 信息
3. 逐步让 raw 数据参与选课决策
4. 最后再考虑把 raw 课程一键加入“我的计划”

---

## 2. raw 表真正能带来的功能价值

### 2.1 现在 `plan_` 表已经能做什么

`plan_` 表负责回答：

- 四年培养方案有哪些课
- 每门课属于哪个类别
- 是必修、选修还是经法管融通
- 用户计划第几学期修
- 用户是否已修、成绩多少
- 课程是否被删进垃圾篓

这些是“学业计划”的核心。

### 2.2 raw 表能补什么

`raw_` 表负责回答：

- 这门课学校这个学期到底开不开
- 有几个教学班
- 每个班谁教
- 周几第几节上课
- 上课周次是什么
- 校区在哪里
- 是否开放选课
- 有什么选课限制
- 补退选阶段新增了哪些课

这些是“选课执行”的信息。

### 2.3 最有价值的产品方向

优先级从高到低：

1. **课程 hover 卡片展示开课信息**
   - 用户看计划课时，能直接知道这门课有没有真实开课班级。

2. **选课搜索面板**
   - 用户可以从学校原始开课数据里搜索课程，再加入自己的计划。

3. **时间冲突检查**
   - 如果用户给课程选择了具体班级，系统可以判断同一学期有没有时间冲突。

4. **补退选新增课推荐**
   - 尤其是 Mooc、通识选修、素质教育课程，可以从 `raw_term_added_courses` 进入“候选课程池”。

5. **开课批次管理**
   - 支持以后每学期导入新表，用户可以选择当前使用哪个学期的数据。

---

## 3. 设计原则

### 3.1 raw 不直接污染 plan

不要把 raw 表里的 3260 行直接复制进 `plan_program_courses`。

原因很简单：

- raw 是学校每学期的开课班级
- plan 是用户长期维护的四年计划
- raw 会变，plan 要稳定

正确方式是：

```text
raw_ 表：只保存学校原始事实
plan_ 表：只保存用户计划和培养方案
中间通过课程号、批次、课序号临时关联
```

### 3.2 先只读，后写入

第一阶段只展示 raw 信息，不改动用户计划。

等展示稳定后，再做：

- 从 raw 课程加入我的计划
- 选择具体教学班
- 判断时间冲突

这样风险低，测试也清楚。

### 3.3 用户看到的是“选课帮助”，不是“数据库查询器”

页面上不要直接叫 `raw_term_course_sections`。

面向用户的名字建议：

- 开课信息
- 教学班
- 补退选新增课
- 选课候选
- 时间冲突

---

## 4. 分阶段实施方案

## Phase R1：raw 数据只读接入

### 目标

让前端能稳定读取 raw 数据，并在课程 hover 卡片里展示“这门课有没有开课班级”。

### 用户能看到什么

在课程 hover 卡片中增加一个小区域：

```text
开课信息
2024-2025 春季 final
6 个教学班
开放 5 个 / 关闭 1 个
```

点击后展开：

```text
01班 · 张三 · 星期二 0607节 · 1-16周 · 南湖校区 · 开放
02班 · 李四 · 星期五 030405节 · 1-16周 · 南湖校区 · 开放
```

如果没有匹配：

```text
暂无本批次开课记录
```

### 后端 API

保留现有接口，同时新增一个更适合前端消费的接口：

```text
GET /api/courses/:course_code/openings?batch_id=
```

返回结构建议：

```ts
interface CourseOpeningResponse {
  course_code: string;
  course_name: string | null;
  batch: RawImportBatch | null;
  sections: RawCourseSection[];
  added: RawAddedCourse[];
  summary: {
    section_count: number;
    open_count: number;
    closed_count: number;
    teacher_count: number;
  };
}
```

为什么不用现有 `/api/raw/course-openings/:code`？

现有接口可保留，但它偏原始。新增接口可以帮前端算好 summary，避免每个组件重复处理。

### 前端改动

新增类型：

```ts
interface RawImportBatch {
  id: number;
  academic_year: string;
  semester: "spring" | "fall";
  phase: "final" | "beginning_add";
  source_file: string;
  imported_at: string;
  note: string | null;
}

interface RawCourseSection {
  batch_id: number;
  course_code: string;
  section_code: string;
  course_name: string;
  credits: number | null;
  teacher: string | null;
  class_time: string | null;
  teaching_weeks: string | null;
  campus: string | null;
  department: string | null;
  course_attribute: string | null;
  enrollment_open: string | null;
  enrollment_restriction: string | null;
}
```

新增 API 封装：

```ts
api.rawBatches()
api.courseOpenings(courseCode, batchId?)
```

### 测试方式

你测试时只需要看：

1. 打开时间轴
2. 鼠标放到一门能匹配 raw 的课上，比如 `宏观经济学`、`法学通论`、`体育专项(2)`
3. hover 卡片里应显示开课信息
4. 鼠标放到一门匹配不到 raw 的课上，应显示“暂无本批次开课记录”
5. 控制台不能有报错

---

## Phase R2：选课候选面板

### 目标

把 raw 表做成一个真正可用的“选课候选”入口。

这一步不是替代时间轴，而是给时间轴提供课程来源。

### 用户能看到什么

在时间轴页面增加一个入口：

```text
选课候选
```

打开后有几个筛选项：

```text
批次：2025-2026 秋季 补退选
关键词：课程名 / 课程号 / 教师
类别：全部 / 通识 / 素质 / 专业 / 体育 / Mooc
状态：只看开放 / 全部
时间：周一 / 周二 / ...
```

候选列表卡片：

```text
新时代科学家精神
M1885030 · 0.5 学分 · 楚课联盟
5-8周 星期日 1011节
科学思维与人文精神
加入计划
```

### 后端 API

新增：

```text
GET /api/raw/search
```

参数：

```text
batch_id=
source=sections|added|all
keyword=
teacher=
department=
only_open=true|false
weekday=
limit=
offset=
```

返回：

```ts
interface RawCourseSearchResponse {
  items: RawCourseSearchItem[];
  total: number;
  limit: number;
  offset: number;
}
```

### 数据合并规则

`raw_term_course_sections` 和 `raw_term_added_courses` 字段不完全一样，所以前端不能直接混用原始表结构。

后端需要统一成一层：

```ts
interface RawCourseSearchItem {
  source: "section" | "added";
  batch_id: number;
  course_code: string;
  section_code: string | null;
  course_name: string;
  credits: number | null;
  teacher: string | null;
  department: string | null;
  platform: string | null;
  class_time: string | null;
  teaching_weeks: string | null;
  campus: string | null;
  enrollment_open: string | null;
  enrollment_restriction: string | null;
  module_2024: string | null;
}
```

### 前端改动

新增组件：

```text
RawCoursePicker.tsx
RawCourseSearchFilters.tsx
RawCourseResultCard.tsx
```

建议先做成时间轴里的右侧/底部浮层，不单独开新页面。

### 测试方式

你测试时：

1. 打开时间轴
2. 点“选课候选”
3. 搜索 `新时代科学家精神`
4. 应能看到 Mooc 新增课
5. 搜索 `法学通论`
6. 应能看到具体教学班
7. 勾选“只看开放”
8. 关闭课程应消失或数量减少

---

## Phase R3：从 raw 加入“我的计划”

### 目标

用户可以把 raw 里的课程加入个人计划。

### 两种情况

#### 情况 A：课程号已经在培养方案里

例如 `法学通论` 已经在 `plan_program_courses` 中。

用户点击：

```text
加入我的计划
```

后端应该更新：

```text
plan_program_courses.planned_term
plan_program_courses.section_code
```

如果引入更严谨字段，则更新：

```text
selected_raw_batch_id
selected_section_code
```

#### 情况 B：课程号不在培养方案里

例如补退选新增 Mooc 课。

用户点击：

```text
加入我的计划
```

后端应该写入：

```text
plan_custom_courses
```

默认规则：

| raw 来源 | 默认归属 |
|---|---|
| `raw_term_added_courses` 中 `module_2024` 含通识模块 | 通识教育 · 选修 |
| `module_2024` 含美育、创新创业等 | 素质教育 · 选修，或者先让用户确认 |
| 无法判断 | 弹窗让用户选择类别和性质 |

### 后端 API

新增：

```text
POST /api/personal-plan/from-raw
```

请求：

```ts
interface AddFromRawRequest {
  source: "section" | "added";
  batch_id: number;
  course_code: string;
  section_code?: string | null;
  planned_term: number | null;
  category_code?: CategoryCode;
  course_nature?: CourseNature;
}
```

返回：

```ts
interface AddFromRawResponse {
  ok: true;
  mode: "program" | "custom";
  id: number | null;
  course_code: string;
}
```

### 是否需要数据库迁移

建议需要，但不在 R1 做。

新增字段建议：

```sql
ALTER TABLE plan_program_courses ADD COLUMN selected_raw_batch_id INTEGER;
ALTER TABLE plan_program_courses ADD COLUMN selected_section_code TEXT;
ALTER TABLE plan_custom_courses ADD COLUMN raw_source TEXT;
ALTER TABLE plan_custom_courses ADD COLUMN raw_batch_id INTEGER;
ALTER TABLE plan_custom_courses ADD COLUMN raw_course_code TEXT;
ALTER TABLE plan_custom_courses ADD COLUMN selected_section_code TEXT;
```

不建议加外键。

原因：raw 表是导入快照，以后重新导入、清理批次时，不应该导致用户计划损坏。

### 测试方式

你测试时：

1. 打开“选课候选”
2. 搜索一个培养方案内课程，例如 `法学通论`
3. 选择一个教学班，加入大二下
4. 时间轴中对应课程应进入大二下
5. 再搜索一个 Mooc 课，例如 `新时代科学家精神`
6. 加入待安排或某个学期
7. 时间轴应出现这门自定义课程
8. 旅迹页预览学分应变化

---

## Phase R4：时间冲突检查

### 目标

如果用户选择了具体教学班，系统可以提示课程之间的时间冲突。

注意：只提示，不阻止。

### 用户能看到什么

在时间轴课程卡片或 hover 卡片中显示：

```text
时间冲突：与 金融工程学 同为 星期二 0607节
```

或者在学期列顶部显示：

```text
本学期 2 处时间冲突
```

### 技术关键

需要解析 `class_time`。

当前样例：

```text
星期二 0607节
星期五 101112节
星期二 0607节,星期五 0102节
5-14周 星期日 101112节
```

建议解析成：

```ts
interface ClassMeeting {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  periods: number[];
  week_ranges: Array<[number, number]> | null;
  raw: string;
}
```

冲突判断：

```text
weekday 相同
periods 有交集
week_ranges 有交集或其中一方未知
```

### 工具函数

新增：

```text
src/lib/classTime.ts
```

包含：

```ts
parseClassTime(raw: string): ClassMeeting[]
hasClassTimeConflict(a: ClassMeeting[], b: ClassMeeting[]): boolean
describeConflict(...)
```

### 后端还是前端解析？

建议第一版放前端。

原因：

- 只用于界面提示
- 方便随 UI 变化调整
- 不需要写回数据库

如果后续要做复杂搜索，例如“只看周二没课的课程”，再把解析能力移动到后端。

### 测试方式

你测试时：

1. 从 raw 里选两门同一时间的课
2. 加入同一学期
3. 预期只出现冲突提示，不阻止保存
4. 换成不同时间后，提示消失

---

## Phase R5：开课批次管理

### 目标

以后每学期导入新的学校课程表，网站能选择使用哪个批次。

### 用户能看到什么

在“选课候选”或设置中：

```text
当前开课数据
2025-2026 秋季 补退选
来源：2025-2026学年第一学期本科课程补退选.xls
导入时间：2026-05-26
```

可切换：

```text
2024-2025 春季 final
2025-2026 秋季 beginning_add
```

### 后端 API

现有：

```text
GET /api/raw/batches
```

建议新增：

```text
GET /api/raw/active-batch
PUT /api/raw/active-batch
```

需要新增设置表：

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

第一版也可以不用数据库，直接前端 localStorage 记住当前 batch。

建议：

- R1/R2：用 localStorage
- R5：再做后端持久化

---

## 5. 页面设计建议

### 5.1 时间轴

时间轴不应该被 raw 信息淹没。

建议只放轻量提示：

```text
有开课信息
3 个教学班
1 处时间冲突
```

详细信息放进 hover 卡片和选课候选面板。

### 5.2 hover 卡片

hover 卡片适合展示课程级别的 raw 信息：

- 教学班数量
- 最近批次
- 教师
- 上课时间
- 是否开放
- 限制说明

但不要展示太多行，最多 3 条，剩下用：

```text
查看全部 6 个教学班
```

### 5.3 旅迹页

旅迹页暂时不直接展示 raw。

理由：

- 旅迹是毕业进度和学分结构
- raw 是开课执行信息
- 两者混在一起会让页面层级变乱

可以只在以后加入一个小提示：

```text
还有 8 学分选修缺口，可从本学期开放课程中选择
```

这属于后续阶段。

### 5.4 新增“选课候选”面板

建议放在时间轴页面，不单独放导航。

原因：

- 用户选课时主要在时间轴里做计划
- 候选课程是时间轴的材料来源
- 少一个顶层页面，导航更清楚

---

## 6. API 详细规划

### 6.1 已有接口保留

```text
GET /api/raw/batches
GET /api/raw/sections
GET /api/raw/added-courses
GET /api/raw/course-openings/:course_code
```

这些接口适合调试和开发，不需要删。

### 6.2 新增接口

| 接口 | 作用 | 阶段 |
|---|---|---|
| `GET /api/courses/:course_code/openings?batch_id=` | 获取某门课的开课摘要和教学班 | R1 |
| `GET /api/raw/search` | 搜索开课班级和补退选新增课 | R2 |
| `POST /api/personal-plan/from-raw` | 从 raw 课程加入我的计划 | R3 |
| `GET /api/raw/coverage` | 查看 plan 与 raw 的匹配覆盖率 | R1/R2 |
| `GET /api/raw/active-batch` | 当前使用哪个 raw 批次 | R5 |
| `PUT /api/raw/active-batch` | 切换当前 raw 批次 | R5 |

### 6.3 覆盖率接口

建议加一个开发/诊断接口：

```text
GET /api/raw/coverage
```

返回：

```ts
interface RawCoverage {
  plan_course_count: number;
  matched_section_course_count: number;
  matched_added_course_count: number;
  unmatched_plan_courses: Array<{
    course_code: string;
    course_name: string;
    category_name: string;
    official_term: string | null;
  }>;
}
```

这对后续排查“为什么某门课没有开课信息”很有用。

---

## 7. 数据匹配规则

### 7.1 首选课程号匹配

```text
plan_program_courses.course_code = raw_term_course_sections.course_code
plan_program_courses.course_code = raw_term_added_courses.course_code
```

这是最可靠的。

### 7.2 课程名匹配只用于搜索，不自动合并

不要用课程名自动合并。

原因：

- 课程名可能有空格、括号、双语标注差异
- 同名课可能来自不同学院
- 自动合并会污染用户计划

课程名匹配只用于搜索结果展示。

### 7.3 教学班唯一标识

`raw_term_course_sections` 的教学班建议用：

```text
batch_id + course_code + section_code
```

不要只用 `course_code + section_code`，因为不同批次会重复。

### 7.4 补退选新增课唯一标识

`raw_term_added_courses` 建议用：

```text
batch_id + course_code
```

---

## 8. 数据库迁移建议

### 8.1 R1/R2 不需要迁移

只读展示和搜索可以完全依赖现有 raw 表。

### 8.2 R3 建议迁移

为了记录用户选的是哪个原始课程/教学班，建议新增迁移：

```text
migrations/v2_003_link_raw_selection.sql
```

内容：

```sql
ALTER TABLE plan_program_courses ADD COLUMN selected_raw_batch_id INTEGER;
ALTER TABLE plan_program_courses ADD COLUMN selected_section_code TEXT;

ALTER TABLE plan_custom_courses ADD COLUMN raw_source TEXT;
ALTER TABLE plan_custom_courses ADD COLUMN raw_batch_id INTEGER;
ALTER TABLE plan_custom_courses ADD COLUMN raw_course_code TEXT;
ALTER TABLE plan_custom_courses ADD COLUMN selected_section_code TEXT;

CREATE INDEX IF NOT EXISTS idx_plan_program_raw_selection
  ON plan_program_courses(selected_raw_batch_id, selected_section_code);

CREATE INDEX IF NOT EXISTS idx_plan_custom_raw_selection
  ON plan_custom_courses(raw_batch_id, raw_course_code, selected_section_code);
```

不加外键。

### 8.3 为什么不用现有 `section_code`

现在 `plan_program_courses` 和 `plan_custom_courses` 已经有 `section_code` 字段。

但它不够完整，因为：

- 没有 `batch_id`
- 不知道来自完整开课表还是补退选新增表
- 以后多批次导入时容易歧义

所以建议保留旧字段兼容展示，再加 `selected_*` 字段用于 raw 关联。

---

## 9. 前端实现顺序

### 9.1 新增类型

文件：

```text
app/src/types.ts
```

新增：

```text
RawImportBatch
RawCourseSection
RawAddedCourse
CourseOpeningResponse
RawCourseSearchItem
```

### 9.2 新增 API

文件：

```text
app/src/lib/api.ts
```

新增：

```ts
rawBatches()
courseOpenings(courseCode, batchId?)
rawSearch(params)
addPersonalPlanFromRaw(input)
```

### 9.3 新增组件

建议：

```text
app/src/components/CourseOpeningsPanel.tsx
app/src/components/RawCoursePicker.tsx
app/src/components/RawCourseResultCard.tsx
```

### 9.4 修改现有组件

需要改：

```text
CourseHoverCard.tsx
Timeline.tsx
ManualCourseDialog.tsx
```

其中：

- `CourseHoverCard` 显示开课信息
- `Timeline` 放“选课候选”入口
- `ManualCourseDialog` 后续可以接收从 raw 带入的默认值

---

## 10. 后端实现顺序

### 10.1 先抽 raw 查询函数

当前 `server/index.ts` 已经很长，不建议继续把所有 SQL 都堆进去。

建议新增：

```text
app/server/raw.ts
```

放：

```ts
getRawBatches()
getCourseOpenings()
searchRawCourses()
getRawCoverage()
```

如果暂时不拆路由，至少先拆 SQL helper。

### 10.2 保持接口只读

R1/R2 所有 raw 接口只读，不写数据库。

### 10.3 R3 再写入 plan

`POST /api/personal-plan/from-raw` 是第一个写接口。

写入时必须区分：

```text
培养方案内课程 -> 更新 plan_program_courses
培养方案外课程 -> 插入 plan_custom_courses
```

---

## 11. 测试计划

### R1 测试

我完成后，你测试：

1. 时间轴 hover `法学通论`
2. 应看到多个教学班
3. hover `形势与政策(8)`
4. 如果没有 raw 匹配，应显示暂无开课信息
5. 深色模式下文字清晰

### R2 测试

我完成后，你测试：

1. 打开“选课候选”
2. 搜索 `新时代科学家精神`
3. 搜索 `法学通论`
4. 切换批次
5. 勾选“只看开放”

### R3 测试

我完成后，你测试：

1. 从候选面板加入培养方案内课程
2. 从候选面板加入 Mooc 新增课
3. 查看时间轴是否出现
4. 查看旅迹预览学分是否变化
5. 删除课程后是否进入垃圾篓或从计划移除

### R4 测试

我完成后，你测试：

1. 加入两门同时间课程
2. 预期出现冲突提示
3. 换一个不冲突班级
4. 预期提示消失

---

## 12. 风险和注意点

### 12.1 raw 数据不是实时教务系统

raw 数据来自导入文件，不代表实时余量。

页面上不能写“可选人数”“一定能选上”，除非数据库里以后有这些字段。

推荐文案：

```text
来自导入课程表，仅作规划参考
```

### 12.2 当前 raw 批次跨学期

现在有：

- `2024-2025 spring final`
- `2025-2026 fall beginning_add`

这两个不是同一个学期，不能混在一起判断时间冲突。

冲突判断必须限定同一批次或同一目标学期。

### 12.3 课程号匹配并不覆盖所有培养方案课程

当前 86 门培养方案课程里，只有 52 门能在完整开课表里按课程号匹配。

所以 UI 必须允许“没有开课信息”这个状态。

### 12.4 补退选新增课多为通识 / Mooc

`raw_term_added_courses` 适合做通识选修和素质教育候选，不适合直接推断专业培养方案。

---

## 13. 建议的下一步

建议下一阶段直接做 **Phase R1**。

原因：

- 后端已有 raw 查询接口，改动小
- 不需要数据库迁移
- 不写入用户计划，风险低
- 可以马上验证 raw 数据是否真的有用

R1 的完成标准：

```text
课程 hover 卡片能显示开课班级数量和前 3 个教学班
没有匹配时有清楚的空状态
前端有 Raw 类型和 API 封装
后端有更适合前端的 /api/courses/:code/openings 接口
```

R1 完成后，再进入 R2 做“选课候选”面板。

