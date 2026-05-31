# 学旅 Study Journey · 项目近况与未来路线图

> 编制日期：2026-05-31
> 覆盖分支：`gpt-branch`（最近提交 `3b99c4f 时间轴-加入课程搜索界面`）
> 编制方式：通读全部代码、数据库、文档与 git 历史后综合撰写

---

## 一、项目身份

**学旅 Study Journey** 是一个面向本科课程规划的本地 Web 应用，服务于单个法学/经管类本科生。它的定位是：

> 培养方案理解工具 + 个人课程计划工具 + 学校开课数据查询工具

项目**不是**教务系统，不负责真实选课、退课或抢课。它的价值在于把学校培养方案、个人选课计划、修读进度和学校原始开课数据统一到一个可视化界面中。

### 当前数据规模

| 维度 | 数值 |
|---|---|
| 官方培养方案课程 | 75 门（`plan_program_courses`） |
| 用户自选/自定义课程 | 18 门（`plan_custom_courses`） |
| 学分要求条目 | 11 条（`plan_program_requirements`） |
| 学校开课教学班数据 | 13,209 行（`raw_term_course_sections`） |
| 学校补退选数据 | 117 行（`raw_term_added_courses`） |
| 学校课程一览表 | 1,528 行（`raw_course_catalog_previews`） |
| 实际排课记录 | 89 行（`raw_actual_course_meetings`） |
| 导入批次 | 11 批（`raw_import_batches`） |

---

## 二、技术架构总览

### 2.1 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | React | 18.3 |
| 构建工具 | Vite | 5.4 |
| 类型系统 | TypeScript | 5.6 (strict) |
| 样式 | Tailwind CSS | 3.4 |
| 后端框架 | Express | 4.21 |
| 数据库驱动 | Node 内置 `node:sqlite` (DatabaseSync) | — |
| 开发运行 | tsx + concurrently | — |
| 数据导入 | Python 3 + openpyxl/pandas | — |

### 2.2 物理结构

```text
项目根目录/
├─ app/                        # 正式运行应用
│  ├─ server/                  # Express 后端（已模块化重构）
│  │  ├─ index.ts              # 入口（18 行，极简）
│  │  ├─ router.ts             # 路由聚合
│  │  ├─ db.ts                 # SQLite 连接与启动检查
│  │  ├─ lib/                  # 共享工具（错误模型、校验、响应、事务封装）
│  │  └─ modules/              # 10 个业务模块（见 §2.3）
│  └─ src/                     # React 前端
│     ├─ pages/                # 3 个页面：Timeline, Trail, TermSchedule
│     ├─ components/           # 10 个通用/业务组件
│     ├─ lib/                  # API 封装、进度映射、显示工具
│     ├─ hooks/                # useTheme, useHoverIntentTriangle
│     └─ types.ts              # 前端类型定义
├─ db/                         # SQLite 主库
├─ migrations/                 # SQL 迁移（v1 旧 + v2 当前）
├─ seeds/                      # 初始化/种子数据
├─ scripts/                    # Python 数据导入脚本
├─ src_data/                   # 学校原始 Excel（12 个文件，跨 3 个学期）
└─ docs/                       # 正式文档体系（17 个文档）
```

### 2.3 后端模块结构（重构后）

后端已从单文件 1,529 行的 `index.ts` 重构为清晰的模块化架构：

```
app/server/
├─ index.ts                    # 入口（18 行）—— Express 初始化 + 挂载路由
├─ router.ts                   # 路由聚合（42 行）—— 统一注册所有 /api/* 子路由
├─ db.ts                       # SQLite 连接
├─ apply-migration.ts          # 迁移执行
└─ modules/
   ├─ system/                  # GET /api/health
   ├─ meta/                    # GET /api/meta/categories（枚举/选项）
   ├─ requirements/            # 培养方案学分要求 CRUD
   ├─ courses/                 # 课程 CRUD + 批量动作 + 状态机
   ├─ plan/                    # POST/DELETE /api/courses/:code/plan
   ├─ study-record/            # POST/DELETE /api/courses/:code/study-record
   ├─ credit-assignment/       # 经法管融通学分归属管理
   ├─ trash/                   # 垃圾篓（软删除/恢复/永久删除/批量）
   ├─ progress/                # GET /api/progress + /api/progress/timeline
   └─ raw/                     # raw_* 表只读查询 + 课程开设聚合
```

每个模块遵循 **controller → service → repository → mapper** 分层：
- **module.ts**：路由注册（HTTP 层）
- **service.ts**：业务规则、状态机、校验
- **repository.ts**：SQL 查询与写入（单表对应）
- **mapper.ts**：数据库行 → DTO 转换

### 2.4 数据库设计

核心设计原则：

