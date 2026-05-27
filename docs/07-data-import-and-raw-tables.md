# 数据导入与 raw 表说明

## 1. src_data 目录用途

`src_data/` 保存学校发布的原始 Excel 文件。它不是前端直接读取的数据源，而是导入脚本的输入目录。

当前导入脚本会识别以下类型：

| 文件类型 | 说明 | 目标表 |
|---|---|---|
| 本科生选课完整表 | 每学期期末发布，包含完整教学班信息 | `raw_term_course_sections` |
| 本科课程补退选表 | 开学初补退选/新增课程 | `raw_term_added_courses` |
| 通识/经法管融通/素质课程一览表 | 候选课程目录和模块归类 | `raw_course_catalog_previews` |
| 培养方案表 | 培养方案来源文件 | 当前不由 `import_src_data.py` 自动写入 raw 表 |

## 2. 导入脚本

主导入脚本：

```text
scripts/import_src_data.py
```

脚本原则：

```text
只更新 raw_* 原始数据区
不改动 plan_* 业务表
导入前可自动备份数据库
重新导入时会重置 raw 表
```

典型命令：

```bash
python scripts/import_src_data.py --db db/course_planner_v2.sqlite --src src_data
```

跳过备份：

```bash
python scripts/import_src_data.py --db db/course_planner_v2.sqlite --src src_data --no-backup
```

## 3. 当前 raw 表

| 表 | 行数 |
|---|---|
| raw_course_catalog_previews | 1178 |
| raw_import_batches | 6 |
| raw_term_added_courses | 117 |
| raw_term_course_sections | 9864 |

## 4. 导入批次

| ID | 学年 | 学期 | 阶段 | 来源文件 | 格式 | 说明 |
|---|---|---|---|---|---|---|
| 1 | 2024-2025 | spring | final | 2024-2025学年第2学期本科生选课.xlsx | xlsx | 本科生选课完整课程数据 |
| 2 | 2024-2025 | spring | beginning_add | 2024-2025学年第2学期本科课程补退选.xls | xls | 本科课程补退选/新增课程数据 |
| 3 | 2025-2026 | fall | final | 2025-2026学年第1学期本科生选课.xlsx | xlsx | 本科生选课完整课程数据 |
| 4 | 2025-2026 | fall | beginning_add | 2025-2026学年第1学期本科课程补退选.xls | xls | 本科课程补退选/新增课程数据 |
| 5 | 2025-2026 | spring | final | 2025-2026学年第2学期本科生选课.xlsx | xlsx | 本科生选课完整课程数据 |
| 6 | 2025-2026 | spring | beginning_add | 2025-2026学年第2学期本科课程补退选.xls | xls | 本科课程补退选/新增课程数据 |

## 5. raw 表职责

### 5.1 `raw_import_batches`

记录每次导入的学校文件批次。其他 raw 表通过 `batch_id` 关联到它。

适合用于：

```text
按学年筛选
按学期筛选
区分完整选课表和补退选表
追踪原始来源文件
```

### 5.2 `raw_term_course_sections`

保存完整本科生选课表中的教学班数据。它的粒度是：

```text
batch_id + course_code + section_code
```

适合用于：

```text
查询某学期是否开课
查询课序号
查询教师
查询上课时间
查询上课周次
查询校区/地点
后续做时间冲突检查
```

### 5.3 `raw_term_added_courses`

保存补退选/新增课程。它的粒度是：

```text
batch_id + course_code
```

适合用于：

```text
查看开学初新增了哪些课
查看补退选阶段课程
发现完整选课表之外的课程变化
快速加入用户计划
```

### 5.4 `raw_course_catalog_previews`

保存通识教育、经法管融通、素质教育课程一览表。它更像课程候选目录，不一定包含完整教学班信息。

适合用于：

```text
构建通识教育候选课程库
判断课程模块归属
判断是否属于经法管融通
为补退选表补充课程类别和模块信息
```

## 6. raw 表与 plan 表的关系

raw 表和 plan 表通过临时查询关联，而不是外键绑定：

```text
course_code
academic_year
semester
```

原因：

1. 培养方案中的课程不一定在当前 raw 数据覆盖学期内开设。
2. raw 表是按学期变化的历史事实。
3. 学校文件中课程号、课程名可能存在口径变化。
4. 用户自定义课程可能没有学校课程号。

## 7. 不建议合并 raw 表

不要把 `raw_term_added_courses` 和 `raw_course_catalog_previews` 强行合并。它们语义不同：

| 表 | 语义 |
|---|---|
| `raw_term_added_courses` | 补退选/新增课程，是选课执行数据 |
| `raw_course_catalog_previews` | 课程目录/模块归类参考，是候选课程数据 |

即使有部分课程号重合，也不代表两者是同一类数据。

## 8. 后续使用建议

### 8.1 候选课程查询

候选课程功能可以综合查询：

```text
raw_term_course_sections
raw_term_added_courses
raw_course_catalog_previews
```

但最终加入“我的计划”时，应写入：

```text
plan_custom_courses
```

或者如果是官方培养方案课程的计划状态变化，则更新：

```text
plan_program_courses
```

### 8.2 时间冲突检查

时间冲突检查应优先使用 `raw_term_course_sections.class_time`、`teaching_weeks`、`classroom`。不要从 `plan_*` 表中推断真实上课时间，因为 `plan_*` 主要是课程计划与修读状态表。

### 8.3 重新导入

重新导入 raw 数据时，原则上可以重置 raw 表，因为 raw 表不存用户状态。重新导入前仍应备份数据库。

## 9. 维护规则

1. 新增学校文件后，先放入 `src_data/`。
2. 运行导入脚本前备份数据库。
3. 导入后检查 raw 表行数和批次。
4. 不允许导入脚本直接覆盖 `plan_program_courses` 或 `plan_custom_courses`。
5. 如果学校文件格式变化，应先更新导入脚本，再更新本文档。
