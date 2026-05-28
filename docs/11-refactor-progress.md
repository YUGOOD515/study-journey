# 11 · 重构进度表

> 本文件跟踪 v2 API 重构与前端迁移的实时进度。
> 设计契约见 [10-api-redesign.md](./10-api-redesign.md)。
> 起始日期：2026-05-26；最后更新：2026-05-27。

---

## 总览

| 阶段 | 状态 | 说明 |
|---|---|---|
| ① API 层设计文档 | ✅ 完成 | `docs/10-api-redesign.md`，27 单条 + 6 批量 endpoint，含 17 条仅后端校验规则 |
| ② 后端三层骨架 + 公共库 | ✅ 完成 | `app/server/lib/`：errors / response / unit-of-work / validate / custom-code |
| ③ 业务模块实现 | ✅ 完成 | meta · requirements · system · courses · plan · study-record · credit-assignment · trash · progress · raw · batch |
| ④ 经法管融通 6 学分上限 | ✅ 完成 | `progress.service.compute` + `batch.module.simulatePostAssignCounted` |
| ⑤ 挂载顺序调整（apiRouter 作 fallback） | ✅ 完成 | 老路由先匹配，新模块只接管未冲突路径 |
| ⑥ 前端 `src/lib/api.ts` 切到新 endpoint | ✅ 完成 | 内部适配回 snake_case，不动 types/组件；自定义课用 code↔synthetic id 缓存兼容旧调用 |
| ⑦ 删除 `server/index.ts` 老 SQL 路由 | ✅ 完成 | `index.ts` 已改为薄启动文件，只挂载 `apiRouter` + `errorMiddleware` |
| ⑧ 浏览器端到端烟测 | ⏳ 待启动 | Timeline + Trail 双页面全交互 |
| ⑨ 自动化测试（vitest） | ⏳ 选做 | 状态机 / 6 学分上限 / 批量回滚 |

---

## 后端新模块清单

```
app/server/
├── lib/                      ✅
│   ├── errors.ts             # BusinessError + 6 个 ErrorCode + fail.* 工厂
│   ├── response.ts           # ok / created / handle / errorMiddleware
│   ├── unit-of-work.ts       # 嵌套深度计数事务
│   ├── validate.ts           # expectString/Number/Enum/Boolean/Array
│   └── custom-code.ts        # CUSTOM-YYYYMMDD-XXXXXX-XXX 生成
├── router.ts                 ✅ 聚合 verb 路由 + sub-routers
├── index.ts                  🟡 包含老路由（待删）
└── modules/
    ├── system/               ✅ /api/health
    ├── meta/                 ✅ /api/meta/categories
    ├── requirements/         ✅ /api/requirements*
    ├── courses/              ✅ 仓储 ×2 + service + state-machine + batch
    ├── plan/                 ✅ /:code/plan POST/DELETE
    ├── study-record/         ✅ /:code/study-record POST/DELETE
    ├── credit-assignment/    ✅ /:code/credit-assignment POST/DELETE
    ├── trash/                ✅ list + 单条 + verb 批量
    ├── progress/             ✅ /progress + /progress/timeline
    └── raw/                  ✅ 4 只读 + /courses/:code/openings
```

---

## 新 endpoint vs 老路由路径冲突表

| 路径 | 当前服务方 | 备注 |
|---|---|---|
| `GET /api/trash` | 老（数组） | 新返回信封；老依赖未迁移前由老服务 |
| `GET /api/courses` | 老 | 同上 |
| `GET /api/courses/:code` | 老 | 同上 |
| `GET /api/raw/{batches,sections,added-courses}` | 老 | 同上 |
| `GET /api/categories`, `/courses-with-category`, `/program-requirements` | 老（独占） | 老路径未在新 router 注册 |
| `POST/PATCH/DELETE /api/semester-courses/*` | 老（独占） | 老路径独有 |
| `POST/PATCH/DELETE /api/personal-plan/*` | 老（独占） | 同上 |
| `GET/POST/DELETE /api/credit-assignments/*` | 老（独占） | 同上 |
| `/api/trash/{program,custom,empty,restore-all}/*` | 老（独占） | 老 path 风格 |
| `GET /api/progress`, `/api/progress/timeline` | **新** | 老未注册 |
| `GET /api/meta/categories`, `/api/requirements` | **新** | 老用 `/api/categories`、`/api/program-requirements` |
| `GET /api/raw/catalog-previews` | **新** | 老未注册 |
| `GET /api/courses/:code/openings` | **新** | 老用 `/api/raw/course-openings/:code` |
| `POST /api/courses/:code/{plan,study-record,credit-assignment}` | **新** | 老未注册 |
| `POST /api/courses:batch-*` (4 个) | **新** | 老未注册 |
| `POST /api/trash:{empty,restore-all,batch-restore,batch-purge}` | **新** | 老用 path 风格 |
| `POST /api/courses` (创建自定义) | **新** | 老用 `/api/semester-courses/manual` 等三入口 |
| `GET /api/courses?…` (list with filter) | **新** | 老用 `/api/courses-with-category` |
| `PATCH /api/courses/:code` | **新** | 老用 `/api/plan-courses/{program,custom}/:code` |
| `DELETE /api/courses/:code` (软删) | **新** | 老用 `/api/personal-plan/official/:code/trash` |

---

## 前端 api.ts → 新 endpoint 映射（迁移计划）