1. **三层分离**：`plan_program_courses`（官方） ↔ `plan_custom_courses`（用户） ↔ `raw_*`（学校原始事实）
2. **raw 不承载用户状态**：raw 表不建外键到 plan 表
3. **删除语义分离**：官方课程永久"删除"=软标记（不物理删），自定义课程永久删除=物理 DELETE
4. **约束在 schema 层**：CHECK 约束（枚举值、学时和、经法管融通互斥）、触发器（updated_at）、索引覆盖查询路径

---

## 三、已完成：里程碑回顾

### 第一阶段 · 基础搭建（2024 末 – 2025 初）
- React + Express + SQLite 基础架构
- 时间轴（Timeline）页面：8 学期拖拽布局
- 旅迹（Trail）页面：学分进度可视化
- 培养方案课程与学分要求数据导入
- 垃圾篓与软删除/恢复机制

### 第二阶段 · 数据导入与 v2（2025 中）
- Python 脚本批量导入学校 Excel（选课表、补退选表、一览表、有课表）
- 数据库迁移到 v2 schema（合并表、统一字段、增加 CHECK 约束）
- 通识教育选修/跨专业从 `plan_program_courses` 迁入 `plan_custom_courses`
- 经法管融通（跨学科）课程支持与学分归属管理

### 第三阶段 · 后端重构（2026-05）
- 后端从单文件 1,529 行拆为 28 个文件的模块化架构（`de6718c`）
- 状态机从控制器逻辑抽为纯函数 `state-machine.ts`
- 统一错误模型 `BusinessError` + `ErrorCode`
- 统一响应信封 `{ok, data, meta}` / `{ok:false, error}`
- `unitOfWork` 事务封装

### 第四阶段 · 前端跟进与口径统一（2026-05-29）
- 经法管融通学分规则最终定稿（6 学分上限 + 溢出机制）
- 前端进度计算迁移到后端 `/api/progress`（删除客户端重算逻辑）
- 旅迹页改为消费后端进度结果
- 大类平台卡片展示经法管 x/6 独立行
- 学分流向图加入溢出提示

### 第五阶段 · 学期课表与搜索（2026-05-30/31）
- 学期课表（TermSchedule）页面：实际排课周视图（`7ad0a1d`）
- 时间轴加入课程搜索界面（`3b99c4f`）
- 旅程界面视觉升级（`1bd3fce`）

---

## 四、当前状态：各层质量评估

### 4.1 数据库 ★★★★☆

**优点：**
- 约束完整：CHECK（枚举、学时和、归属互斥）、FK、触发器正确
- `PRAGMA integrity_check` = ok，`foreign_key_check` 无违规
- raw/plan 边界清晰

**问题：**
- 🔴 迁移机制有两套且重叠（SQL 迁移文件 + `db.ts` 启动时自动补字段），无 `schema_migrations` 版本追踪表
- 🟠 `v2_004` 使用 `PRAGMA writable_schema = ON` 直接修改 CHECK 约束（危险手法，建议改为表重建）
- 🟡 旧 v1 迁移文件（`001~014`）与旧 seeds（`001~008`）未归档
- 🟡 `plan_program_courses` 同时承担"官方课程定义"和"用户状态"两种职责（长期应拆表）

### 4.2 后端 ★★★★☆

**优点：**
- 分层干净、模块职责明确
- TypeScript strict，`tsc --noEmit` 零报错
- 统一错误模型、校验集中、参数化查询
- 状态机为纯函数（易测试）
- 进度计算逻辑完整（经法管融通 6 学分上限 + 溢出 + 状态优先级排序）

**问题：**
- 🟠 批量动作（`batch.module.ts`）重复实现了单条动作的写逻辑，`STATUS_PRIORITY` 表在两处定义
- 🟡 分页 `meta.total` 语义错误（返回页长而非总数）
- 🟡 `unitOfWork` 嵌套语义无 SAVEPOINT（当前安全但依赖约定）
- 🟡 `db.ts` 启动即跑 schema 迁移（耦合连接层和迁移层）
- 🟡 少量代码风格不一致（时间戳写入方式、未使用 import 的 hack）

### 4.3 前端 ★★☆☆☆

**优点：**
- TypeScript strict，类型定义完整
- 组件/hook/lib 分层意识在
- 进度计算已成功迁至后端（核心风险已消除）
- 交互完整：拖拽、hover 编辑、抽屉、弹窗、主题切换

**问题：**
- 🔴 前后端数据模型不一致：后端 camelCase 新模型（`courseCode`/`requirementType`/`creditCountTo`），前端仍是 snake_case 旧模型（`is_interdisciplinary`/`assigned_to`），靠 `api.ts`（740 行）大型适配层硬桥接
- 🔴 巨型组件：Timeline.tsx 1,779 行、TermSchedule.tsx 905 行、Trail.tsx 797 行
- 🟠 `api.ts` 为自定义课程合成整型 id（`nextSyntheticCustomId` + `stableProgramId` 哈希），有碰撞风险
- 🟠 "经法管融通"判定逻辑存在三处且不完全一致
- 🟡 前端字段转换散落在多个文件

