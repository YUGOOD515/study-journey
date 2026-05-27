# src_data 导入报告 v1

## 1. 导入结论

已经将 `src_data/` 中可识别的学校课程数据导入 `db/course_planner_v2.sqlite`。

本次导入没有改动 `plan_` 业务表，保留了培养方案、个人计划、成绩、垃圾篓等现有数据。导入范围只涉及 `raw_` 原始数据区。

导入前已自动备份数据库：

```text
db/course_planner_v2.sqlite.bak_before_src_data_import
```

## 2. 导入后的 raw 表

| 表 | 行数 | 说明 |
|---|---:|---|
| `raw_import_batches` | 6 | 三个完整选课批次 + 三个补退选批次 |
| `raw_term_course_sections` | 9864 | 本科生选课完整课程班级数据 |
| `raw_term_added_courses` | 117 | 本科课程补退选 / 新增课程 |
| `raw_course_catalog_previews` | 1178 | 通识教育、经法管融通、素质教育课程一览表 |

数据库检查结果：

```text
PRAGMA integrity_check = ok
PRAGMA foreign_key_check = 无异常
```

## 3. 批次明细

| batch_id | 学年 | 学期 | 类型 | 来源文件 |
|---:|---|---|---|---|
| 1 | 2024-2025 | spring | final | `2024-2025学年第2学期本科生选课.xlsx` |
| 2 | 2024-2025 | spring | beginning_add | `2024-2025学年第2学期本科课程补退选.xls` |
| 3 | 2025-2026 | fall | final | `2025-2026学年第1学期本科生选课.xlsx` |
| 4 | 2025-2026 | fall | beginning_add | `2025-2026学年第1学期本科课程补退选.xls` |
| 5 | 2025-2026 | spring | final | `2025-2026学年第2学期本科生选课.xlsx` |
| 6 | 2025-2026 | spring | beginning_add | `2025-2026学年第2学期本科课程补退选.xls` |

## 4. 每类数据导入情况

### 4.1 本科生选课完整表

| 来源文件 | 导入行数 | 课程号数量 |
|---|---:|---:|
| `2024-2025学年第2学期本科生选课.xlsx` | 3260 | 1344 |
| `2025-2026学年第1学期本科生选课.xlsx` | 3374 | 1250 |
| `2025-2026学年第2学期本科生选课.xlsx` | 3230 | 1262 |

导入表：

```text
raw_term_course_sections
```

额外补充字段：

```text
classroom  -- 上课地点
group_name -- 分组名称
```

原因：2025-2026 第二学期完整选课表里出现了 `上课地点`，2025-2026 第一学期完整选课表里有 `分组名称`，旧表结构没有这两个字段。为了尽量保留全部原始数据，已给 `raw_term_course_sections` 增加这两个字段。

### 4.2 本科课程补退选表

| 来源文件 | 导入行数 | 课程号数量 | 备注 |
|---|---:|---:|---|
| `2024-2025学年第2学期本科课程补退选.xls` | 37 | 37 | 无重复 |
| `2025-2026学年第1学期本科课程补退选.xls` | 37 | 37 | 无重复 |
| `2025-2026学年第2学期本科课程补退选.xls` | 43 | 43 | 有 1 条重复课程号，已跳过重复行 |

导入表：

```text
raw_term_added_courses
```

### 4.3 新增的一览表

| 来源文件 | 导入行数 | 课程号数量 |
|---|---:|---:|
| `2025-2026学年第1学期通识教育课程（选修）、专业教育课程（经法管融通）、素质教育课程一览表（仅供参考）.xls` | 344 | 344 |
| `2025-2026学年第2学期全校通识教育课程（选修）、专业教育课程（经法管融通）、素质教育课程一览表（仅供参考）.xlsx` | 834 | 831 |

导入表：

```text
raw_course_catalog_previews
```

---

## 5. 一览表能不能和补退选表合并

结论：**不建议合并。**

### 5.1 结构不同

补退选表重点是“新增/补退选课程”：

```text
课程编号
课程名称
开课单位
学习平台
学分
上课时间
选课限制说明
所属模块
备注
```

一览表重点是“课程目录 / 模块归类参考”：

```text
课程编号
课程名称
所属模块
课程类别
课程属性
学时
学分
```

第二学期一览表甚至没有 `学分`、`学时`、`课程属性` 等完整教学执行字段。

### 5.2 语义不同

补退选表表示：

```text
这个阶段新增了什么课，怎么上课，限制是什么
```

一览表表示：

```text
本学期有哪些通识教育选修 / 经法管融通 / 素质教育课程可参考
```

前者是“选课执行数据”，后者是“课程目录数据”。

### 5.3 重合度不足以合并

用课程号比较：

| 学期 | 补退选课程号 | 一览表课程号 | 重合 |
|---|---:|---:|---:|
| 2025-2026 第一学期 | 37 | 344 | 0 |
| 2025-2026 第二学期 | 43 | 831 | 38 |

第二学期虽然有 38 门重合，但一览表还包含 793 门补退选表里没有的课程。因此它不是补退选表的简单补充，而是另一类更大的课程目录。

---

## 6. 新表设置

新增表：

```text
raw_course_catalog_previews
```

字段：

```text
id
academic_year
semester
source_file
source_format
source_sheet
source_row
ordinal
department
course_code
course_name
module_2022
module_2024
course_category
course_attribute
hours
credits
imported_at
note
```

设计原则：

```text
不和 plan_ 表建立外键
不和 raw_term_added_courses 强行合并
只保留学校原始一览表事实
后续前端查询时按 course_code / academic_year / semester 做临时关联
```

---

## 7. 后续使用建议

### 7.1 `raw_term_course_sections`

用于：

```text
查看教学班
查看教师
查看上课时间
查看上课地点
做时间冲突检查
```

### 7.2 `raw_term_added_courses`

用于：

```text
展示补退选新增课
快速加入我的计划
尤其适合 Mooc / 通识选修 / 新增课堂
```

### 7.3 `raw_course_catalog_previews`

用于：

```text
构建通识教育 / 经法管融通 / 素质教育候选课程库
按模块筛选课程
判断某门课是否属于经法管融通或某类通识模块
为补退选表补充课程类别和模块信息
```

建议前端后续做“选课候选”时，不是简单展示补退选表，而是把三类 raw 数据合起来查：

```text
完整开课班级 raw_term_course_sections
补退选新增 raw_term_added_courses
课程目录预览 raw_course_catalog_previews
```

三者通过 `academic_year + semester + course_code` 临时关联。

