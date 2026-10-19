# 数据库设计说明

> **注意（多用户版）**：项目已迁移到 Cloudflare Workers + D1，本文中 Express、`DB_PATH`、单用户表的描述已过时，运行、部署与数据库以 [`18-cloudflare-deployment.md`](18-cloudflare-deployment.md) 为准。

## 1. 数据库文件

当前主数据库：

```text
db/course_planner_v2.sqlite
```

当前数据库共有 `7` 张业务表：

| 表 | 行数 | 字段数 |
|---|---|---|
| plan_custom_courses | 21 | 23 |
| plan_program_courses | 75 | 29 |
| plan_program_requirements | 11 | 9 |
| raw_course_catalog_previews | 1178 | 19 |
| raw_import_batches | 6 | 8 |
| raw_term_added_courses | 117 | 13 |
| raw_term_course_sections | 9864 | 19 |

当前完整性检查结果应保持：

```sql
PRAGMA integrity_check;      -- 期望 ok
PRAGMA foreign_key_check;    -- 期望无异常
```

## 2. 数据库设计原则

### 2.1 官方培养方案与用户自选分离

```text
plan_program_courses = 官方培养方案课程
plan_custom_courses  = 用户自选/自定义课程
```

通识教育选修、通识教育跨专业、通识教育中的经法管融通课程，属于用户选择形成的课程集合，应放入 `plan_custom_courses`，不应放入 `plan_program_courses`。

当前检查结果：

```text
plan_program_courses 中 通识教育-选修/跨专业 数量：0
plan_custom_courses 中 通识教育课程数量：18
```

### 2.2 学分要求与课程明细分离

`plan_program_requirements` 只保存学分要求，不保存具体课程。具体课程分别由 `plan_program_courses` 和 `plan_custom_courses` 保存。

### 2.3 raw 表不承载用户状态

`raw_*` 表来自学校原始 Excel，只保存原始开课事实。raw 表不直接保存计划学期、成绩、删除状态等用户行为。

### 2.4 删除语义分离

| 课程类型 | 删除到垃圾篓 | 永久删除 |
|---|---|---|
| 官方课程 | `is_deleted = 1` | `is_permanently_deleted = 1`，不物理删除 |
| 自定义课程 | `is_deleted = 1` | 物理删除 |
| raw 数据 | 原则上不在应用内删除 | 通过重新导入或维护脚本处理 |

## 3. 学分要求

| 类别 | 要求 | 学分 | 来源 | 备注 |
|---|---|---|---|---|
| 通识教育 | 选修 | 16.0 | 通识教育48 |  |
| 通识教育 | 必修 | 32.0 | 通识教育48 |  |
| 大类平台 | 选修 | 10.0 | 用户确认：大类平台选修要求至少 10 学分 |  |
| 大类平台 | 大类平台（经法管融通） | 6.0 | 用户确认：经法管融通要求 6 学分 |  |
| 大类平台 | 必修 | 30.0 | 大类46+专业38 |  |
| 实践教育 | 选修 | 0.0 | 实践教育16：原培养方案未列选修要求 |  |
| 实践教育 | 必修 | 16.0 | 实践教育16 |  |
| 专业教育 | 选修 | 20.0 | 大类46+专业38 |  |
| 专业教育 | 必修 | 18.0 | 大类46+专业38 |  |
| 素质教育 | 选修 | 6.0 | 素质教育12 |  |
| 素质教育 | 必修 | 6.0 | 素质教育12 |  |

## 4. 官方课程分布

`plan_program_courses` 当前课程分布：

| 类别 | 性质 | 课程数 | 学分合计 |
|---|---|---|---|
| 专业教育 | 必修 | 7 | 18.0 |
| 专业教育 | 选修 | 22 | 50.0 |
| 大类平台 | 必修 | 9 | 30.0 |
| 大类平台 | 选修 | 6 | 17.0 |
| 实践教育 | 必修 | 6 | 16.0 |
| 素质教育 | 必修 | 5 | 6.0 |
| 通识教育 | 必修 | 20 | 32.0 |

## 5. 自定义/自选课程分布

`plan_custom_courses` 当前有效课程分布：

| 类别 | 性质 | 课程数 | 学分合计 |
|---|---|---|---|
| 通识教育 | 经法管融通 | 2 | 4.0 |
| 通识教育 | 跨专业 | 4 | 12.0 |
| 通识教育 | 选修 | 8 | 11.5 |

## 6. 表关系

