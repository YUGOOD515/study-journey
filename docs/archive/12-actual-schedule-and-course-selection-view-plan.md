# 实际课表数据导入与选课界面初版计划

## 1. 本阶段目标

本阶段先做两件事：

1. 把 `src_data/` 中新增的原始数据纳入数据库。
2. 为后续“选课界面 / 学期课表视图”设计清楚数据结构、接口和前端入口。

这部分数据层面独立于现有“时间轴”和“旅迹”：

- 不参与总学分统计。
- 不改变课程的已修、计划、垃圾篓状态。
- 不直接写入 `plan_program_courses` 或 `plan_custom_courses`。
- 只作为“某学期真实课表”和“学校开课候选数据”的展示与查询依据。

通俗地说：时间轴负责“我四年打算怎么修、修了多少学分”；这个新板块负责“某一学期每周每天实际上怎么上课”。

## 2. 当前新增数据识别

### 2.1 四个学期的实际课程表

当前 `src_data/` 中有 4 个“有课表课程”文件：

| 文件 | 对应学期 | 建议映射到培养计划学期 |
|---|---:|---:|
| `2024-2025-1-有课表课程.xls` | 2024-2025 第 1 学期 | 第 1 学期 / 大一上 |
| `2024-2025-2-有课表课程.xls` | 2024-2025 第 2 学期 | 第 2 学期 / 大一下 |
| `2025-2026-1-有课表课程.xls` | 2025-2026 第 1 学期 | 第 3 学期 / 大二上 |
| `2025-2026-2-有课表课程.xls` | 2025-2026 第 2 学期 | 第 4 学期 / 大二下 |

这些表的典型字段是：

```text
序号
上课班级
课序号
课程编号
课程名称
上课时间
上课地点
授课教师
课程性质
课程属性
网课群号
网课链接网址
二维码
```

它们和现有 `raw_term_course_sections` 不应合并。

原因是：

- `raw_term_course_sections` 是学校全校选课表，粒度是“某学期所有可选教学班”。
- `有课表课程` 是实际进入个人课表的课程，粒度是“这个学生这一学期实际排上的课”。
- 两者可以通过 `academic_year + semester + course_code + section_code` 临时关联，但不应互相依赖。

### 2.2 大一上的部分选课信息

当前 `src_data/` 中也有本科生选课表、补退选表和课程一览表。

这类数据继续进入现有 raw 表：

| 文件类型 | 目标表 |
|---|---|
| 本科生选课完整表 | `raw_term_course_sections` |
| 本科课程补退选表 | `raw_term_added_courses` |
| 通识 / 经法管融通 / 素质课程一览表 | `raw_course_catalog_previews` |

注意：这些是“可选课程库”，不是个人实际课表。

## 3. 数据库设计

实际实现时，本阶段先采用一张核心明细表：

```text
raw_actual_course_meetings
```

每一行是一门课的一个上课片段，核心字段按最终约定固定为：

```text
term
course_code
section_code
meeting_no
start_week
end_week
weekday
start_period
end_period
location_text
```

其中 `start_week/end_week`、`start_period/end_period` 都是闭区间。前端判断某一周、某一节是否命中时，应使用：

```text
start_week <= week <= end_week
start_period <= period <= end_period
```

不能按左闭右开区间处理。

如果一门课的周次不连续，例如 `9-11,13-16周`，导入时会拆成多条记录，并用 `meeting_no` 区分。

### 3.1 新增导入批次类型

继续复用 `raw_import_batches`，新增一种 `phase`：

```text
actual_schedule
```

含义：个人实际课表文件。

这样所有原始文件仍然能统一追踪来源：

```text
raw_import_batches
  -> raw_term_course_sections
  -> raw_term_added_courses
  -> raw_course_catalog_previews
  -> raw_actual_term_courses
  -> raw_actual_term_meetings
```

### 3.2 新表一：实际课表课程表

建议新增：

```sql
raw_actual_term_courses
```

