# API 层重设计（实现契约）

本文档以"可直接落地实现"为目标，对 `course_planner_v2` 当前后端做一次彻底的 API 重设计。它不是按页面机械拆接口，而是按业务领域聚合资源、按业务动作建模写操作，并明确每个 endpoint 的事务边界、服务/仓储归属、校验责任。

读者预期：

- 后端：照此实现 controller / service / repository 三层。
- 前端：照此重写 `src/lib/api.ts` 与调用点。
- 评审：按 §7、§10 验证业务规则没有泄漏到客户端。

---

## 0. 写作背景

数据库结构以 `migrations/v2_001_create_tables.sql`、`v2_002_add_trash_fields.sql`、`v2_003_raw_catalog_preview.sql` 为准；当前后端实现位于 `app/server/index.ts`，前端调用点位于 `app/src/lib/api.ts` 与 `app/src/pages/{Timeline,Trail}.tsx`。

本设计不引入新的数据库表，所有改动可在现有 schema 上进行。

---

## 1. 现状审视

现有 35 个接口中存在三类系统性问题，本设计都给出解法：

| 问题 | 现象 | 解法 |
|---|---|---|
| 同字段三套写入路径 | `term_number / score / planned_term` 同时被 `/semester-courses/*`、`/personal-plan/*`、`/plan-courses/*` 修改，三者校验逻辑不一致 | 统一到 `/api/courses/:code` + 业务子动作 |
| 标识符不一致 | program 课程用 `course_code`，custom 课程用自增 `id`，前端要写两套分支 | 对外统一用 `course_code`；custom 课程用 `CUSTOM-<ulid>` 占位 |
| 业务规则在 controller 里 | `index.ts` 1500+ 行，状态机、归属拆分、软删除分支全堆在路由处理函数中 | 强制三层：controller 只做参数/响应，service 写业务，repository 写 SQL |

`/api/semester-courses` 与 `/api/personal-plan` 的语义差异（"已修记录" vs "我的计划"）在新设计中等价于 `study_status` 的不同取值，不应该是两套独立接口。

---

## 2. 设计原则

1. **资源按业务对象聚合**：一门课不管是 program 还是 custom、不管是"已修"还是"计划修读"，对外都是一个 `Course`。
2. **写操作分为字段编辑 (CRUD) 和业务动作 (sub-action)**。字段编辑用 `PATCH /resource/:id`；业务动作用 `POST /resource/:id/<verb>`，因为它们带状态机、跨字段一致性、跨表写。
3. **三层硬约束**：
   - Controller：仅做 HTTP 解析、调用 service、包装响应。**不**直接 import repository、**不**写 SQL。
   - Service：输入 DTO，输出业务对象。校验、状态机、事务编排都在这里。不接触 `req/res`。
   - Repository：仅做 SQL，对应一张物理表。返回行对象。不做规则判断。
4. **统一响应/错误格式**，HTTP 状态与业务码解耦。
5. **raw_ 表只读**，写入仅由导入脚本完成。
6. **所有跨表写、批量写必须事务**，由 service 经过 `unitOfWork(fn)` 包裹。

---

## 3. 业务对象与统一模型

### 3.1 Course（核心）

对外统一 schema（前端不再感知物理分表）：

```ts
type CourseSource = "program" | "custom";
type CategoryCode =
  | "general_education"
  | "major_platform"
  | "professional_education"
  | "quality_education"
  | "practice_education";
type RequirementType = "必修" | "选修" | "跨专业" | "经法管融通";
type StudyStatus =
  | "未修读" | "计划修读" | "正在修读" | "已修读" | "未通过";
type CreditCountTo = "通识教育-选修" | "大类平台-选修";

interface Course {
  source: CourseSource;
  courseCode: string;          // program: 学校课程号；custom: "CUSTOM-<ulid>"
  sectionCode: string | null;
  courseName: string;

  categoryCode: CategoryCode;
  categoryName: string;        // 由 categoryCode 派生
  requirementType: RequirementType;
  courseSubcategory: string | null;

  credits: number;
  totalHours: number;
  lectureHours: number;
  experimentHours: number;
  extraHours: number;

  // 计划与修读
  plannedTerm: number | null;  // 1..8 或 null（"待安排"）
  actualTerm: number | null;   // program 专有；custom 用 plannedTerm 兼任
  studyStatus: StudyStatus;
  score: number | null;        // 0..100

  // 经法管融通归属
  creditCountTo: CreditCountTo | null;

  // 先修
  prerequisiteCourseCode: string | null;
  prerequisiteCourseName: string | null;  // join 后的派生字段

  // 软删除
  isDeleted: boolean;
  isPermanentlyDeleted: boolean; // 仅 program 有意义
  deletedAt: string | null;
  deletedNote: string | null;

  // 杂项
  officialTerm: string | null;   // program 专有；课程方案建议的学期文字
  preferenceLevel: number | null;
  note: string | null;

  createdAt: string;
  updatedAt: string;
}
```

字段映射：

| 对外字段 | program 表字段 | custom 表字段 |
|---|---|---|
| `plannedTerm` | `planned_term` | `term_number` |
| `actualTerm` | `actual_term` | （始终为 null） |
| `officialTerm` | `official_term` | — |
| `isPermanentlyDeleted` | `is_permanently_deleted` | 始终 false |

custom 课程的 `term_number` 在对外语义上对应 `plannedTerm`；它本身不区分"计划/实际"，所以 custom 课程在状态变为 `已修读` 时，`plannedTerm` 同时被解释为"实际修读学期"。

### 3.2 状态机：`studyStatus`

```
                ┌──────────────────────────────────┐
                ▼                                  │
未修读 ──plan──▶ 计划修读 ──confirm──▶ 正在修读 ──finish──▶ 已修读
   ▲                │                       │                  │
   │                │                       └───fail──▶ 未通过 │
   │                ▼                                          │
   │           (清 plannedTerm)                                │
   └──reset──────────────────────────────────────────────────-─┘
```

约束：

- `已修读 / 未通过` ⇒ `actualTerm` 必填（program）或 `plannedTerm` 必填（custom），`score` 可选但建议存在。
- `计划修读 / 正在修读` ⇒ `plannedTerm` 必填，`score` 必须为 null。
- `未修读` ⇒ `plannedTerm = null`、`actualTerm = null`、`score = null`。

状态切换的具体规则在 §7.1 集中描述。

### 3.3 经法管融通归属

`creditCountTo` 不是独立资源，是 Course 的一个字段。

**业务定位**：经法管融通是通选课的一类（**与"跨专业"是完全独立的概念**），学校允许这类课程在两个去向之间二选一计入，但累计**最多 6 学分**，且学校要求**必须修满 6 学分**。

| 课程性质 | `creditCountTo` 允许值 |
|---|---|
| `必修 / 选修 / 跨专业` | 必为 null（custom 表 DB CHECK 强制） |
| `经法管融通` | 必为 `通识教育-选修` 或 `大类平台-选修` |

兼容当前 `assigned_to` 概念：前端旧字段 `assigned_to = 'interdisciplinary'` 等价于 `creditCountTo = '大类平台-选修'`，`assigned_to = 'elective'` 等价于按课程原 category 计入"通识教育-选修"。新接口只暴露 `creditCountTo`，前端不再做映射。

