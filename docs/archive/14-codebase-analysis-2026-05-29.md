# 学旅 Study Journey · 代码质量分析报告

> 分析日期：2026-05-29
> 分析范围：当前工作区（分支 `gpt-branch`，最近提交 `7ad0a1d 加入学期课程界面`）
> 分析对象：数据库（SQLite v2）、后端（Express + node:sqlite）、前端（React + Vite）

---

## 0. 总体结论

这是一个**架构方向正确、后端工程质量较高、但正处于"后端已重构、前端尚未跟进"中间态**的本地单用户应用。

- ✅ 后端经过多轮重构，已经形成清晰的 `module → service → repository → mapper` 分层，错误模型、校验、事务封装都比较规范。
- ✅ 数据库设计扎实：`raw_` 与 `plan_` 分离，约束（CHECK/FK/触发器）丰富，`PRAGMA integrity_check` 与 `foreign_key_check` 均通过。
- ✅ TypeScript 全程 `strict`，`tsc --noEmit` 零报错，`any` 使用仅 11 处。
- ⚠️ **最大风险是"双真相源"**：进度/学分统计在后端（`ProgressService`）和前端（`lib/progress.ts`）各实现一套，且两者口径已经**实质性分歧**，而前端当前只用自己那一套。
- ⚠️ **前后端数据契约不一致**：后端输出 camelCase 新模型，前端仍是 snake_case 旧模型（`is_interdisciplinary`/`assigned_to`），靠 `api.ts` 一个大型适配层硬桥接。
- ⚠️ 工程基建缺失：**没有任何自动化测试**（尽管提交信息写"通过测试"）、**没有 ESLint/Prettier**、存在 3 个未使用的生产依赖、迁移机制有两套且无版本追踪。

### 质量速览

| 维度 | 评分 | 说明 |
|---|---|---|
| 数据库设计 | ★★★★☆ | 约束完整、分离清晰；迁移机制混乱、个别迁移用了危险手法 |
| 后端架构 | ★★★★☆ | 分层规范、错误模型统一；存在逻辑重复与一处统计口径 bug |
| 前端架构 | ★★☆☆☆ | 适配层设计合理，但巨型组件 + 旧模型 + 客户端重算逻辑是主要债务 |
| 前后端一致性 | ★★☆☆☆ | 模型 drift、进度口径分歧（核心风险） |
| 工程基建 | ★★☆☆☆ | TS 严格是亮点；无测试、无 lint、依赖与文档有冗余 |

---

## 1. 数据库分析

### 1.1 现状（实测）

主库 `db/course_planner_v2.sqlite`，共 8 张业务表。实测行数：

| 表 | 行数 | 说明 |
|---|---|---|
| `plan_program_courses` | 75 | 培养方案课程（已修 29 / 计划 16 / 在修 2 / 未修 28；软删 0） |
| `plan_custom_courses` | 18 | 用户自选课（其中 12 门使用真实学校课程号而非 `CUSTOM-`；软删 2） |
| `plan_program_requirements` | 11 | 毕业要求阈值 |
| `raw_import_batches` | 11 | 导入批次（final 4 / beginning_add 3 / actual_schedule 4） |
| `raw_term_course_sections` | 13209 | 学校开课原始数据 |
| `raw_term_added_courses` | 117 | 补退选增开课程 |
| `raw_course_catalog_previews` | 1528 | 课程一览表 |
| `raw_actual_course_meetings` | 89 | 实际排课（新功能，数据量还小） |

> `PRAGMA integrity_check` = ok；`PRAGMA foreign_key_check` 无输出（无违规）。

### 1.2 优点

- **`raw_` / `plan_` 边界清晰**：raw 表不与 plan 表建任何外键，符合"原始事实 vs 用户状态"的分层理念（见 `migrations/v2_001_create_tables.sql`）。
- **约束密度高**：枚举值、学时之和（`total_hours = lecture+experiment+extra`）、经法管融通与 `credit_count_to` 的互斥关系，都用 CHECK 落到了 schema 层而不仅靠应用层。
- **索引覆盖合理**：按 category/term/status/course_code 等查询路径建了索引。
- **`updated_at` 触发器**：用 `WHEN NEW.updated_at = OLD.updated_at` 防止递归，写法正确。