```text
plan_program_requirements
    ↓ 按 category_code + requirement_type_code 描述学分要求
plan_program_courses
    ↓ 官方培养方案课程，可有计划学期、成绩、删除状态
plan_custom_courses
    ↓ 用户自选/自定义课程，可有计划学期、成绩、删除状态
raw_import_batches
    ↓ raw 数据导入批次
raw_term_course_sections
raw_term_added_courses
raw_course_catalog_previews
    ↓ 按 course_code / academic_year / semester 与课程临时关联
```

重要说明：raw 表与 plan 表之间不建立强外键。原因是学校开课数据会随学期变化，培养方案课程也可能没有对应学期的开课记录，强行外键会造成不必要的约束。

## 7. 每张表字段说明

### plan_custom_courses

行数：`21`。

| 字段 | 类型 | 主键 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|---|
| category_code | TEXT |  | 是 |  | 课程所属大类编码，例如 general_education、major_platform。 |
| category_name | TEXT |  | 是 |  | 课程所属大类中文名。 |
| requirement_type | TEXT |  | 是 |  | 课程性质。官方/自定义课程中使用 必修、选修、跨专业、经法管融通。 |
| course_subcategory | TEXT |  |  |  | 更细的课程子类。经法管融通课程会使用更具体的子类名。 |
| course_code | TEXT | 是 |  |  | 课程号。官方课程来自培养方案或学校原始数据；自定义课程可能为 CUSTOM-*。 |
| section_code | TEXT |  |  |  | 课序号/教学班号。 |
| course_name | TEXT |  | 是 |  | 课程名称。 |
| term_number | INTEGER |  |  |  | 自定义课程所属/计划/实际学期，1-8；为空表示待安排。 |
| credits | REAL |  | 是 |  | 学分。 |
| total_hours | INTEGER |  | 是 | 0 | 总学时。 |
| lecture_hours | INTEGER |  | 是 | 0 | 课堂/讲课学时。 |
| experiment_hours | INTEGER |  | 是 | 0 | 实验/实践学时。 |
| extra_hours | INTEGER |  | 是 | 0 | 课外学时。 |
| prerequisite_course_code | TEXT |  |  |  | 先修课程号。 |
| study_status | TEXT |  | 是 | '未修读' | 修读状态：未修读、计划修读、正在修读、已修读、未通过等。 |
| score | REAL |  |  |  | 成绩，通常 0-100；为空表示未录入。 |
| credit_count_to | TEXT |  |  |  | 学分计入口径。经法管融通课程用于区分计入大类平台选修或通识教育选修。 |
| note | TEXT |  |  |  | 备注。 |
| created_at | TEXT |  | 是 | datetime('now') | 创建时间。 |
| updated_at | TEXT |  | 是 | datetime('now') | 更新时间。 |
| is_deleted | INTEGER |  | 是 | 0 | 是否进入垃圾篓。0 表示正常，1 表示软删除。 |
| deleted_at | TEXT |  |  |  | 进入垃圾篓时间。 |
| deleted_note | TEXT |  |  |  | 删除备注。 |
### plan_program_courses

行数：`75`。

| 字段 | 类型 | 主键 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|---|
| category_code | TEXT |  | 是 |  | 课程所属大类编码，例如 general_education、major_platform。 |
| category_name | TEXT |  | 是 |  | 课程所属大类中文名。 |
| requirement_type | TEXT |  | 是 |  | 课程性质。官方/自定义课程中使用 必修、选修、跨专业、经法管融通。 |
| course_subcategory | TEXT |  |  |  | 更细的课程子类。经法管融通课程会使用更具体的子类名。 |
| course_code | TEXT | 是 |  |  | 课程号。官方课程来自培养方案或学校原始数据；自定义课程可能为 CUSTOM-*。 |
| section_code | TEXT |  |  |  | 课序号/教学班号。 |
| course_name | TEXT |  | 是 |  | 课程名称。 |
| official_term | TEXT |  |  |  | 培养方案建议/官方开课学期。 |
| planned_term | INTEGER |  |  |  | 用户计划修读学期，1-8；为空表示待安排。 |
| credits | REAL |  | 是 |  | 学分。 |
| total_hours | INTEGER |  | 是 | 0 | 总学时。 |
| lecture_hours | INTEGER |  | 是 | 0 | 课堂/讲课学时。 |
| experiment_hours | INTEGER |  | 是 | 0 | 实验/实践学时。 |
| extra_hours | INTEGER |  | 是 | 0 | 课外学时。 |
| prerequisite_course_code | TEXT |  |  |  | 先修课程号。 |
| actual_term | INTEGER |  |  |  | 用户实际修读学期，1-8。 |
| study_status | TEXT |  | 是 | '未修读' | 修读状态：未修读、计划修读、正在修读、已修读、未通过等。 |
| score | REAL |  |  |  | 成绩，通常 0-100；为空表示未录入。 |
| credit_count_to | TEXT |  |  |  | 学分计入口径。经法管融通课程用于区分计入大类平台选修或通识教育选修。 |
| source_sheet | TEXT |  |  |  | 源 Excel 工作表名称。 |
| source_row | INTEGER |  |  |  | 源文件行号。 |
| preference_level | INTEGER |  |  |  | 偏好或优先级预留字段。 |
| note | TEXT |  |  |  | 备注。 |
| created_at | TEXT |  | 是 | datetime('now') | 创建时间。 |
| updated_at | TEXT |  | 是 | datetime('now') | 更新时间。 |
| is_deleted | INTEGER |  | 是 | 0 | 是否进入垃圾篓。0 表示正常，1 表示软删除。 |
| deleted_at | TEXT |  |  |  | 进入垃圾篓时间。 |
| deleted_note | TEXT |  |  |  | 删除备注。 |
| is_permanently_deleted | INTEGER |  | 是 | 0 | 官方课程的用户视角永久隐藏标记。用于保证培养方案课程仍有备份。 |
### plan_program_requirements