学分上限规则（§7.3 详述）：

- 经法管融通课程的有效学分按"按 `creditCountTo` 分桶后求和"得到，但**累计封顶 6 学分**。
- 超过 6 学分的部分在 `/progress` 中以 `overflow` 字段单独标出，不计入任何桶，也不进入 `earned/inProgress/planned`。

### 3.4 软删除

| 操作 | program | custom |
|---|---|---|
| 移入垃圾篓 | `is_deleted = 1, deleted_at = now()` | 同左 |
| 从垃圾篓恢复 | `is_deleted = 0, deleted_at = NULL, is_permanently_deleted = 0` | `is_deleted = 0, deleted_at = NULL` |
| 永久删除 | `is_permanently_deleted = 1`（仍保留行） | 物理 `DELETE` |

`is_permanently_deleted = 1` 的 program 课程不在任何列表中暴露（除非显式按内部 flag 查询，本 API 不提供）。

### 3.5 学分进度

```ts
interface CategoryProgress {
  categoryCode: CategoryCode;
  requirementType: "required" | "elective" | "interdisciplinary"; // requirement 表口径
  required: number;
  earned: number;
  inProgress: number;
  planned: number;
  pending: number;        // = required - earned - inProgress - planned，下限 0
  courses: Array<{ courseCode: string; courseName: string; credits: number; studyStatus: StudyStatus }>;
}

interface ProgressOverflow {
  interdisciplinary: {
    cap: 6;
    totalAttempted: number;   // 用户为经法管融通课分配的总学分
    counted: number;          // 实际计入桶的学分（≤ 6）
    overflowCredits: number;  // 超出 6 学分的部分
    overflowCourses: Array<{ courseCode: string; courseName: string; credits: number }>;
  };
}
```

口径：

- `earned = Σ credits where studyStatus='已修读'`
- `inProgress = Σ credits where studyStatus='正在修读'`
- `planned = Σ credits where studyStatus='计划修读'`
- 经法管融通课程按 `creditCountTo` 拆入对应桶；累计学分上限 6，超出部分进入 `overflow.interdisciplinary` 不计入。
- 进入垃圾篓或 `is_permanently_deleted=1` 的课程**不计入**任何桶。

---

## 4. URL 规范、统一响应、错误码

### 4.1 URL 规范

- 资源用复数名词：`/courses`、`/requirements`、`/trash`。
- 资源 id 用业务 key：`courseCode`、`(categoryCode, requirementTypeCode)`。
- 业务动作是子路径动词：`POST /courses/:code/plan`，不是 `/plans/:code`，因为"加入计划"是 Course 的一种状态切换，不是新资源。
- 批量动作用 `:verb` 后缀（仿 Google AIP-136）：`/trash:empty`、`/trash:restore-all`。

### 4.2 统一响应

```jsonc
// 成功（单体）
{ "ok": true, "data": <T> }

// 成功（列表）
{ "ok": true, "data": <T[]>, "meta": { "total": 42 } }

// 失败
{ "ok": false, "error": { "code": "<CODE>", "message": "...", "details": { "fields": { } } } }
```

HTTP 状态码：

- 200 一般成功
- 201 资源创建
- 204 删除成功且无 body（本设计避免使用，改为 200 返回操作结果）
- 400 `VALIDATION_FAILED`
- 404 `NOT_FOUND`
- 409 `CONFLICT`
- 422 `PRECONDITION_FAILED` / `IMMUTABLE_FIELD`
- 500 `INTERNAL_ERROR`

### 4.3 业务错误码

| code | HTTP | 何时使用 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 类型错、值越界、必填缺失、枚举不在白名单 |
| `NOT_FOUND` | 404 | 资源按 id 查不到 |
| `CONFLICT` | 409 | 状态冲突（重复加入计划、不在垃圾篓却请求恢复） |
| `PRECONDITION_FAILED` | 422 | 跨字段一致性失败、状态机非法迁移、先修未达成 |
| `IMMUTABLE_FIELD` | 422 | 试图修改不可变字段（program 的 `courseCode / categoryCode`） |
| `INTERNAL_ERROR` | 500 | 兜底，包含 DB 异常 |

`details` 字段约定：
- `details.fields` 字段级错误，形如 `{ "credits": "必须 >= 0" }`。
- `details.expected` / `details.actual` 用于状态冲突。
- 不要直接把 SQL 错误文本回传。

### 4.4 分页与排序

列表接口统一支持：

- `?limit=` 默认 200，最大 1000
- `?offset=` 默认 0
- `?sort=` 字段名，前缀 `-` 表示降序

聚合接口（如 `/progress`、`/trash`）不分页，但仍 cap `limit`。

---

## 5. 完整 API 总表

| # | Method | Path | 类型 | 事务 | 主要 service |
|---|---|---|---|---|---|
| 1 | GET | `/api/health` | meta | 否 | — |
| 2 | GET | `/api/meta/categories` | meta | 否 | `MetaService` |
| 3 | GET | `/api/requirements` | CRUD-R | 否 | `RequirementService` |
| 4 | PUT | `/api/requirements/:categoryCode/:requirementTypeCode` | CRUD-U | 否 | `RequirementService` |
| 5 | GET | `/api/courses` | CRUD-R | 否 | `CourseService` |
| 6 | GET | `/api/courses/:code` | CRUD-R | 否 | `CourseService` |
| 7 | POST | `/api/courses` | CRUD-C | 否 | `CourseService` |
| 8 | PATCH | `/api/courses/:code` | CRUD-U | 否 | `CourseService` |
| 9 | GET | `/api/courses/:code/openings` | CRUD-R 聚合 | 否 | `RawCatalogService` |
| 10 | POST | `/api/courses/:code/plan` | 业务动作 | 否 | `PlanService` |
| 11 | DELETE | `/api/courses/:code/plan` | 业务动作 | 否 | `PlanService` |
| 12 | POST | `/api/courses/:code/study-record` | 业务动作 | 否 | `StudyRecordService` |
| 13 | DELETE | `/api/courses/:code/study-record` | 业务动作 | 否 | `StudyRecordService` |
| 14 | POST | `/api/courses/:code/credit-assignment` | 业务动作 | 否 | `CreditAssignmentService` |
| 15 | DELETE | `/api/courses/:code/credit-assignment` | 业务动作 | 否 | `CreditAssignmentService` |
| 16 | POST | `/api/courses/:code/trash` | 业务动作 | 否 | `TrashService` |
| 17 | GET | `/api/trash` | CRUD-R 聚合 | 否 | `TrashService` |
| 18 | POST | `/api/trash/:code/restore` | 业务动作 | 否 | `TrashService` |
| 19 | DELETE | `/api/trash/:code` | 业务动作 | 否 | `TrashService` |
| 20 | POST | `/api/trash:restore-all` | 批量动作 | **是** | `TrashService` |
| 21 | DELETE | `/api/trash:empty` | 批量动作 | **是** | `TrashService` |
| 22 | GET | `/api/progress` | 聚合 | 否 | `ProgressService` |
| 23 | GET | `/api/progress/timeline` | 聚合 | 否 | `ProgressService` |
| 24 | GET | `/api/raw/batches` | CRUD-R | 否 | `RawCatalogService` |
| 25 | GET | `/api/raw/sections` | CRUD-R | 否 | `RawCatalogService` |
| 26 | GET | `/api/raw/added-courses` | CRUD-R | 否 | `RawCatalogService` |
| 27 | GET | `/api/raw/catalog-previews` | CRUD-R | 否 | `RawCatalogService` |
| 28 | POST | `/api/courses:batch-plan` | 批量动作 | **是** | `PlanService` |
| 29 | POST | `/api/courses:batch-study-record` | 批量动作 | **是** | `StudyRecordService` |
| 30 | POST | `/api/courses:batch-credit-assignment` | 批量动作 | **是** | `CreditAssignmentService` |
| 31 | POST | `/api/courses:batch-trash` | 批量动作 | **是** | `TrashService` |
| 32 | POST | `/api/trash:batch-restore` | 批量动作 | **是** | `TrashService` |
| 33 | DELETE | `/api/trash:batch-purge` | 批量动作 | **是** | `TrashService` |