### 4.4 前后端一致性 ★★★☆☆

**已解决（核心风险）：**
- ✅ 进度/学分口径已统一为后端 `/api/progress` 唯一真相源
- ✅ 经法管融通 6 学分上限与溢出规则已在前后端一致实现
- ✅ `lib/progress.ts` 客户端重算已删除，改为映射后端结果

**仍存在：**
- ⚠️ 数据模型 drift（camelCase vs snake_case）——靠适配层维持，脆弱
- ⚠️ 课程性质枚举前端缺 `经法管融通`（`CourseNature = "必修" | "选修" | "跨专业"`）

### 4.5 工程基建 ★★☆☆☆

| 项 | 状态 |
|---|---|
| TypeScript strict | ✅ 前后端共用，`tsc --noEmit` 通过 |
| `any` 使用 | ✅ 全仓仅 11 处 |
| 自动化测试 | ❌ 无任何 test/spec 文件 |
| Lint/Format | ❌ 无 ESLint / Prettier 配置 |
| 未使用依赖 | ⚠️ `node-sqlite3-wasm`、`@visx/sankey`、`d3-sankey` |
| 迁移版本追踪 | ❌ 无 `schema_migrations` 表 |
| 文档时效 | ⚠️ README 行数与实测数据略有偏差 |

---

## 五、已知问题清单（按优先级）

### P0 — 需决策
| # | 问题 | 状态 |
|---|---|---|
| 1 | 前后端数据模型何时对齐（camelCase 统一）？ | 未开始 |
| 2 | `major_platform` 的 `interdisciplinary` 桶（6 学分）在 `plan_program_requirements` 中存在但后端口径已修复——确认口径完全一致 | ✅ 已修 |

### P1 — 技术债应优先偿还
| # | 问题 | 涉及文件 |
|---|---|---|
| 3 | Timeline.tsx 拆分（1,779 行 → <600 行） | `pages/Timeline.tsx` |
| 4 | TermSchedule.tsx 拆分（905 行） | `pages/TermSchedule.tsx` |
| 5 | 后端批量动作去重（复用 service 层） | `modules/courses/batch.module.ts` |
| 6 | 分页 `meta.total` 修正（真 COUNT） | `modules/courses/course.service.ts`, `modules/raw/raw.module.ts` |
| 7 | 前端类型迁移到 camelCase 新模型 | `types.ts`, `lib/api.ts` |

### P2 — 卫生与基建
| # | 问题 |
|---|---|
| 8 | 引入 ESLint + Prettier |
| 9 | 引入自动化测试（状态机纯函数优先） |
| 10 | 统一迁移机制（建 `schema_migrations` 版本表） |
| 11 | 移除未使用依赖（`node-sqlite3-wasm`/`@visx/sankey`/`d3-sankey`） |
| 12 | 归档 v1 旧迁移与 seeds |
| 13 | 修复 `v2_004` 的 `writable_schema` 危险手法 |
| 14 | 刷新 README/docs 的数据与表清单 |
| 15 | `db.ts` 启动迁移收敛进正式迁移流程 |

---

## 六、未来路线图

### 6.1 短期（接下来 1-2 周）—— 还债与稳定

**目标：消除最痛的技术债，让项目进入可持续开发状态。**

| 优先级 | 任务 | 预期效果 |
|---|---|---|
| ⭐ | 拆分 Timeline.tsx | 前端可维护性大幅提升 |
| ⭐ | 前后端模型对齐 | 消除适配层，调试链路缩短 |
| ⭐ | 后端批量动作去重 | 减少未来改漏风险 |
| | 修正分页 total 语义 | 为真分页做准备 |
| | 引入 ESLint + Prettier | 代码风格统一 |

### 6.2 中期（接下来 1-3 个月）—— 功能深化

**目标：让学期课表、候选课程查询、数据导入成为成熟功能。**

| 领域 | 任务 |
|---|---|
| 学期课表 | 视觉升级（继承时间轴设计语言）、支持不同学期切换、排课冲突检测 |
| 候选课程 | 基于 raw 表建立课程搜索与一键加入 `plan_custom_courses` 功能 |
| 数据导入 | 支持新学期的 Excel 一键导入、自动检测重复/更新 |
| 测试 | 状态机单测、进度计算单测、垃圾篓行为集成测试 |
| 数据库 | 修复迁移机制（`schema_migrations` + 替换 `writable_schema` 手法） |