一行表示实际课表里的一门课。

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | 自增主键 |
| `batch_id` | INTEGER NOT NULL | 来源批次，关联 `raw_import_batches.id` |
| `term_number` | INTEGER NOT NULL | 映射到第 1-8 学期 |
| `source_row` | INTEGER NOT NULL | 原 Excel 行号 |
| `ordinal` | INTEGER | 原表序号 |
| `class_group` | TEXT | 上课班级 |
| `section_code` | TEXT | 课序号 |
| `course_code` | TEXT NOT NULL | 课程编号 |
| `course_name` | TEXT NOT NULL | 课程名称 |
| `class_time_raw` | TEXT | 原始上课时间 |
| `classroom_raw` | TEXT | 原始上课地点 |
| `teacher` | TEXT | 授课教师 |
| `course_nature` | TEXT | 课程性质 |
| `course_attribute` | TEXT | 课程属性 |
| `online_group` | TEXT | 网课群号 |
| `online_url` | TEXT | 网课链接网址 |
| `qr_code` | TEXT | 二维码原始值 |
| `imported_at` | TEXT | 导入时间 |

不建议用 `course_code` 做唯一键，因为同一课程可能出现不同教师、不同课序号、不同上课安排。

### 3.3 新表二：实际课表上课片段表

建议新增：

```sql
raw_actual_term_meetings
```

一行表示一门课在某个星期几、某几节课的一个上课片段。

例如：

```text
4-15周 星期三 0102节,4-15周 星期五 0809节
```

应拆成两行：

| 周次 | 星期 | 节次 | 地点 |
|---|---:|---|---|
| 4-15 | 3 | 0102 | 首义-文泽212 |
| 4-15 | 5 | 0809 | 首义-文泽212 |

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | 自增主键 |
| `actual_course_id` | INTEGER NOT NULL | 关联 `raw_actual_term_courses.id` |
| `term_number` | INTEGER NOT NULL | 第 1-8 学期，便于查询 |
| `weeks_text` | TEXT NOT NULL | 原始周次文本，如 `4-15周`、`1,3,5周` |
| `week_numbers_json` | TEXT NOT NULL | 解析后的周次数组，如 `[4,5,...,15]` |
| `weekday` | INTEGER NOT NULL | 1-7，周一到周日 |
| `period_text` | TEXT NOT NULL | 原始节次文本，如 `0102节` |
| `period_start` | INTEGER NOT NULL | 起始节次 |
| `period_end` | INTEGER NOT NULL | 结束节次 |
| `classroom` | TEXT | 本片段对应地点 |
| `source_order` | INTEGER | 在原始时间串中的顺序 |

为什么要拆这张表：

- 前端需要按“第几周 + 星期几 + 节次”渲染课程格子。
- 如果只保存一整段 `上课时间` 字符串，前端每次都要重新解析，容易出错。
- 拆表后可以直接做时间冲突检查、周次过滤、课程分布时间轴。

## 4. 导入脚本计划

当前导入脚本是：

```text
scripts/import_src_data.py
```

本阶段建议扩展它，而不是新写一套完全独立脚本。

### 4.1 文件识别规则

新增识别：

```text
YYYY-YYYY-1-有课表课程.xls -> actual_schedule / fall
YYYY-YYYY-2-有课表课程.xls -> actual_schedule / spring
```

同时保留现有识别：

```text
本科生选课 -> raw_term_course_sections
本科课程补退选 -> raw_term_added_courses
一览表 -> raw_course_catalog_previews
```

### 4.2 导入流程

建议流程：

1. 备份数据库。
2. 创建新表和索引。
3. 清空 raw 数据区，包括新增实际课表 raw 表。
4. 逐个识别 `src_data/` 文件。
5. 旧类型文件写入旧 raw 表。
6. “有课表课程”文件写入：
   - `raw_actual_term_courses`
   - `raw_actual_term_meetings`
7. 输出导入报告：
   - 每个文件导入多少课程。
   - 每个文件解析出多少上课片段。
   - 哪些时间字符串解析失败。
   - 哪些地点数量和时间片段数量不一致。

### 4.3 上课时间解析规则

第一版需要支持这些格式：

```text
4-15周 星期三 0102节
1-16周 星期二 030405节
1,3,5,7,9,11,13,15周 星期三 0809节
9-11,13-16周 星期一 06070809节
4-15周 星期三 0102节,4-15周 星期五 0809节
```

解析结果至少要包含：

```text
week_numbers
weekday
period_start
period_end
```

地点匹配规则：

- 如果 `上课地点` 用逗号分隔，按顺序对应 `上课时间` 的每个片段。
- 如果地点数量少于时间片段，后续片段使用最后一个地点。
- 如果地点为空，允许 `classroom = NULL`，但在导入报告中记录。