共 33 个 endpoint。其中 27 个单体动作 + 6 个批量动作。所有批量动作 all-or-nothing，由 `unitOfWork` 包裹。

---

## 6. 每个 API 的详细规约

> 每条 endpoint 给出：①method/path ②用途 ③前端调用场景 ④request body ⑤response ⑥error codes ⑦是否需要事务 ⑧涉及 service ⑨涉及 repository ⑩CRUD 还是业务动作 ⑪是否需要后端独占校验 ⑫备注。

---

### 6.1 Meta

#### 1. `GET /api/health`

- 用途：探活，检查后端进程、SQLite 文件、必需表是否存在。
- 前端场景：启动时一次性调用，失败则在 UI 顶端显示连接异常。
- request：无。
- response：`{ ok: true, data: { db: "ok", tables: ["plan_program_courses", ...], version: "v2.3" } }`
- errors：`INTERNAL_ERROR`（500）。
- 事务：否。
- service：— （controller 直接读 DB metadata）。
- repository：`SystemRepository.pingDb()`、`SystemRepository.listTables()`。
- 类型：CRUD-R。
- 后端独占校验：无。

#### 2. `GET /api/meta/categories`

- 用途：返回 5 类别枚举、性质枚举、归属选项，让前端不再硬编码常量。
- 前端场景：`CourseEditFields` 渲染下拉、`ManualCourseDialog` 类别选择。
- request：无。
- response：
  ```json
  {
    "ok": true,
    "data": {
      "categories": [
        { "code": "general_education", "name": "通识教育" }
      ],
      "requirementTypes": ["必修", "选修", "跨专业", "经法管融通"],
      "creditCountTo": ["通识教育-选修", "大类平台-选修"],
      "studyStatuses": ["未修读", "计划修读", "正在修读", "已修读", "未通过"]
    }
  }
  ```
- errors：无。
- 事务：否。
- service：`MetaService.enums()`（返回静态常量即可）。
- repository：无。
- 类型：CRUD-R（静态）。
- 后端独占校验：无。

---

### 6.2 毕业要求

#### 3. `GET /api/requirements`

- 用途：列出 11 条毕业要求。
- 前端场景：Trail 页学分进度面板、Timeline 页右侧总览。
- request：无。
- response：列表 `ProgramRequirement[]`，schema 见 §3 + DB。
- errors：无。
- 事务：否。
- service：`RequirementService.listAll()`。
- repository：`RequirementRepository.findAll()`。
- 类型：CRUD-R。
- 后端独占校验：无。

#### 4. `PUT /api/requirements/:categoryCode/:requirementTypeCode`

- 用途：调整某一类别×性质的学分阈值。仅管理员手动维护时使用。
- 前端场景：当前没有 UI，预留给后续"自定义培养方案"。
- request：`{ "requiredCredits": 32.0, "note": "string|null" }`
- response：更新后的 `ProgramRequirement`。
- errors：`NOT_FOUND`、`VALIDATION_FAILED`（`requiredCredits < 0`）。
- 事务：否（单行 UPDATE）。
- service：`RequirementService.updateThreshold(categoryCode, typeCode, dto)`。
- repository：`RequirementRepository.updateByKey(...)`。
- 类型：CRUD-U。
- 后端独占校验：`requiredCredits >= 0`（DB CHECK 兜底）。

---

### 6.3 课程 CRUD

#### 5. `GET /api/courses`

- 用途：统一列表。program/custom 两表合并、可过滤。
- 前端场景：
  - Timeline 初始化加载所有课程（替代当前 `coursesWithCategory` + `semesterCourses` + `personalPlan` 三次请求）。
  - Trail 页加载所有课程。
  - 课程一览/搜索。
- query：
  | 参数 | 含义 | 默认 |
  |---|---|---|
  | `source` | `program / custom / all` | `all` |
  | `category` | `categoryCode` | 不过滤 |
  | `requirementType` | 性质过滤 | 不过滤 |
  | `status` | `studyStatus` 多值（逗号） | 不过滤 |
  | `term` | `plannedTerm` 等值（含 `null` 关键字） | 不过滤 |
  | `inTrash` | `true / false` | `false`（不返回垃圾篓内课程） |
  | `keyword` | 课程号/名 模糊 | 无 |
  | `limit`/`offset`/`sort` | 通用分页 | 见 §4.4 |
- response：`{ ok, data: Course[], meta: { total } }`。
- errors：`VALIDATION_FAILED`（参数非法）。
- 事务：否。
- service：`CourseService.list(filter)`。
- repository：`ProgramCourseRepository.find(filter)` + `CustomCourseRepository.find(filter)`，service 层做合并、排序、分页。
- 类型：CRUD-R。
- 后端独占校验：`is_permanently_deleted=1` 的 program 课程永不在结果中（即使 `inTrash=true`，理由见 §3.4）。

#### 6. `GET /api/courses/:code`

- 用途：单课程详情。
- 前端场景：CourseHoverCard 打开时加载完整字段；编辑对话框初始化。
- request：无。
- response：`{ ok, data: Course }`。
- errors：`NOT_FOUND`。
- 事务：否。
- service：`CourseService.getByCode(code)`。
- repository：按 `code` 前缀路由到 program 或 custom 仓储。
- 类型：CRUD-R。
- 后端独占校验：路由分流（前缀 `CUSTOM-` 走 custom，否则查 program）。

#### 7. `POST /api/courses`

- 用途：创建自定义课程（program 课程通过 import 脚本生成，不走 API）。
- 前端场景：`ManualCourseDialog` 提交 / Timeline "添加课程"按钮。
- request：
  ```json
  {
    "courseName": "公共关系学",
    "categoryCode": "general_education",
    "requirementType": "选修",
    "courseSubcategory": null,
    "credits": 2.0,
    "totalHours": 32,
    "lectureHours": 32,
    "experimentHours": 0,
    "extraHours": 0,
    "plannedTerm": 3,
    "creditCountTo": null,
    "prerequisiteCourseCode": null,
    "note": null
  }
  ```