### 1.3 问题

#### 🔴 迁移机制有两套且互相重叠
- 一套是 `migrations/*.sql` + `server/apply-migration.ts`（手动执行、**无 schema_migrations 版本追踪表**，无法知道哪些已应用）。
- 另一套是后端启动时在 `app/server/db.ts` 里跑的幂等 `ALTER/CREATE`（`ensureTrashColumns()`、`ensureRawExtensionTables()`），重复了 `v2_002 / v2_003 / v2_004` 的建表逻辑。
- 后果：schema 真相分散在 SQL 文件和 TS 代码两处，容易 drift。例如 `v2_004` 给 `raw_import_batches.phase` 增加了 `actual_schedule` 枚举值，但 `db.ts` 的启动逻辑并不包含这一步——只靠启动逻辑初始化的库无法导入 actual_schedule 批次。

#### 🟠 `v2_004` 用 `writable_schema` 直接改 CHECK 约束（危险手法）
`migrations/v2_004_raw_actual_course_meetings.sql` 通过 `PRAGMA writable_schema = ON` + `UPDATE sqlite_schema SET sql = REPLACE(...)` 来修改 `phase` 的 CHECK 约束。SQLite 不支持直接修改 CHECK，标准做法是"新建表→拷数据→改名"的 12 步法。直接改写 `sqlite_schema` 字符串非常脆弱（依赖精确的空白匹配，已经要兼容两种空格写法），一旦不匹配可能静默失败或损坏 schema。**建议改为标准的表重建迁移。**

#### 🟡 历史遗留文件未清理
`migrations/001~014_*.sql` 与 `seeds/001~008_*.sql` 属于 v1 旧 schema，已被 `v2_*` 取代，但仍留在仓库里，对新读者是噪音。建议归档到 `migrations/legacy_v1/`。

#### 🟡 毕业要求与统计口径不匹配（详见 §4）
`plan_program_requirements` 里有一条 `major_platform / interdisciplinary / 6 学分`，但后端统计逻辑从不会把任何课程归入 `interdisciplinary` 桶（见 §3.3），导致该要求在后端口径下永远是"待修 6 分"。这是 schema 数据与应用逻辑之间的语义裂缝。

---

## 2. 后端分析

技术栈：Express 4 + **Node 内置 `node:sqlite`（DatabaseSync，同步 API）**。注意 `package.json` 里列的 `node-sqlite3-wasm` **并未被使用**（见 §5）。

### 2.1 优点（值得保持）

- **分层干净**：`router.ts → *.module.ts(路由) → *.service.ts(校验+业务) → *.repository.ts(SQL) → *.mapper.ts(行→DTO)`。职责边界清楚。
- **统一错误模型**：`lib/errors.ts` 的 `BusinessError` + `ErrorCode`，`lib/response.ts` 的 `ok/created/handle/errorMiddleware`，输出统一信封 `{ok, data, meta}` / `{ok:false, error}`。
- **校验集中**：`lib/validate.ts` 的 `expectString/Number/Enum/...` 复用良好，错误信息带字段名。
- **状态机为纯函数**：`modules/courses/state-machine.ts` 不做 IO，便于推理与（未来）测试。
- **参数化查询**：SQL 全部用占位符；`LIMIT/OFFSET` 虽用字符串拼接但都过了 `Number()`，无注入风险。
- **路由顺序意识**：`router.ts` 注释明确了含冒号的批量动作（`/courses:batch-*`）必须在 `:code` 子路由前注册，避免被参数路由抢匹配。

### 2.2 问题

#### 🔴 进度统计存在但前端不用 → 形同死代码（核心风险点）
`modules/progress/progress.service.ts` 实现了完整的学分桶 + 经法管融通 6 学分上限（`INTERDISCIPLINARY_CAP`）+ 溢出报告，路由也挂在 `/api/progress`。但前端 `app/src/lib/api.ts` 中**没有任何对 `/api/progress` 的调用**，前端进度完全由 `lib/progress.ts` 客户端重算。结果：后端这套精心实现的逻辑当前是"未被消费"的，且与前端口径不一致（见 §4）。