## 5. 后端 API 计划

建议新增一个独立模块：

```text
app/server/modules/actual-schedule/
```

不放进 `courses` 模块，也不写入 `plan` 模块。

### 5.1 学期列表

```http
GET /api/actual-schedules/terms
```

用途：

返回当前已经导入实际课表的学期。

示例返回：

```json
[
  {
    "termNumber": 1,
    "academicYear": "2024-2025",
    "semester": "fall",
    "label": "大一上",
    "courseCount": 12,
    "meetingCount": 24
  }
]
```

### 5.2 某学期完整课表

```http
GET /api/actual-schedules/terms/:termNumber
```

用途：

进入“学期视图”时一次性拿到：

- 本学期课程列表。
- 本学期上课片段。
- 周次范围。
- 可用于课表渲染的 grid 数据。

查询参数：

| 参数 | 说明 |
|---|---|
| `week` | 可选，只返回某一周 |
| `weekday` | 可选，只返回某一天 |
| `courseCode` | 可选，筛选课程 |

### 5.3 某学期某周课表

```http
GET /api/actual-schedules/terms/:termNumber/weeks/:weekNumber
```

用途：

前端切换周次时轻量刷新。

第一版也可以不单独做这个接口，直接用上一条接口返回全量数据，在前端筛选。因为每学期课程数量很小，全量返回不会有性能压力。

### 5.4 与 raw 候选课的关系

现有接口继续保留：

```http
GET /api/raw/sections
GET /api/raw/added-courses
GET /api/raw/catalog-previews
GET /api/courses/:code/openings
```

它们用于“查某门课学校有没有开、有哪些课序号、有没有补退选信息”。

实际课表接口只回答：

```text
我这个学期实际上有哪些课？
它们第几周、星期几、第几节、在哪里上？
```

## 6. 前端入口计划

### 6.1 时间轴入口

入口放在时间轴的学期卡片上。

用户路径：

```text
时间轴
-> 我的计划
-> 某个学期卡片
-> 右上角“展开”图标按钮
-> 进入学期视图
```

调整点：

- 原有学期标识，如“大一上”，保留。
- 原有学分展示放到同一排。
- 在这一排右侧增加一个展开图标按钮。
- 不改变课程卡片本身。
- 不影响拖拽、待安排、垃圾篓。

建议视觉结构：

```text
┌────────────────────────────┐
│ 大一上        27.25 学分  ⛶ │
│ 2024-2025 第 1 学期          │
├────────────────────────────┤
│ 课程卡片...                  │
└────────────────────────────┘
```

图标建议使用简单的“展开 / 外部打开”语义。若当前项目没有图标库，第一版可以用文字符号按钮，后续再统一图标系统。

### 6.2 路由建议

当前项目还是状态式页面切换。第一版可以先做内部状态，不急着引入复杂路由。

建议两种方式择一：

方案 A：短期实现

```text
Timeline.tsx 内部状态：
selectedScheduleTerm: number | null
```

优点：少改动。

缺点：页面越来越大。

方案 B：更标准

```text
新增页面：
app/src/pages/TermSchedule.tsx
```

新增 App tab / route 状态：

```text
view = "timeline" | "trail" | "term-schedule"
selectedTermNumber = 1-8
```

优点：结构清楚，后续好维护。

建议采用方案 B。原因是 `Timeline.tsx` 已经很大，学期课表是完整新界面，不适合继续塞进去。

## 7. 学期视图界面设计

### 7.1 页面整体

页面保持当前风格：

- SF Mono Medium 字体。
- 暖色极简背景。
- 小字号、紧凑卡片。
- 颜色系统沿用课程五大类配色。
- 卡片圆角和阴影不额外夸张。

页面结构：

```text
顶部：返回时间轴 / 学期名称 / 学分与课程数量
上方：课程分布时间轴
下方：逐周课表
```

### 7.2 课程分布时间轴

主视图上方展示 1-16 或 1-17 周。

用途：

- 一眼看出哪些课程集中在前半学期。
- 哪些课程只在 4-8 周、9-16 周等阶段出现。
- 点击某一周后，下方课表切到该周。

第一版可以做成横向周次条：

```text
第 1  2  3  4  5  6 ... 16 周
课程 A  ━━━━━━━━━━━━━
课程 B        ━━━━━━━
课程 C  ━━━
```