- response：`{ ok, data: Course }`，含后端生成的 `courseCode = "CUSTOM-<ulid>"`、`studyStatus = "未修读"`。
- errors：`VALIDATION_FAILED`、`PRECONDITION_FAILED`（学时和不一致、经法管融通缺归属、非经法管融通却带归属）、`CONFLICT`（极小概率 id 冲突）。
- 事务：否。
- service：`CourseService.createCustom(dto)`。
- repository：`CustomCourseRepository.insert(row)`。
- 类型：CRUD-C。
- 后端独占校验：
  - `lectureHours + experimentHours + extraHours == totalHours`
  - `categoryCode` 与 `categoryName` 由后端映射，不接受前端 `categoryName`
  - `requirementType='经法管融通'` ⇔ `creditCountTo != null`（双向）
  - 自动生成 `courseCode`，不接受前端传入

#### 8. `PATCH /api/courses/:code`

- 用途：编辑字段。不改 `studyStatus / plannedTerm / actualTerm / score / creditCountTo`（它们走业务动作）。
- 前端场景：CourseHoverCard 快速编辑、CourseEditFields 完整编辑。
- request：以下任意子集
  ```json
  {
    "courseName": "string",
    "credits": 2.0,
    "totalHours": 32, "lectureHours": 32, "experimentHours": 0, "extraHours": 0,
    "categoryCode": "general_education",
    "requirementType": "选修",
    "courseSubcategory": "string|null",
    "prerequisiteCourseCode": "string|null",
    "preferenceLevel": 3,
    "note": "string|null"
  }
  ```
- response：`{ ok, data: Course }`。
- errors：`NOT_FOUND`、`VALIDATION_FAILED`、`IMMUTABLE_FIELD`（program 试图改 `courseCode / categoryCode`）、`PRECONDITION_FAILED`（改 `requirementType` 进/出经法管融通时未一起处理 `creditCountTo`）。
- 事务：否（单行 UPDATE）。当 `requirementType` 切换离开经法管融通需要同时清空 `creditCountTo`：仍是单行 UPDATE，写在一条 SQL 里即可。
- service：`CourseService.updateFields(code, patch)`。
- repository：`ProgramCourseRepository.update` / `CustomCourseRepository.update`。
- 类型：CRUD-U。
- 后端独占校验：
  - program 课程的不可变字段集
  - `requirementType` 进/出经法管融通要求请求同时携带 `creditCountTo`（或先调 `/credit-assignment`）
  - `prerequisiteCourseCode` 必须指向已存在、未永久删除的 program 课程
  - 学时和一致性

#### 9. `GET /api/courses/:code/openings`

- 用途：查询该课程号在三张 raw 表中的所有开设记录。
- 前端场景：CourseHoverCard "查看历年开课"、Trail 页课程详情。
- request：无。
- response：
  ```json
  {
    "ok": true,
    "data": {
      "courseCode": "010100001",
      "openings": {
        "sections": [
          { "batchId": 4, "academicYear": "2024-2025", "semester": "fall",
            "sectionCode": "01", "teacher": "...", "classTime": "...",
            "credits": 3.0, "campus": "...", "department": "..." }
        ],
        "addedCourses": [
          { "batchId": 5, "academicYear": "2024-2025", "semester": "spring",
            "department": "...", "module2024": "...", "credits": 3.0 }
        ],
        "catalogPreviews": [
          { "academicYear": "2024-2025", "semester": "fall",
            "module2024": "...", "courseCategory": "...", "credits": 3.0 }
        ]
      }
    }
  }
  ```
- errors：`NOT_FOUND`（仅当 `code` 在 plan 表里也不存在时；raw 三表都空属于合法空结果）。
- 事务：否（三个独立 SELECT）。
- service：`RawCatalogService.findOpeningsByCode(code)`。
- repository：`RawSectionRepository.findByCode`、`RawAddedCourseRepository.findByCode`、`RawCatalogPreviewRepository.findByCode`。
- 类型：CRUD-R 聚合。
- 后端独占校验：合并去重 + 按 (academicYear, semester) 排序由后端完成。

---

### 6.4 课程业务动作

#### 10. `POST /api/courses/:code/plan`

- 用途：把课加入个人计划（"待安排" → "计划修读"），或在学期之间移动。
- 前端场景：Timeline 拖拽（`Timeline.tsx:262/277/296` 当前用三种不同 endpoint，新设计统一到这里）。
- request：`{ "term": 3 | null }`。`term=null` 表示放回"待安排"抽屉但仍是"计划修读"状态。
- response：`{ ok, data: Course }`。
- errors：
  - `NOT_FOUND`：课程不存在。
  - `VALIDATION_FAILED`：`term` 不在 1..8 ∪ {null}。
  - `CONFLICT`：当前 `studyStatus ∈ {已修读, 正在修读, 未通过}`，不应该由 `/plan` 改 term，应当走 `/study-record`。
  - `PRECONDITION_FAILED`：课程在垃圾篓内。
- 事务：否（单行 UPDATE）。
- service：`PlanService.setPlan(code, term)`。
- repository：分流 program/custom。program 写 `planned_term`；custom 写 `term_number`。
- 类型：业务动作。
- 后端独占校验：
  - 状态机：仅当 `studyStatus ∈ {未修读, 计划修读}` 允许此动作；进入此动作后 `studyStatus` 自动设为 `计划修读`（除非 `term=null` 且原状态为"未修读"，保持"未修读"）。
  - 垃圾篓内课程不可操作。

#### 11. `DELETE /api/courses/:code/plan`

- 用途：完全移出计划（`plannedTerm=null` + `studyStatus='未修读'`）。
- 前端场景：Timeline 把课拖出时间轴、卡片"移出计划"。
- request：无。
- response：`{ ok, data: Course }`。
- errors：`NOT_FOUND`、`CONFLICT`（课程已修读/在修；要清除应先调 `/study-record DELETE`）。
- 事务：否。
- service：`PlanService.removeFromPlan(code)`。
- repository：分流。
- 类型：业务动作。
- 后端独占校验：状态机：仅 `未修读 / 计划修读` 允许。

#### 12. `POST /api/courses/:code/study-record`

- 用途：录入或更新修读结果（成绩、实际学期、状态）。这是当前 `/semester-courses` 体系的统一替代。
- 前端场景：
  - Trail 页打分（`Trail.tsx:637/640/649/657/660`）。
  - "标记为已修读"按钮。
  - 把"正在修读"切到"已修读"。
- request：
  ```json
  {
    "studyStatus": "已修读",   // 必填
    "term": 4,                  // program 写 actualTerm；custom 写 plannedTerm
    "score": 87.5               // 可选；状态为"已修读/未通过"时建议填
  }
  ```
- response：`{ ok, data: Course }`。
- errors：
  - `VALIDATION_FAILED`：`studyStatus` 非法、`term` 越界、`score` 非 0..100。
  - `PRECONDITION_FAILED`：
    - `studyStatus='已修读' / '未通过'` 但 `term` 缺失。
    - `studyStatus='计划修读' / '正在修读'` 但 `score` 非 null。
    - 课程在垃圾篓内。
    - （可选规则）`prerequisiteCourseCode` 未达成时不允许标 `已修读`。
  - `NOT_FOUND`：课程不存在。
- 事务：否（单行 UPDATE，多字段一起写）。
- service：`StudyRecordService.upsert(code, dto)`。
- repository：分流。
- 类型：业务动作。
- 后端独占校验：状态机全套（见 §3.2）。

#### 13. `DELETE /api/courses/:code/study-record`