行数：`11`。

| 字段 | 类型 | 主键 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|---|
| category_code | TEXT | 是 | 是 |  | 课程所属大类编码，例如 general_education、major_platform。 |
| category_name | TEXT |  | 是 |  | 课程所属大类中文名。 |
| requirement_type_code | TEXT | 是 | 是 |  | 学分要求类型编码，例如 required、elective、interdisciplinary。 |
| requirement_name | TEXT |  | 是 |  | 学分要求中文名。 |
| required_credits | REAL |  | 是 |  | 该类别/性质要求达到的最低学分。 |
| source | TEXT |  |  |  |  |
| note | TEXT |  |  |  | 备注。 |
| created_at | TEXT |  | 是 | datetime('now') | 创建时间。 |
| updated_at | TEXT |  | 是 | datetime('now') | 更新时间。 |
### raw_course_catalog_previews

行数：`1178`。

| 字段 | 类型 | 主键 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|---|
| id | INTEGER | 是 |  |  | 自增主键。 |
| academic_year | TEXT |  | 是 |  | 学年，例如 2025-2026。 |
| semester | TEXT |  | 是 |  | 学期，fall 表示第一学期，spring 表示第二学期。 |
| source_file | TEXT |  | 是 |  | 原始来源文件名。 |
| source_format | TEXT |  |  |  | 来源文件格式，例如 xlsx 或 xls。 |
| source_sheet | TEXT |  |  |  | 源 Excel 工作表名称。 |
| source_row | INTEGER |  | 是 |  | 源文件行号。 |
| ordinal | INTEGER |  |  |  | 原始一览表序号。 |
| department | TEXT |  |  |  | 开课单位。 |
| course_code | TEXT |  | 是 |  | 课程号。官方课程来自培养方案或学校原始数据；自定义课程可能为 CUSTOM-*。 |
| course_name | TEXT |  | 是 |  | 课程名称。 |
| module_2022 | TEXT |  |  |  | 2022 版所属模块。 |
| module_2024 | TEXT |  |  |  | 2024 版所属模块。 |
| course_category | TEXT |  |  |  | 原始一览表课程类别。 |
| course_attribute | TEXT |  |  |  | 课程属性。 |
| hours | REAL |  |  |  | 学校原始表中的学时。 |
| credits | REAL |  |  |  | 学分。 |
| imported_at | TEXT |  | 是 | datetime('now') | 导入时间。 |
| note | TEXT |  |  |  | 备注。 |
### raw_import_batches

行数：`6`。

| 字段 | 类型 | 主键 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|---|
| id | INTEGER | 是 |  |  | 自增主键。 |
| academic_year | TEXT |  | 是 |  | 学年，例如 2025-2026。 |
| semester | TEXT |  | 是 |  | 学期，fall 表示第一学期，spring 表示第二学期。 |
| phase | TEXT |  | 是 |  | 导入阶段，final 表示期末完整选课表，beginning_add 表示开学补退选表。 |
| source_file | TEXT |  | 是 |  | 原始来源文件名。 |
| source_format | TEXT |  |  |  | 来源文件格式，例如 xlsx 或 xls。 |
| imported_at | TEXT |  | 是 | datetime('now') | 导入时间。 |
| note | TEXT |  |  |  | 备注。 |
### raw_term_added_courses

行数：`117`。