#### 🟠 统计口径 bug：`interdisciplinary` 桶永远收不到课
在 `progress.service.ts` `compute()` 中：
- 经法管融通课程经 `parseCountTo()` 只会落到 `general_education|elective` 或 `major_platform|elective`；
- 普通课程经 `REQ_TYPE_BY_NATURE` 只会落到 `required`/`elective`；
- **没有任何路径产出 `requirement_type_code = 'interdisciplinary'`**。

因此 `major_platform|interdisciplinary`（required=6）这一桶 `earned` 恒为 0、`pending` 恒为 6，`totals.required` 永远多算 6 分且不可达成。当前库里有 5 门经法管融通自选课（均 `大类平台-选修`），正好踩中这个口径。建议明确：经法管融通到底是"独立 6 分要求"还是"计入选修桶"，二选一，别让两套规则并存。

#### 🟠 批量动作重复实现了单条动作的写逻辑（DRY 违背）
`modules/courses/batch.module.ts` 里的 `writeTerm/writeStudy/writeAssign` 与 `plan.service.ts`、`study-record.service.ts`、`credit-assignment.service.ts` 中的写逻辑**几乎逐行重复**；`STATUS_PRIORITY` 表在 `progress.service.ts` 和 `batch.module.ts` 各定义一次。一旦状态机规则变更，需要改多处，极易漏改。建议批量动作复用 service 层函数。

#### 🟡 分页 `meta.total` 语义错误
- `course.service.ts` `list()` 对 program 与 custom **各自**套用同一组 `limit/offset`，再 `merged.length` 作为 `total`。当 `source=all` 时返回条数最多可达 `2 × limit`，且 `total` 是"本页条数"而非"总数"。
- `raw.module.ts` 全部用 `total: data.length`，同样是页长而非总量。
- 当前数据量小（默认 limit 1000）暂不暴露，但前端若将来做真分页会拿到错误的 total。`program-course.repository.ts` 已有未被使用的 `countActive()`，建议补齐真实计数。

#### 🟡 `unitOfWork` 嵌套语义的边界情况
`lib/unit-of-work.ts` 用深度计数模拟嵌套事务，没有 SAVEPOINT。若内层抛错被**外层 catch 后吞掉并继续**，最外层仍会 COMMIT 一个内层已部分失败的事务。当前调用方都是"抛错即冒泡到顶"，所以安全；但这是个隐藏假设，建议注释强调或改用 SAVEPOINT。

#### 🟡 其他小问题
- `db.ts` 启动即跑 schema 迁移（见 §1.3），把"连接层"和"迁移层"耦合在一起。
- `trash.service.ts` 末尾 `void isCustomCode;` 是为消除未使用 import 的 hack，直接删掉该 import 即可。
- 时间戳写入风格不统一：多数走 SQL 的 `datetime('now')`，但 `trash.service.ts` 的 `softDelete` 用 JS `new Date().toISOString()` 拼装。

---

## 3. 前端分析

技术栈：React 18 + Vite 5 + Tailwind 3。Vite 已配 `/api` 代理到 `:6174`。

### 3.1 关键观察：前端仍是"旧模型 + 适配层"

后端已统一为 camelCase 的 `Course` DTO（`courseCode`/`requirementType`/`studyStatus`/`creditCountTo`…），但前端 `src/types.ts` 仍是**旧的 snake_case 模型**：

- `CourseNature = "必修" | "选修" | "跨专业"` —— **缺少 `经法管融通`**（后端 `RequirementType` 有 4 个值）。
- 仍在用 `is_interdisciplinary`（0/1）、`assigned_to`（'interdisciplinary'|'elective'）、`SemesterCourse`、`PersonalPlanItem`、整型 `id` 等重构前的概念。

`src/lib/api.ts`（769 行）因此变成一个**大型防腐/适配层**，承担了大量转换：