- 用途：清空修读记录，回到 `未修读` 或 `计划修读`。
- 前端场景："撤销修读"。
- request：可选 `?fallback=plan|none`，默认 `none`。
  - `none`：清回 `未修读`，并清空 `plannedTerm / actualTerm / score`。
  - `plan`：保留 `plannedTerm`，状态置为 `计划修读`，仅清空 `actualTerm / score`。
- response：`{ ok, data: Course }`。
- errors：`NOT_FOUND`、`CONFLICT`（当前不在 `已修读 / 正在修读 / 未通过`）。
- 事务：否。
- service：`StudyRecordService.clear(code, fallback)`。
- repository：分流。
- 类型：业务动作。
- 后端独占校验：状态机；前端不应自由 PATCH score=null 跨过状态机。

#### 14. `POST /api/courses/:code/credit-assignment`

- 用途：设置经法管融通课程的学分计入方向。
- 前端场景：Trail 页 `InterdisciplinaryFlow` 切换归属（`Trail.tsx:192-196` 当前用三套接口，新设计统一）。
- request：`{ "creditCountTo": "通识教育-选修" }`。
- response：`{ ok, data: Course }`。
- errors：
  - `PRECONDITION_FAILED`：课程 `requirementType != '经法管融通'`，不允许设置。
  - `VALIDATION_FAILED`：`creditCountTo` 不在白名单。
  - `NOT_FOUND`。
- 事务：否。
- service：`CreditAssignmentService.set(code, target)`。
- repository：分流。
- 类型：业务动作（业务规则强）。
- 后端独占校验：
  - 仅 `requirementType='经法管融通'` 的课程可调用。
  - 写 program 表也要遵守 DB CHECK。
  - 单条调用本身**不**拒绝因 6 学分上限超额的设置（用户可能要先把另一门改成其他归属再来调整这一门）；超额体现在 `/progress` 的 `overflow.interdisciplinary` 中，由前端给出提示。<br/>**例外**：当批量动作 `POST /api/courses:batch-credit-assignment`（见 §6.8）一次提交多门课时，service 必须计算合计学分，超额则整批 `PRECONDITION_FAILED`。

#### 15. `DELETE /api/courses/:code/credit-assignment`

- 用途：清除归属。仅当课程**不是**经法管融通时合法（即 `requirementType` 刚刚被改回普通性质）。
- 前端场景：从 `PATCH /api/courses/:code` 中切换 `requirementType` 离开经法管融通后由 service 内部触发；外部 API 也保留以便手工修复。
- request：无。
- response：`{ ok, data: Course }`。
- errors：`PRECONDITION_FAILED`（仍是经法管融通，不能清空）、`NOT_FOUND`。
- 事务：否。
- service：`CreditAssignmentService.clear(code)`。
- repository：分流。
- 类型：业务动作。
- 后端独占校验：DB CHECK 兜底（经法管融通必须有 `creditCountTo`），但应在 service 层先报 422。

#### 16. `POST /api/courses/:code/trash`

- 用途：把课移入垃圾篓（软删除）。
- 前端场景：Timeline 卡片右键删除（`Timeline.tsx:358 trashOfficial`）。
- request：`{ "note": "string|null" }`。
- response：`{ ok, data: Course }`（`isDeleted=true, deletedAt=now`）。
- errors：`NOT_FOUND`、`CONFLICT`（已在垃圾篓）。
- 事务：否。
- service：`TrashService.softDelete(code, note)`。
- repository：分流。
- 类型：业务动作。
- 后端独占校验：custom 也是软删而非物理删；前端不能自己决定语义。

---

### 6.5 垃圾篓

#### 17. `GET /api/trash`

- 用途：列出垃圾篓内课程（program + custom 合并）。
- 前端场景：Timeline 右下角"垃圾篓"抽屉、Trail 页垃圾篓视图。
- query：可选 `source=program|custom|all`，默认 `all`；分页。
- response：`{ ok, data: TrashItem[], meta: { total } }`。`TrashItem` 复用 `Course` 形状，仅 `isDeleted=true`。
- errors：无。
- 事务：否。
- service：`TrashService.list(filter)`。
- repository：`ProgramCourseRepository.findInTrash` + `CustomCourseRepository.findInTrash`。
- 类型：CRUD-R 聚合。
- 后端独占校验：`is_permanently_deleted=1` 的 program 课程**不返回**（已对用户永久消失）。

#### 18. `POST /api/trash/:code/restore`

- 用途：从垃圾篓恢复单个课程。
- 前端场景：垃圾篓列表"恢复"按钮（`Timeline.tsx:380`）。
- request：无。
- response：`{ ok, data: Course }`。
- errors：`NOT_FOUND`、`CONFLICT`（不在垃圾篓）。
- 事务：否（单行 UPDATE，可能同时清两个 flag）。
- service：`TrashService.restore(code)`。
- repository：分流。
- 类型：业务动作。
- 后端独占校验：恢复 program 时一并清 `is_permanently_deleted=1`（如果是从 v1 数据中带过来的"永久删除"，恢复应当成功）。

#### 19. `DELETE /api/trash/:code`

- 用途：永久删除。program → `is_permanently_deleted=1`；custom → 物理 DELETE。
- 前端场景：垃圾篓列表"永久删除"按钮（`Timeline.tsx:392`）。
- request：无。
- response：`{ ok, data: { courseCode, source, status: "permanently_deleted" } }`。
- errors：`NOT_FOUND`、`PRECONDITION_FAILED`（不在垃圾篓）。
- 事务：否。
- service：`TrashService.purge(code)`。
- repository：分流。program: update；custom: delete。
- 类型：业务动作。
- 后端独占校验：program **禁止物理删**，否则丢失培养方案备份；custom 必须物理删，否则垃圾篓"清空"语义错乱。

#### 20. `POST /api/trash:restore-all`

- 用途：一键恢复全部垃圾篓课程。
- 前端场景：垃圾篓"全部恢复"（`Timeline.tsx:518`）。
- request：可选 `{ "scope": "program|custom|all" }`，默认 `all`。
- response：`{ ok, data: { restored: 7 } }`。
- errors：`INTERNAL_ERROR`。
- 事务：**是**。涉及两表多行 UPDATE，要么全成功要么全回滚。
- service：`TrashService.restoreAll(scope)`，内部 `unitOfWork(tx => ...)`。
- repository：`ProgramCourseRepository.bulkRestore(tx)`、`CustomCourseRepository.bulkRestore(tx)`。
- 类型：批量业务动作。
- 后端独占校验：同 §6.5 #18。

#### 21. `DELETE /api/trash:empty`

- 用途：一键清空垃圾篓。
- 前端场景：垃圾篓"清空"按钮（`Timeline.tsx:524`）。
- request：可选 `{ "scope": "program|custom|all" }`。
- response：`{ ok, data: { purged: 7 } }`。
- errors：`INTERNAL_ERROR`。
- 事务：**是**。program UPDATE + custom DELETE 在同一事务。
- service：`TrashService.empty(scope)`。
- repository：`ProgramCourseRepository.bulkPurge(tx)`、`CustomCourseRepository.bulkDelete(tx)`。
- 类型：批量业务动作。
- 后端独占校验：同 §6.5 #19，禁止物理删 program。

---

### 6.6 学分进度