| 字段 | 类型 | 主键 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|---|
| batch_id | INTEGER | 是 | 是 |  | raw_import_batches 的批次编号。 |
| course_code | TEXT | 是 | 是 |  | 课程号。官方课程来自培养方案或学校原始数据；自定义课程可能为 CUSTOM-*。 |
| course_name | TEXT |  | 是 |  | 课程名称。 |
| department | TEXT |  |  |  | 开课单位。 |
| learning_platform | TEXT |  |  |  | 学习平台。 |
| credits | REAL |  |  |  | 学分。 |
| class_time | TEXT |  |  |  | 上课时间。 |
| enrollment_restriction | TEXT |  |  |  | 选课限制说明。 |
| module_2022 | TEXT |  |  |  | 2022 版所属模块。 |
| module_2024 | TEXT |  |  |  | 2024 版所属模块。 |
| remark1 | TEXT |  |  |  | 原始补退选表备注1。 |
| remark2 | TEXT |  |  |  | 原始补退选表备注2。 |
| source_row | INTEGER |  | 是 |  | 源文件行号。 |
### raw_term_course_sections

行数：`9864`。

| 字段 | 类型 | 主键 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|---|
| batch_id | INTEGER | 是 | 是 |  | raw_import_batches 的批次编号。 |
| course_code | TEXT | 是 | 是 |  | 课程号。官方课程来自培养方案或学校原始数据；自定义课程可能为 CUSTOM-*。 |
| section_code | TEXT | 是 | 是 |  | 课序号/教学班号。 |
| course_name | TEXT |  | 是 |  | 课程名称。 |
| hours | REAL |  |  |  | 学校原始表中的学时。 |
| credits | REAL |  |  |  | 学分。 |
| teacher | TEXT |  |  |  | 上课教师。 |
| class_time | TEXT |  |  |  | 上课时间。 |
| teaching_weeks | TEXT |  |  |  | 上课周次。 |
| enrollment_restriction | TEXT |  |  |  | 选课限制说明。 |
| combined_class_name | TEXT |  |  |  | 合班名称。 |
| campus | TEXT |  |  |  | 上课校区。 |
| department | TEXT |  |  |  | 开课单位。 |
| course_attribute | TEXT |  |  |  | 课程属性。 |
| gender_requirement | TEXT |  |  |  | 性别要求。 |
| enrollment_open | TEXT |  |  |  | 选课开放状态。 |
| source_row | INTEGER |  | 是 |  | 源文件行号。 |
| classroom | TEXT |  |  |  | 上课地点。 |
| group_name | TEXT |  |  |  | 分组名称。 |

## 8. 当前设计中需要注意的地方

### 8.1 `plan_program_courses` 仍然承担用户状态

`plan_program_courses` 中除了官方课程信息，还有：

```text
planned_term
actual_term
study_status
score
is_deleted
is_permanently_deleted
```

这表示它同时承担“官方课程定义”和“用户状态”两种职责。当前规模下可以接受，但长期更清晰的设计是拆成：

```text
program_courses              官方课程定义
user_program_course_states    用户对官方课程的计划、成绩、删除状态
```

短期不建议马上拆，因为会牵动前后端大量接口。

### 8.2 `plan_custom_courses` 使用 course_code 作为主键

自定义课程允许 `CUSTOM-*` 课程号。迁移通识选修/跨专业课程时，如果原本有学校课程号，则直接保留原课程号。后续添加自定义课时，应继续保证课程号唯一。

### 8.3 `credit_count_to` 的语义要统一

`credit_count_to` 用于经法管融通等特殊学分归属。前端显示时会转为 `assigned_to`：

| 数据库存储 | 前端字段 |
|---|---|
| `通识教育-选修` | `elective` |
| 其他非空归属 | `interdisciplinary` |
| `NULL` | `NULL` |

这类转换不应散落在多个文件中。

> **学分计算口径（含经法管融通 6 学分上限与溢出规则）以 [docs/16](16-credit-rule-finalization-and-frontend-plan.md) 为准。**
> 进度统计统一由后端 `/api/progress` 计算（唯一真相源）：`credit_count_to=大类平台-选修` 的经法管课计入「大类平台·经法管」桶、上限 6 学分，超出整门溢出计入「通识教育·选修」；`通识教育-选修` 直接计入通识选修。前端不再自行计算学分桶。

## 9. 修改数据库时的规则

1. 表结构变化必须写入 `migrations/`。
2. 迁移后应更新本文档的字段说明。
3. 迁移后应运行完整性检查。
4. 不要只修改 SQLite 文件而不留下迁移 SQL。
5. 不要让后端启动过程长期承担结构迁移职责。