1. camelCase DTO ↔ snake_case 旧类型互转（`toCourseWithCategory` / `toSemesterCourse` / …）。
2. **为自定义课程合成整型 id**：`nextSyntheticCustomId` 自增 + `stableProgramId()` 对课程号做 `hash*31` —— id 不持久、依赖拉取顺序，且哈希存在碰撞风险（被用作 React key / 反查时可能踩坑）。
3. **把业务规则塞进客户端**：由分数推导 `studyStatus`（`score>=60 → 已修读`，否则 `未通过`）这类策略原本属于后端状态机，现在客户端也实现了一份。
4. 把后端 RESTful 端点重新包装回旧的 `upsert/patch/deleteOfficial/Manual` 动词，并把一次"改字段"拆成"字段 PATCH + 状态 POST"两次请求（`updateCourse` / `applyStatePatch`）。
5. 维护 `courseCacheByCode` 客户端缓存，`getCourse` 命中即返回（本地单用户场景可接受，但有跨操作 stale 风险）。

> 这种 strangler/adapter 迁移策略本身**是合理的过渡手段**，但它是显式技术债：契约没对齐之前，所有页面都隔着一层"翻译"，调试链路变长。

### 3.2 巨型组件 / 客户端重算

| 文件 | 行数 | 评价 |
|---|---|---|
| `pages/Timeline.tsx` | **1914** | 上帝组件：10+ useState、数据拉取、拖拽、双视图、抽屉、垃圾篓全揉在一个文件，应拆分 |
| `pages/TermSchedule.tsx` | 964 | 新增的学期课表，体量已偏大 |
| `lib/api.ts` | 769 | 适配层（见上） |
| `pages/Trail.tsx` | 763 | 进度页，客户端重算进度 |
| `lib/progress.ts` | 371 | **客户端进度引擎（与后端重复）** |

#### 🔴 客户端独立重算进度，且与后端口径分歧
`Trail.tsx` 用 `lib/progress.ts` 的 `computeRequirementRows + bundleByCategory`，自行拉 courses/requirements/semesterCourses/personalPlan/creditAssignments 重算，**完全不调用 `/api/progress`**。两套实现对同一份数据给出不同结果（见 §4）。尤其是 `lib/progress.ts` **没有实现 6 学分上限**，而后端实现了。

#### 🟡 "经法管融通"判定散落三处且不一致
- `lib/api.ts` `isInterdisciplinary()`：`requirementType==='经法管融通' || courseSubcategory.includes('经法管融通') || !!creditCountTo`。
- `lib/progress.ts` `isInterdisciplinary()`：只看 `course_category.includes('经法管融通')`（忽略 api 已算好的 `is_interdisciplinary` 字段）。
- 后端则以 `requirementType==='经法管融通'` 为准。

三套判据在边界数据上会给出不同答案。

### 3.3 优点

- TypeScript `strict`，类型定义完整，`tsc --noEmit` 通过。
- 组件/hook/lib 分层意识在（`hooks/useHoverIntentTriangle`、`lib/offeredTerm`、`components/*` 等粒度合理）。
- `InterdisciplinaryFlow.tsx` 用纯 CSS/div 手绘流向图，没有引入重型图表库（顺带说明 `@visx/sankey`、`d3-sankey` 是**未使用依赖**）。

---

## 4. 跨层一致性问题（最该优先处理）

### 4.1 进度口径分歧（同一份数据，两种答案）

以库中现有的 5 门经法管融通自选课（`credit_count_to = 大类平台-选修`）为例：

| | 后端 `/api/progress`（当前未被前端使用） | 前端 `lib/progress.ts`（实际展示给用户） |
|---|---|---|
| 这 5 门课归入哪个桶 | `major_platform · elective`（选修，10 分桶） | `major_platform · interdisciplinary`（经法管融通，6 分桶） |
| `interdisciplinary` 6 分要求 | 永远 0/6（不可达成） | 由这 5 门课填充 |
| 6 学分上限 | 实现了（超出进 overflow） | **未实现**（直接累加） |

两者**结论相反**。由于前端走自己那套，用户看到的与后端权威计算不一致；后端那套又没人消费。这是整个项目当前最需要拍板的设计裂缝。

### 4.2 数据模型 drift