#### 22. `GET /api/progress`

- 用途：返回按类别×性质聚合的学分进度。当前前端在 `src/lib/progress.ts` 客户端计算，应当迁回后端。
- 前端场景：Trail 页头部学分总览、Timeline 页右侧迷你进度。
- query：可选 `groupBy=category|category-requirement`，默认 `category-requirement`。
- response：
  ```json
  {
    "ok": true,
    "data": {
      "byCategory": [
        {
          "categoryCode": "general_education",
          "requirementType": "required",
          "required": 32.0,
          "earned": 12.5,
          "inProgress": 4.0,
          "planned": 8.0,
          "pending": 7.5,
          "courses": [
            { "courseCode": "010100001", "courseName": "...", "credits": 3.0, "studyStatus": "已修读" }
          ]
        }
      ],
      "totals": {
        "required": 169.0, "earned": 20.0, "inProgress": 4.0,
        "planned": 8.0, "pending": 137.0
      }
    }
  }
  ```
- errors：`INTERNAL_ERROR`。
- 事务：否（只读）。
- service：`ProgressService.compute()`。
- repository：`ProgramCourseRepository.findActive`、`CustomCourseRepository.findActive`、`RequirementRepository.findAll`。
- 类型：聚合。
- 后端独占校验：
  - 经法管融通归属拆分（`creditCountTo` 决定计入哪个桶）。
  - 排除 `isDeleted=1` 和 `isPermanentlyDeleted=1`。
  - `requirement_type` 三态（required/elective/interdisciplinary）与 `requirementType` 四态（必修/选修/跨专业/经法管融通）的映射：跨专业 → elective 桶；经法管融通按 `creditCountTo` 入对应桶。

#### 23. `GET /api/progress/timeline`

- 用途：返回 1..8 学期每个学期的学分、课程数（区分已修/在修/计划）。
- 前端场景：Timeline 页顶部学期柱状图。
- response：
  ```json
  {
    "ok": true,
    "data": {
      "terms": [
        { "term": 1, "credits": { "earned": 18, "inProgress": 0, "planned": 0 }, "courseCount": 7 }
      ]
    }
  }
  ```
- errors：无。
- 事务：否。
- service：`ProgressService.timeline()`。
- repository：同上。
- 类型：聚合。
- 后端独占校验：custom 的 `term_number` 与 program 的 `actual_term/planned_term` 统一映射，前端不应自己做。

---

### 6.7 学校原始数据

> 全部 raw 接口只读，且不返回任何 plan_* 字段。

#### 24. `GET /api/raw/batches`

- 用途：列出导入批次。
- 前端场景：raw 数据浏览面板（当前未在主 UI 中露出，但保留供未来扩展）。
- query：`?academicYear=&semester=&phase=&limit=&offset=`。
- response：`RawImportBatch[]`。
- errors：无。
- 事务：否。
- service：`RawCatalogService.listBatches(filter)`。
- repository：`RawBatchRepository.find`。
- 类型：CRUD-R。

#### 25. `GET /api/raw/sections`

- 用途：查询学期完整教学班。
- query：`?batchId=&courseCode=&keyword=&teacher=&campus=&limit=&offset=`。
- response：`RawSection[]`。
- errors：`VALIDATION_FAILED`（任何过滤参数都没传时返回 400，避免误把 9864 行全 dump）。
- 事务：否。
- service：`RawCatalogService.listSections(filter)`。
- repository：`RawSectionRepository.find`。
- 类型：CRUD-R。
- 后端独占校验：强制至少一个过滤参数。

#### 26. `GET /api/raw/added-courses`

- 用途：查询补退选新增课。
- query：`?batchId=&courseCode=&keyword=&limit=&offset=`。
- response：`RawAddedCourse[]`。
- errors：无（行数较少）。
- service：`RawCatalogService.listAddedCourses(filter)`。
- repository：`RawAddedCourseRepository.find`。
- 类型：CRUD-R。

#### 27. `GET /api/raw/catalog-previews`

- 用途：查询课程一览/模块映射表。
- query：`?academicYear=&semester=&courseCode=&module=&limit=&offset=`。
- response：`RawCatalogPreview[]`。
- errors：`VALIDATION_FAILED`（同 §6.7 #25 的限流逻辑）。
- service：`RawCatalogService.listCatalogPreviews(filter)`。
- repository：`RawCatalogPreviewRepository.find`。
- 类型：CRUD-R。

---

### 6.8 批量动作

#### 公共约定

| 项 | 规定 |
|---|---|
| 事务 | **必须** `unitOfWork(tx => ...)`，all-or-nothing |
| 上限 | `items.length <= 200`；超出 `VALIDATION_FAILED` |
| 重复 | 同一 `courseCode` 出现多次 → `VALIDATION_FAILED`（避免后写覆盖先写） |
| 部分失败 | **不允许**。任何一条不通过校验或状态机，整批回滚，返回每条的错误 |
| 响应 | 成功：`{ ok, data: { affected: <int>, results: Course[] } }` |
|  | 失败：`{ ok: false, error: { code, message, details: { items: [{ index, courseCode, code, message }] } } }` |

#### 28. `POST /api/courses:batch-plan`

- 用途：把多门课一次性放到不同学期（或全部移出计划）。
- 前端场景：Timeline 多选 → 拖拽到某学期；或导入"我的计划"模板。
- request：
  ```json
  {
    "items": [
      { "courseCode": "010100001", "term": 3 },
      { "courseCode": "CUSTOM-...", "term": null }
    ]
  }
  ```
- response：见公共约定。
- errors：`VALIDATION_FAILED`、`PRECONDITION_FAILED`（任何一条不满足 §6.4 #10 校验）。
- service：`PlanService.batchSetPlan(tx, items)`，内部按单条逻辑逐项调用。
- repository：分流。

#### 29. `POST /api/courses:batch-study-record`

- 用途：一次性录入多门已修课程（如学期末成绩集中录入）。
- 前端场景：成绩单导入、Trail 页"批量打分"。
- request：
  ```json
  {
    "items": [
      { "courseCode": "...", "studyStatus": "已修读", "term": 4, "score": 87.5 }
    ]
  }
  ```
- response / errors：同公共约定 + §6.4 #12。
- service：`StudyRecordService.batchUpsert(tx, items)`。

#### 30. `POST /api/courses:batch-credit-assignment`

- 用途：一次性调整多门经法管融通课程的归属。
- 前端场景：Trail 页"经法管融通归属"批量切换。
- request：
  ```json
  {
    "items": [
      { "courseCode": "...", "creditCountTo": "通识教育-选修" },
      { "courseCode": "...", "creditCountTo": "大类平台-选修" }
    ]
  }
  ```
- response / errors：同公共约定 + §6.4 #14。
- service：`CreditAssignmentService.batchSet(tx, items)`。
- **特殊校验（仅在批量中执行）**：服务端必须把所有 `requirementType='经法管融通'` 的活跃课程（含本次提交后的状态）按 §7.3 规则模拟一次 6 学分上限。若 `counted > 6` 即整批 `PRECONDITION_FAILED`，`details` 中标出溢出课程。原因：单条接口允许 overflow（依赖前端两步操作），但批量提交一次到位，应该在提交时就保证合法。

#### 31. `POST /api/courses:batch-trash`

