# API 接口说明

## 1. 基础信息

后端默认地址：

```text
http://localhost:6174/api
```

当前所有接口均在 `app/server/index.ts` 中注册。后续重构时应迁移到 `app/server/modules/*/*.routes.ts`。

## 2. 接口总览

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/health | app/server/index.ts:209 |
| GET | /api/courses | app/server/index.ts:225 |
| GET | /api/courses/:code | app/server/index.ts:232 |
| GET | /api/program-requirements | app/server/index.ts:246 |
| GET | /api/semester-courses | app/server/index.ts:283 |
| POST | /api/semester-courses/official | app/server/index.ts:375 |
| PATCH | /api/semester-courses/official/:code | app/server/index.ts:410 |
| DELETE | /api/semester-courses/official/:code | app/server/index.ts:457 |
| POST | /api/semester-courses/manual | app/server/index.ts:586 |
| PATCH | /api/semester-courses/manual/:id | app/server/index.ts:599 |
| DELETE | /api/semester-courses/manual/:id | app/server/index.ts:687 |
| PATCH | /api/plan-courses/program/:code | app/server/index.ts:709 |
| PATCH | /api/plan-courses/custom/:id | app/server/index.ts:768 |
| GET | /api/personal-plan | app/server/index.ts:841 |
| POST | /api/personal-plan/official | app/server/index.ts:943 |
| DELETE | /api/personal-plan/official/:code | app/server/index.ts:988 |
| POST | /api/personal-plan/manual | app/server/index.ts:1020 |
| PATCH | /api/personal-plan/:id | app/server/index.ts:1035 |
| DELETE | /api/personal-plan/:id | app/server/index.ts:1114 |
| DELETE | /api/personal-plan/official/:code/trash | app/server/index.ts:1135 |
| GET | /api/trash | app/server/index.ts:1153 |
| POST | /api/trash/program/:code/restore | app/server/index.ts:1242 |
| POST | /api/trash/custom/:id/restore | app/server/index.ts:1260 |
| DELETE | /api/trash/program/:code | app/server/index.ts:1279 |
| DELETE | /api/trash/custom/:id | app/server/index.ts:1298 |
| POST | /api/trash/restore-all | app/server/index.ts:1309 |
| DELETE | /api/trash/empty | app/server/index.ts:1327 |
| GET | /api/credit-assignments | app/server/index.ts:1343 |
| PUT | /api/credit-assignments/:code | app/server/index.ts:1361 |
| DELETE | /api/credit-assignments/:code | app/server/index.ts:1388 |
| GET | /api/categories | app/server/index.ts:1398 |
| GET | /api/categories/:code/courses | app/server/index.ts:1402 |
| GET | /api/courses-with-category | app/server/index.ts:1422 |
| GET | /api/raw/batches | app/server/index.ts:1447 |
| GET | /api/raw/sections | app/server/index.ts:1454 |
| GET | /api/raw/added-courses | app/server/index.ts:1477 |
| GET | /api/raw/course-openings/:code | app/server/index.ts:1500 |

## 3. 健康检查

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/health | app/server/index.ts:209 |

用途：确认后端运行、数据库连接、核心表是否存在。

## 4. 培养方案要求

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/program-requirements | app/server/index.ts:246 |

返回培养方案各类别的学分要求，例如通识教育必修、通识教育选修、大类平台必修、大类平台经法管融通等。

## 5. 课程接口

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/courses | app/server/index.ts:225 |
| GET | /api/courses/:code | app/server/index.ts:232 |
| PATCH | /api/plan-courses/program/:code | app/server/index.ts:709 |
| PATCH | /api/plan-courses/custom/:id | app/server/index.ts:768 |
| GET | /api/courses-with-category | app/server/index.ts:1422 |

课程接口分两类：

| 类型 | 说明 |
|---|---|
| 查询接口 | 返回官方课程、按类别分组的课程、课程详情 |
| 编辑接口 | 修改官方课程或自定义课程字段 |

注意：通识教育选修/跨专业课程应在 `plan_custom_courses` 中处理。

## 6. 学期修读记录接口

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/semester-courses | app/server/index.ts:283 |
| POST | /api/semester-courses/official | app/server/index.ts:375 |
| PATCH | /api/semester-courses/official/:code | app/server/index.ts:410 |
| DELETE | /api/semester-courses/official/:code | app/server/index.ts:457 |
| POST | /api/semester-courses/manual | app/server/index.ts:586 |
| PATCH | /api/semester-courses/manual/:id | app/server/index.ts:599 |
| DELETE | /api/semester-courses/manual/:id | app/server/index.ts:687 |

这组接口主要处理“已修/正在修读/成绩/实际学期”。官方课程和自定义课程使用不同路径。

