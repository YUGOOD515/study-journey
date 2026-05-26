# Course Planner v2 数据库包

## 文件

- `course_planner_v2.sqlite`：已经建立并导入数据的最终数据库。
- `create_tables.sql`：仅建表、索引、触发器，不含数据。
- `insert_data.sql`：仅插入数据。复建时先执行 `create_tables.sql`，再执行本文件。
- `import_raw_courses.py`：后续每学期从学校 CSV 导入 raw_ 表的脚本。

## 当前表与行数

| 表 | 行数 |
|---|---:|
| `raw_import_batches` | 2 |
| `raw_term_course_sections` | 3260 |
| `raw_term_added_courses` | 37 |
| `plan_program_courses` | 86 |
| `plan_custom_courses` | 0 |
| `plan_program_requirements` | 11 |


## raw_ 与 plan_ 的关系

`raw_` 表仅保存学校课程表原始数据，不和 `plan_` 表建立外键。

`plan_` 表保存培养方案、个人规划、成绩和毕业要求。`plan_program_courses.prerequisite_course_code` 是自引用外键，当前只存一个先修课程号。

## plan_program_courses 状态统计

| 状态 | 数量 |
|---|---:|
| 已修读 | 35 |
| 未修读 | 45 |
| 正在修读 | 5 |
| 计划修读 | 1 |


## 培养类别统计

| 培养类别 | 课程数 |
|---|---:|
| 通识教育 | 31 |
| 大类平台 | 15 |
| 实践教育 | 6 |
| 专业教育 | 29 |
| 素质教育 | 5 |


## updated_at 触发器说明

`plan_program_courses`、`plan_custom_courses`、`plan_program_requirements` 均有 `AFTER UPDATE` 触发器。更新记录时，如果没有手动传入新的 `updated_at`，触发器会自动把它改为当前时间。

## 复建数据库

```bash
sqlite3 course_planner_v2.sqlite < create_tables.sql
sqlite3 course_planner_v2.sqlite < insert_data.sql
```

建议连接数据库后执行：

```sql
PRAGMA foreign_keys = ON;
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```