- 用途：一次性移入垃圾篓。
- 前端场景：多选删除。
- request：`{ "codes": ["..."], "note": "string|null" }`
- response / errors：同公共约定 + §6.4 #16。
- service：`TrashService.batchSoftDelete(tx, codes, note)`。

#### 32. `POST /api/trash:batch-restore`

- 用途：选择性恢复（区别于 `/trash:restore-all` 的全量恢复）。
- 前端场景：垃圾篓多选恢复。
- request：`{ "codes": ["..."] }`
- response / errors：同公共约定 + §6.5 #18。
- service：`TrashService.batchRestore(tx, codes)`。

#### 33. `DELETE /api/trash:batch-purge`

- 用途：选择性永久删除。
- 前端场景：垃圾篓多选永久删除。
- request：`{ "codes": ["..."] }`
- response / errors：同公共约定 + §6.5 #19。
- service：`TrashService.batchPurge(tx, codes)`。
- 后端独占校验：program 仍是软标记 `is_permanently_deleted=1`，custom 仍是物理 DELETE。

---

## 7. 跨切面规则

### 7.1 状态机完整决策表

| 当前 → 目标 | 允许调用接口 | term 必填 | score 允许 |
|---|---|---|---|
| 未修读 → 计划修读 | `POST /plan` | 是 | 否 |
| 计划修读 → 未修读 | `DELETE /plan` | — | — |
| 计划修读 → 计划修读（换学期） | `POST /plan` | 是 | 否 |
| 计划修读 → 正在修读 | `POST /study-record` | 是 | 否 |
| 正在修读 → 已修读 | `POST /study-record` | 是 | 可 |
| 正在修读 → 未通过 | `POST /study-record` | 是 | 可 |
| 已修读 → 未通过 / 反向 | `POST /study-record` | 是 | 可 |
| 任意 → 未修读 | `DELETE /study-record?fallback=none` | — | — |
| 任意 → 垃圾篓 | `POST /trash` | — | — |
| 垃圾篓 → 上次状态 | `POST /trash/:code/restore` | 保留原值 | 保留原值 |

直接 `PATCH /api/courses/:code` **不允许**修改 `studyStatus / plannedTerm / actualTerm / score / creditCountTo`，强制走业务动作。

### 7.2 事务边界

| 场景 | 事务 | 备注 |
|---|---|---|
| 单行 UPDATE（绝大多数业务动作） | 否（SQLite 隐式事务足够） | |
| `POST /api/trash:restore-all` | 是 | program UPDATE + custom UPDATE 跨表 |
| `DELETE /api/trash:empty` | 是 | program UPDATE + custom DELETE 跨表 |
| `PATCH /api/courses/:code` 同时切换 `requirementType` 与 `creditCountTo` | 否 | 同一行多字段，单条 SQL |
| 未来扩展（如批量 import） | 是 | 由 service 用 `unitOfWork` 包裹 |

`unitOfWork(fn)` 由 db 层提供，约定 service 内不允许直接调用 `db.exec("BEGIN")`。

### 7.3 经法管融通归属计算（含 6 学分上限）

经法管融通有三个关键事实：

1. 它是**通选课**里的一类，与"跨专业"是独立概念；不要和 `跨专业` 课程混在一起算。
2. 学校允许它在两个归属之间二选一：`通识教育-选修` 或 `大类平台-选修`。
3. **累计有效学分上限 6 学分**；学校同时要求**至少修满 6 学分**（前端在进度条上做提示，后端通过 `pending` 字段自然反映）。

服务端在 `ProgressService.compute` 中执行：

```
for each active course (不含 trash、不含 is_permanently_deleted):
  if requirementType in {必修, 选修, 跨专业}:
    target = (categoryCode, map(requirementType))
    bucket[target] += credits, course归档进 bucket
  elif requirementType == '经法管融通':
    assert creditCountTo != null
    interdisciplinaryCourses.push(course)   # 暂存，待后处理

# 对经法管融通课按 (categoryCode-from-creditCountTo, elective) 分桶，
# 然后整体应用 6 学分封顶
sort interdisciplinaryCourses by (studyStatus 优先级, credits 降序)
remaining = 6
for course in interdisciplinaryCourses:
  if course.credits <= remaining:
    target = parse(creditCountTo)             # 如 "通识教育-选修" → (general_education, elective)
    bucket[target] += credits, 记入对应桶
    remaining -= credits
  else:
    overflow.push(course)                     # 不计入任何桶
overflow.interdisciplinary = {
  cap: 6,
  totalAttempted: Σ all interdisciplinary credits,
  counted: 6 - remaining,
  overflowCredits: totalAttempted - (6 - remaining),
  overflowCourses
}
```

性质映射表（普通课程）：

| `requirementType` | `requirement_type_code` |
|---|---|
| 必修 | required |
| 选修 | elective |
| 跨专业 | interdisciplinary |
| 经法管融通 | 不直接映射，按 `creditCountTo` 拆入对应 (category, elective) 桶 |

状态优先级（用于 6 学分封顶的排序）：`已修读` > `正在修读` > `计划修读` > `未修读`。即：已修课程优先占满 6 学分名额；只有当用户把已修课程改为其他归属时，计划课程才进入名额。这能让 UI 上的 overflow 提示稳定。

### 7.4 软删除策略对比

| 来源 | 移入垃圾篓 | 永久删除 | 列表默认可见 |
|---|---|---|---|
| program | `is_deleted=1` | `is_permanently_deleted=1`（仍保留行） | 否（除非 `inTrash=true`） |
| custom | `is_deleted=1` | 物理 DELETE | 否（除非 `inTrash=true`） |

差异原因：program 课程是培养方案最后备份，**禁止**物理删除；custom 课程是用户自主添加的，永久删除等于"真的不想要了"。

### 7.5 标识符与路由

- 对外 `:code` 形态：
  - program：`010100001` 等学校课程号。
  - custom：`CUSTOM-<ulid26>`。
- 后端按 `code.startsWith("CUSTOM-")` 路由到 custom 仓储，否则查 program。
- DB 层 custom 表保留 `id` 自增列做内部主键，但**不**对外暴露；如果未来要从 v1 迁移已有 `id`，生成确定性 `CUSTOM-LEGACY-<id>` 即可。

---

## 8. Service / Repository 全表

### Services

| Service | 输入 | 责任 |
|---|---|---|
| `MetaService` | — | 静态枚举 |
| `RequirementService` | `RequirementDto` | 毕业要求 CRUD（受限） |
| `CourseService` | `CourseFilter / CreateCustomDto / UpdateFieldsDto` | 课程查询、创建 custom、字段编辑（不含状态切换） |
| `PlanService` | `code, term` | 计划状态机 |
| `StudyRecordService` | `code, dto` | 修读状态机 |
| `CreditAssignmentService` | `code, target` | 经法管融通归属 |
| `TrashService` | `code / scope` | 软删除、恢复、永久删除、批量 |
| `ProgressService` | — | 学分聚合、学期聚合 |
| `RawCatalogService` | filter | raw 三表读 |
| `SystemService` | — | health check |

### Repositories