| 课程类型 | 路径特征 |
|---|---|
| 官方课程 | `/api/semester-courses/official` |
| 自定义课程 | `/api/semester-courses/manual` |

## 7. 个人计划接口

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/personal-plan | app/server/index.ts:841 |
| POST | /api/personal-plan/official | app/server/index.ts:943 |
| DELETE | /api/personal-plan/official/:code | app/server/index.ts:988 |
| POST | /api/personal-plan/manual | app/server/index.ts:1020 |
| PATCH | /api/personal-plan/:id | app/server/index.ts:1035 |
| DELETE | /api/personal-plan/:id | app/server/index.ts:1114 |
| DELETE | /api/personal-plan/official/:code/trash | app/server/index.ts:1135 |

个人计划接口处理“我的计划”“待安排”“加入计划”“移出计划”“添加自定义课程”等。

注意：`DELETE /api/personal-plan/official/:code` 与 `DELETE /api/personal-plan/official/:code/trash` 语义不同。前者偏向移出计划，后者偏向删除到垃圾篓。

## 8. 垃圾篓接口

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/trash | app/server/index.ts:1153 |
| POST | /api/trash/program/:code/restore | app/server/index.ts:1242 |
| POST | /api/trash/custom/:id/restore | app/server/index.ts:1260 |
| DELETE | /api/trash/program/:code | app/server/index.ts:1279 |
| DELETE | /api/trash/custom/:id | app/server/index.ts:1298 |
| POST | /api/trash/restore-all | app/server/index.ts:1309 |
| DELETE | /api/trash/empty | app/server/index.ts:1327 |

删除语义：

| 类型 | 删除到垃圾篓 | 永久删除 |
|---|---|---|
| 官方课程 | `is_deleted = 1` | `is_permanently_deleted = 1` |
| 自定义课程 | `is_deleted = 1` | 物理删除 |

## 9. 学分归属接口

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/credit-assignments | app/server/index.ts:1343 |
| PUT | /api/credit-assignments/:code | app/server/index.ts:1361 |
| DELETE | /api/credit-assignments/:code | app/server/index.ts:1388 |

这组接口用于学分归属调整，和经法管融通等特殊归属有关。后续应和 `credit_count_to`、`assigned_to` 的转换规则统一整理。

## 10. 分类接口

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/categories | app/server/index.ts:1398 |
| GET | /api/categories/:code/courses | app/server/index.ts:1402 |

分类接口返回课程类别和某类别下的课程。

## 11. raw 原始数据接口

| 方法 | 路径 | 位置 |
|---|---|---|
| GET | /api/raw/batches | app/server/index.ts:1447 |
| GET | /api/raw/sections | app/server/index.ts:1454 |
| GET | /api/raw/added-courses | app/server/index.ts:1477 |
| GET | /api/raw/course-openings/:code | app/server/index.ts:1500 |

raw 接口只读，不写用户状态。

| 接口 | 用途 |
|---|---|
| `GET /api/raw/batches` | 查看导入批次 |
| `GET /api/raw/sections` | 查询完整选课教学班 |
| `GET /api/raw/added-courses` | 查询补退选新增课 |
| `GET /api/raw/course-openings/:code` | 查询某课程在 raw 表中的开设记录 |

## 12. 常用字段说明

| 字段 | 含义 |
|---|---|
| `course_code` | 课程号。官方课程通常为学校课程号，自定义课程可为 `CUSTOM-*` |
| `course_name` | 课程名 |
| `category_code` | 课程类别编码 |
| `category_name` | 课程类别中文名 |
| `course_nature` | 前端显示的课程性质：必修、选修、跨专业 |
| `requirement_type` | 数据库存储的课程性质，可包含经法管融通 |
| `is_interdisciplinary` | 是否作为经法管融通课程处理 |
| `assigned_to` | 前端使用的学分计入方向 |
| `credit_count_to` | 数据库存储的学分计入口径 |
| `planned_term` | 官方课程计划学期 |
| `term_number` | 自定义课程学期 |
| `actual_term` | 官方课程实际修读学期 |
| `score` | 成绩 |
| `study_status` | 修读状态 |
| `is_deleted` | 是否进入垃圾篓 |
| `is_permanently_deleted` | 官方课程是否永久隐藏 |

## 13. 接口维护规则

1. 新增接口必须登记到本文档。
2. 修改请求字段时，同时更新 `app/src/lib/api.ts` 和 `app/src/types.ts`。
3. 涉及数据库字段时，同时更新 `docs/06-database-design.md`。
4. raw 接口不得写入 `plan_*` 用户状态。
5. 删除类接口必须明确区分“移出计划”“进入垃圾篓”“永久删除/隐藏”。