| api.ts 方法 | 旧路径 | 新路径 | 适配点 |
|---|---|---|---|
| `coursesWithCategory()` | GET `/courses-with-category` | GET `/courses` | 剥信封；camelCase → snake_case |
| `programRequirements()` | GET `/program-requirements` | GET `/requirements` | 同上；rename `requirementTypeCode`→`requirement_type` |
| `semesterCourses()` | GET `/semester-courses` | GET `/courses?studyStatus=in/done` 派生 | 客户端过滤 status ∈ {正在修读/已修读/未通过}，按 actualTerm 排序 |
| `personalPlan()` | GET `/personal-plan` | GET `/courses?studyStatus=plan/in/done` 派生 | 客户端取 plannedTerm 非空 或 status=计划修读 |
| `trash()` | GET `/trash` | GET `/trash` | 剥信封；字段重命名 |
| `creditAssignments()` | GET `/credit-assignments` | GET `/courses?requirementType=经法管融通` 派生 | 客户端展开为旧表 |
| `upsertOfficial()` | POST `/semester-courses/official` | POST `/courses/:code/study-record` | term + score → 状态机 |
| `patchOfficial()` | PATCH `/semester-courses/official/:code` | POST `/courses/:code/study-record` | 同上（重发完整状态） |
| `deleteOfficial()` | DELETE `/semester-courses/official/:code` | DELETE `/courses/:code/study-record` | — |
| `createManual()` | POST `/semester-courses/manual` | POST `/courses` + POST `/courses/:code/study-record` | 两步：建课→录修读 |
| `patchManual(id)` | PATCH `/semester-courses/manual/:id` | PATCH `/courses/:code` | 用 courseCode 而非 rowid |
| `deleteManual(id)` | DELETE `/semester-courses/manual/:id` | DELETE `/courses/:code` | — |
| `upsertPersonalOfficial()` | POST `/personal-plan/official` | POST `/courses/:code/plan` | — |
| `resetPersonalOfficial()` | DELETE `/personal-plan/official/:code` | DELETE `/courses/:code/plan` | — |
| `trashOfficial()` | DELETE `/personal-plan/official/:code/trash` | DELETE `/courses/:code` | — |
| `createPersonalManual()` | POST `/personal-plan/manual` | POST `/courses` + POST `/courses/:code/plan` | 两步 |
| `patchPersonalPlan(id)` | PATCH `/personal-plan/:id` | PATCH `/courses/:code` | 用 code |
| `deletePersonalPlan(id)` | DELETE `/personal-plan/:id` | DELETE `/courses/:code` | — |
| `restoreTrashItem()` | POST `/trash/{program\|custom}/:id/restore` | POST `/trash/:code/restore` | — |
| `permanentlyDeleteTrashItem()` | DELETE `/trash/{program\|custom}/:id` | DELETE `/trash/:code` | — |
| `restoreAllTrash()` | POST `/trash/restore-all` | POST `/trash:restore-all` | — |
| `emptyTrash()` | DELETE `/trash/empty` | POST `/trash:empty` | method 改 POST |
| `updateProgramCourse()` | PATCH `/plan-courses/program/:code` | PATCH `/courses/:code` | — |
| `updateCustomCourse(id)` | PATCH `/plan-courses/custom/:id` | PATCH `/courses/:code` | 用 code |
| `setCreditAssignment()` | PUT `/credit-assignments/:code` | POST `/courses/:code/credit-assignment` | method 改 POST |
| `resetCreditAssignment()` | DELETE `/credit-assignments/:code` | DELETE `/courses/:code/credit-assignment` | — |

⚠️ `rowid → courseCode` 是关键变更：前端传入 `id: number` 的方法需要 caller 改传 `courseCode`，或在 api.ts 内部维护 id↔code 映射。计划在 api.ts 内做缓存映射（首次 `coursesWithCategory()` / `personalPlan()` 时建立），避免改动组件签名。

---

## 当前任务

| # | 标题 | 状态 |
|---|---|---|
| 1–10, 12 | 文档 + 后端实现 + 冒烟 | ✅ |
| 11 | 替换 index.ts 为薄路由挂载 | ✅ |
| 13 | 改写 src/lib/api.ts | ✅ |
| 14 | 删除 server/index.ts 老 SQL 路由块 | ✅ |
| 15 | 浏览器烟测 Timeline / Trail | ⏳ |

---

## 风险与已记笔记

- **状态机字段一致性**：录修读 vs 计划，term/score 字段约束容易写错；新版有 `assertStudyRecordValid` 兜底，但前端两步建课（POST `/courses` → 立刻 plan/study-record）必须放在 try/catch + 失败回滚 DELETE，否则会留下"无 plan 也无 record"的孤儿 custom 课。
- **id→code 映射**：旧前端到处用 `id: number`，新后端没有 rowid 概念。映射缓存放 api.ts 内部，但更新接口（PATCH / DELETE）若拿不到 code 会无法翻译。组件 props 不动的前提下，缓存必须在 list 拉取时建立并持久维护。
- **`creditAssignments()` 派生**：老接口返回 `[{course_code, assigned_to}]` 数组。新没有等价 endpoint；只能用 `GET /courses?requirementType=经法管融通` 然后客户端筛 `creditCountTo != null` 派生。
- **`semesterCourses()` 字段缺失**：新 Course DTO 中 manual 的 `id`（rowid）字段不再暴露——Trail 的 flow item key `record:${r.id}` 改用 `record:${courseCode}` 即可。
- **2026-05-27 迁移记录**：`api.ts` 已经切到新 endpoint，但为了避免大面积改组件，仍对外返回旧 snake_case 类型。custom 课程的旧 `id` 由 `api.ts` 内部生成临时数字并映射到 `courseCode`；刷新页面后会重建，不写入数据库。
- **待安排语义**：`POST /api/courses/:code/plan` 传 `term: null` 现在表示“计划修读但待安排”；`DELETE /api/courses/:code/plan` 才表示移出计划。这样保留旧前端抽屉交互语义。