| Repository | 表 |
|---|---|
| `ProgramCourseRepository` | `plan_program_courses` |
| `CustomCourseRepository` | `plan_custom_courses` |
| `RequirementRepository` | `plan_program_requirements` |
| `RawBatchRepository` | `raw_import_batches` |
| `RawSectionRepository` | `raw_term_course_sections` |
| `RawAddedCourseRepository` | `raw_term_added_courses` |
| `RawCatalogPreviewRepository` | `raw_course_catalog_previews` |
| `SystemRepository` | `sqlite_master` 等元数据 |

依赖矩阵：

| Service \ Repo | Program | Custom | Requirement | Raw* | System |
|---|---|---|---|---|---|
| MetaService | | | | | |
| RequirementService | | | ● | | |
| CourseService | ● | ● | | | |
| PlanService | ● | ● | | | |
| StudyRecordService | ● | ● | | | |
| CreditAssignmentService | ● | ● | | | |
| TrashService | ● | ● | | | |
| ProgressService | ● | ● | ● | | |
| RawCatalogService | | | | ● | |
| SystemService | | | | | ● |

---

## 9. CRUD vs 业务动作

| 类别 | endpoints |
|---|---|
| **CRUD-R** | #1, #2, #3, #5, #6, #9, #17, #22, #23, #24, #25, #26, #27 |
| **CRUD-C** | #7 |
| **CRUD-U** | #4, #8 |
| **业务动作（单条）** | #10, #11, #12, #13, #14, #15, #16, #18, #19 |
| **业务动作（批量，必事务）** | #20, #21, #28, #29, #30, #31, #32, #33 |

判定标准：操作只改一两个独立字段、没有跨字段一致性、没有状态机 ⇒ CRUD；否则 ⇒ 业务动作。

---

## 10. "不能只靠前端判断"主清单

下表是必须在后端 service 层强制的规则。这些规则若仅在前端实现，会因 UI 多入口或直连接口绕过而失守。

| # | 规则 | 失守后果 |
|---|---|---|
| 1 | `requirementType='经法管融通'` ⇔ `creditCountTo` 非空 | 学分进度计算崩溃；DB CHECK 报错 |
| 2 | `lectureHours + experimentHours + extraHours == totalHours` | DB CHECK 报错；UI 显示不一致 |
| 3 | `studyStatus` 与 `plannedTerm / actualTerm / score` 跨字段一致 | 学分进度归类错误；垃圾篓行为不可预测 |
| 4 | `studyStatus` 状态机合法迁移（§7.1） | 出现"未修读但有成绩"等异常态 |
| 5 | program 课程的 `courseCode / categoryCode` 不可变 | 培养方案完整性被破坏 |
| 6 | program 永久删除只能软标记 `is_permanently_deleted=1` | 培养方案备份丢失 |
| 7 | custom 永久删除必须物理 DELETE | 垃圾篓"清空"无法把 custom 项清掉 |
| 8 | `prerequisiteCourseCode` 必须指向有效 program 课程 | 引用悬空；UI hover 卡崩溃 |
| 9 | 垃圾篓内课程：不计入学分进度、不可加入计划、不可录入成绩 | 学分被多算；状态机错乱 |
| 10 | 经法管融通归属拆分由后端做 | 多个页面客户端各自拆分，口径不一致 |
| 11 | 经法管融通累计有效学分封顶 6 学分（含批量提交时的上限校验） | 学分多算，超额课程被错误地纳入毕业要求 |
| 12 | `raw_*` 表禁止经由 API 写 | 学校原始事实污染 |
| 13 | `POST /trash:restore-all` 与 `DELETE /trash:empty` 必须事务 | 半成功状态，UI 重新加载后不可预测 |
| 14 | `courseCode` 生成（`CUSTOM-<ulid>`）由后端做 | 客户端碰撞、注入风险 |
| 15 | 路由 `:code` 前缀分流到 program/custom 由后端做 | 前端写两套分支（当前问题） |
| 16 | `GET /api/raw/sections` 强制至少一个过滤参数 | 误把万级数据吐给客户端 |
| 17 | 所有批量动作必须事务且 all-or-nothing | 半成功状态，前端无法稳定回放 |

---

## 11. 迁移路径（v1 → v2 API）

按可观察行为不变的前提下，分四步迁移：

1. **新接口并行上线**。新增 27 个 endpoint，旧 35 个保留。新接口在 service 层共享 `CourseService` 等，旧接口收敛到调用新 service（去掉旧 controller 内的业务逻辑）。
2. **前端切换调用点**。
   - `coursesWithCategory + semesterCourses + personalPlan` → `GET /api/courses`。
   - `upsertOfficial / patchOfficial / deleteOfficial / upsertPersonalOfficial / resetPersonalOfficial / patchPersonalPlan` → `POST /api/courses/:code/study-record` 与 `POST /api/courses/:code/plan`。
   - `trashOfficial` → `POST /api/courses/:code/trash`。
   - `restoreTrashItem / permanentlyDeleteTrashItem` → `/api/trash/:code/restore` 与 `DELETE /api/trash/:code`。
   - `restoreAllTrash / emptyTrash` → `/api/trash:restore-all`、`/api/trash:empty`。
   - `updateProgramCourse / updateCustomCourse` → `PATCH /api/courses/:code`。
   - `creditAssignments / setCreditAssignment / resetCreditAssignment` → `POST /api/courses/:code/credit-assignment` 与 `DELETE`。
3. **冻结旧接口**。在 controller 入口加 `Deprecation` header；新功能只用新接口。
4. **移除旧接口**。一个 minor 版本之后删除旧 controller 与 `src/lib/api.ts` 中对应方法。

迁移期间数据库无需变更，所有路径都在同一份 `plan_*` 数据上读写。

---

## 12. 开放问题

1. **是否引入 `If-Match` / `updated_at` 乐观锁**？当前多入口写同一字段，前端不持有最新版本号时可能覆盖。建议在 v2.1 加入。
2. **进度计算是否需要持久化缓存**？规模 < 200 课程，目前每次现算即可；如果未来加多学年视图再考虑。
3. **经法管融通"必须修满 6 学分"如何在 UI 提示**？后端口径已经体现：当 `bucket[(major_platform/general_education, elective)].counted` 中经法管融通部分不足 6 时，`pending` 字段自然变大；前端可基于 `overflow.interdisciplinary.counted < 6` 做更显眼的提示。这是 UI 决策，不影响 API 契约。

**已澄清并落入设计的项目**（保留在此作变更记录）：

- 跨专业与经法管融通是**独立概念**（§3.3、§7.3），不再尝试把它们对齐到同一抽象。
- 经法管融通累计学分**封顶 6**，超额部分通过 `/progress` 的 `overflow.interdisciplinary` 暴露（§3.5、§7.3、§10 #11）。
- program 与 custom 课程在"学期"语义上的差异：program 有 `official_term`（学校建议的开课学期）与 `actual_term`（用户实际修读学期）两层；custom 没有"官方建议"概念，`plannedTerm`（即数据库 `term_number`）就是它的实际学期。**不**需要给 custom 表加 `actual_term` 列。

---

附：本设计实现后，`docs/08-api-reference.md` 需要重写为本文 §5/§6 的摘要；`app/src/lib/api.ts` 需重写；`app/server/index.ts` 需拆为 `app/server/modules/{courses,trash,progress,requirements,raw,meta}/{*.controller,*.service,*.repository}.ts`。