后端 `Course`（camelCase，含 `经法管融通` 性质 + `creditCountTo`）↔ 前端 `CourseWithCategory/SemesterCourse/...`（snake_case，`is_interdisciplinary`+`assigned_to`，性质枚举缺 `经法管融通`）。靠 `api.ts` 维持，但只要后端再动字段，断点会集中爆在适配层。

---

## 5. 工程基建与横切面

| 项 | 状态 | 说明 |
|---|---|---|
| TypeScript strict | ✅ | 前后端共用 `tsconfig.json`，`strict: true` |
| 类型检查 | ✅ | `npx tsc --noEmit` 退出码 0 |
| `any` 使用 | ✅ | 全仓仅 11 处 |
| 自动化测试 | ❌ | **无任何 test/spec 文件，`package.json` 无 test 脚本**（提交信息"通过测试"应指手测） |
| Lint / Format | ❌ | 无 ESLint / Prettier 配置 |
| 未使用依赖 | ⚠️ | `node-sqlite3-wasm`、`@visx/sankey`、`d3-sankey` 均未在代码中出现 |
| 迁移版本追踪 | ❌ | 无 `schema_migrations` 表，迁移是否已应用全靠人记 |
| 文档时效 | ⚠️ | `README.md` / `docs/06` 的行数（custom 21、sections 9864、catalog 1178）与实测（18 / 13209 / 1528）已不符；`raw_actual_course_meetings` 等新表未进 06 文档 |

---

## 6. 改进建议（按优先级）

### P0 — 先拍板，再动手
1. **统一进度的唯一真相源。** 决定"经法管融通"是独立 6 分要求还是计入选修桶（二选一），同步修正后端 `ProgressService` 的 `interdisciplinary` 桶 bug 和前端 `lib/progress.ts` 的缺失上限，让两端口径一致。
2. **决定前端是否切到后端进度。** 推荐让前端改调 `/api/progress`，删掉 `lib/progress.ts` 这套重复实现，从根上消除分歧。

### P1 — 还债
3. **对齐前后端契约**：把前端类型迁到 camelCase 新模型（补上 `经法管融通` 性质），逐步缩小 `api.ts` 适配层；同时去掉合成 id（`stableProgramId`/`nextSyntheticCustomId`），直接以 `courseCode` 为主键。
4. **拆分 `Timeline.tsx`（1914 行）**：按"数据加载 hook / 视图 / 拖拽 / 抽屉"拆成多个文件与自定义 hook。
5. **后端去重**：让 `batch.module.ts` 复用 plan/study-record/credit-assignment 的写逻辑，集中 `STATUS_PRIORITY`。
6. **修正分页**：用真实 `COUNT(*)` 填 `meta.total`，明确 `source=all` 的 limit 语义。

### P2 — 卫生与基建
7. **引入测试**：状态机（纯函数）和进度计算最值得先覆盖；后端可加端到端的 API smoke test。
8. **加 ESLint + Prettier**，并在 CI/pre-commit 跑 `tsc --noEmit`。
9. **统一迁移机制**：建 `schema_migrations` 版本表，把 `db.ts` 里的启动迁移收敛进正式迁移流程；用标准表重建法替换 `v2_004` 的 `writable_schema` 改写。
10. **清理**：移除未使用依赖（`node-sqlite3-wasm`/`@visx/sankey`/`d3-sankey`），归档 v1 旧迁移与种子，刷新 README/docs 的数据与表清单。

---

## 附录 · 分析依据

- 后端：通读 `app/server/**`（db、router、lib/*、modules/* 全部 service/repository/mapper）。
- 前端：通读 `App.tsx`、`types.ts`、`lib/api.ts`、`lib/progress.ts`，`Timeline/Trail/TermSchedule` 结构与数据流，确认进度计算路径。
- 数据库：对 `db/course_planner_v2.sqlite` 实跑 `integrity_check`、`foreign_key_check`、行数/分布/约束抽样查询；通读 `migrations/v2_*.sql`。
- 工程：`tsc --noEmit`（通过）、测试/lint/依赖/`any` 计数检索、`git log` 复盘重构脉络。