不要一开始做复杂甘特图，先保证信息准确、交互清楚。

### 7.3 每周课表

下方是逐周课表：

```text
横向：星期一 到 星期日
纵向：一天不同时间段
```

建议第一版固定这些节次行：

| 行 | 节次 |
|---|---|
| 上午 1 | 0102 |
| 上午 2 | 030405 |
| 下午 1 | 0607 |
| 下午 2 | 0809 |
| 晚上 | 101112 |

如果实际数据出现 `06070809` 这种连续四节，课程卡片跨两行或先占据起始行并标明完整节次。第一版为了降低复杂度，可以先不做 CSS 跨行，只在卡片里显示 `06070809`。

### 7.4 课程格子显示

每门课默认显示：

```text
课程名称
上课地点
授课教师
```

可选显示项：

```text
课序号
上课班级
课程性质
课程属性
周次
```

显示控制建议沿用时间轴“显示内容”下拉勾选逻辑，不做一键开关。

## 8. 数据口径说明

### 8.1 学分展示

学期视图顶部可以展示该学期课程合计学分，但该数值只表示“实际课表文件中的课程学分合计”。

它不等于：

- 培养方案要求学分。
- 旅迹预计学分。
- 时间轴我的计划合计。

原因是实际课表来自学校课表文件，时间轴来自个人计划数据。二者可以对照，但不能混成同一个统计。

### 8.2 与时间轴课程的对应关系

第一版只做弱关联：

```text
course_code 相同 -> 认为可能是同一门课程
course_code + section_code 相同 -> 认为是同一个教学班
```

不要建立数据库外键。

原因：

- 学校课表可能出现课程号变化。
- 通选课、补退选课不一定在培养方案中。
- 实际课表数据是历史事实，不应被时间轴状态影响。

## 9. 实施阶段

### Phase 1：数据审计与迁移设计

产出：

- 新迁移 SQL：
  - `raw_actual_term_courses`
  - `raw_actual_term_meetings`
  - 必要索引
- 更新数据库文档。

验证：

- 空库能建表。
- 现有库能迁移。
- 后端启动不报缺表。

### Phase 2：导入脚本扩展

产出：

- `scripts/import_src_data.py` 支持“有课表课程”文件。
- 时间字符串解析函数。
- 导入报告。

验证：

- 四个实际课表文件全部导入。
- 每门课至少保留原始行。
- 可解析课程生成 meeting 行。
- 解析失败的行进入报告，不静默丢失。

### Phase 3：后端实际课表 API

产出：

- `actual-schedule.repository.ts`
- `actual-schedule.service.ts`
- `actual-schedule.module.ts`
- `/api/actual-schedules/*`

验证：

- 能查询 4 个学期。
- 能按学期返回课程和上课片段。
- 能按周过滤。

### Phase 4：前端学期视图入口

产出：

- 学期卡片右上角展开按钮。
- 新页面 `TermSchedule.tsx`。
- 从时间轴进入和返回。

验证：

- 不影响时间轴拖拽。
- 不影响待安排和垃圾篓。
- 只有有实际课表数据的学期显示可进入状态；没有数据的学期显示禁用或轻提示。

### Phase 5：学期视图初版 UI

产出：

- 顶部课程分布时间轴。
- 周次切换。
- 周课表网格。
- 显示项下拉勾选。

验证：

- 第 1-4 学期都能展示。
- 点击周次后课程格子正确变化。
- 地点、教师、课程名显示不溢出。
- 深色模式可读。

## 10. 暂不做的内容

第一版先不做：

- 自动选课。
- 抢课。
- 与学校系统同步。
- 时间冲突自动决策。
- 把实际课表自动写回时间轴。
- 把实际课表学分计入旅迹。
- 复杂的跨行课表渲染。

原因是这些会扩大数据口径和业务状态，容易把“实际课表展示”做成另一个教务系统。当前更稳妥的做法是：先把原始数据入库准确，再把学期课表视图做清楚。

## 11. 推荐下一步

下一步先做 Phase 1 和 Phase 2：

1. 新建实际课表 raw 表。
2. 扩展导入脚本。
3. 把四个“有课表课程”文件导入数据库。
4. 输出导入报告，让我们先确认数据是否准确。

数据准确后，再开始后端 API 和前端页面。