### 6.3 长期（3 个月以上）—— 架构演进

**目标：为多用户、多培养方案、数据共享做准备。**

| 领域 | 任务 |
|---|---|
| 数据模型 | 拆分 `plan_program_courses` 为 `program_courses` + `user_course_states` |
| 多培养方案 | 支持切换不同专业的培养方案模板 |
| 成绩分析 | GPA 计算、学期趋势图、课程难度标注 |
| 数据共享 | 课程评价、教师评价的本地共享（可选） |
| 打包分发 | Electron 封装为桌面应用，方便非技术同学使用 |
| 移动适配 | 响应式设计或 PWA，支持手机查看课表 |

### 6.4 明确不做的事

| 事项 | 原因 |
|---|---|
| 引入 NestJS / 重型后端框架 | 项目规模不需要，SQLite + Express 足够 |
| 引入 ORM（Prisma/TypeORM/Drizzle） | 当前表结构简单，手写 SQL 更透明 |
| 替代学校教务系统 | 非目标，且涉及合规问题 |
| 自动抢课/选课 | 非目标，且存在公平性争议 |
| 云端部署 | 涉及隐私（成绩/课表数据），保持本地优先 |

---

## 七、行动建议：推荐下一步执行顺序

基于当前项目状态，推荐按下述顺序执行：

```
1. 统一前后端模型
   ├── 更新 types.ts 为 camelCase 新模型
   ├── 补上 CourseNature 缺的 "经法管融通"
   ├── 逐步缩小 api.ts 适配层
   └── 移除合成 id（stableProgramId / nextSyntheticCustomId）

2. 引入工程基建
   ├── ESLint + Prettier 配置
   ├── package.json 加 test 脚本
   └── 状态机 & 进度计算单测

3. 拆分巨型组件
   ├── Timeline.tsx → TimelinePage + TermColumn + Drawers + hooks
   ├── TermSchedule.tsx → 同理拆分
   └── Trail.tsx → 拆分展示组件

4. 清理与归档
   ├── 移除未使用依赖
   ├── 归档 v1 迁移和 seeds
   ├── 修复迁移机制（v2_004 危险手法）
   └── 刷新文档数据

5. 功能开发
   ├── 学期课表视觉升级
   ├── 候选课程查询/搜索
   └── 一键导入新学期数据
```

---

## 八、文档体系现状

当前 `docs/` 下有 17 个正式文档：

| 编号 | 文档 | 内容 |
|---|---|---|
| 00 | 文档索引 | 推荐阅读顺序、按任务查找 |
| 01 | 项目总览 | 目标、场景、概念、边界 |
| 02 | 运行与开发 | 安装、启动、调试 |
| 03 | 架构说明 | 目录职责、数据流、架构问题 |
| 04 | 后端设计 | API 分组、业务规则、重构目标 |
| 05 | 前端设计 | 页面、组件、交互、前后端关系 |
| 06 | 数据库设计 | 表结构、字段说明、设计原则 |
| 07 | 数据导入 | 学校 Excel → raw 表 |
| 08 | API 参考 | 接口路径、请求/响应字段 |
| 09 | 维护与重构计划 | 短期/中期/长期规划 |
| 10 | API 重设计 | 完整 API 契约（33 个 endpoint） |
| 12 | 实际课表与选课视图计划 | TermSchedule 数据导入与界面 |
| 13 | 学期课表重构计划 | TermSchedule 视觉升级 |
| 14 | 代码质量分析报告 (2026-05-29) | 全层质量评估 |
| 15 | 经法管融通规则需求问卷 | 业务规则定稿 |
| 16 | 经法管融通定稿 + 前端实施 | 口径、架构决策、分阶段实施 |
| 17 | 项目近况与未来路线图 (本文) | 综合状态与路线图 |

---

## 九、项目健康速览

```
数据库设计  ★★★★☆  约束完整、分离清晰；迁移机制有隐患
后端架构    ★★★★☆  分层规范、错误模型统一；批量逻辑有重复
前端架构    ★★☆☆☆  交互完整；巨型组件、新旧模型 drift
前后端一致性 ★★★☆☆  进度口径已统一；字段契约仍不同
工程基建    ★★☆☆☆  TS strict 是亮点；无测试、无 lint
```

**总体评价**：项目架构方向正确，后端重构质量高，进度/学分核心逻辑已收敛。当前处于**"后端已就绪、前端需跟进"**的中间态。最大的单点风险——进度口径分歧——已于 2026-05-29 消除。未来的主要工作是**前端债务清理**（模型对齐、组件拆分）和**工程基建补齐**（测试、lint、迁移规范）。

---

*本文档应随项目进展持续更新。重大架构变更、新功能上线、技术债清理完成后，请同步更新相关章节。*
