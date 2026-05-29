# 经法管融通学分口径定稿 + 前端优化实施计划

> 日期：2026-05-29
> 依据：`docs/15-经法管融通学分规则-需求对齐问卷.md`（已填写）
> 范围：统一进度/学分计算口径 → **重点改造前端**，后端只做必要的小幅修正。

---

## 一、决策摘要（来自问卷）

| 编号 | 决策 |
|---|---|
| A1 | 经法管融通**默认计入「大类平台·选修」** |
| A2 | 现有 5 门保留其"大类平台-选修"选择，不重置 |
| B1 | **模型①**：大类平台 普通选修 **10** + 经法管 **6**，两条独立要求（= 数据库现状，**不改库**） |
| B2 | 经法管 6 学分是**硬性必修** |
| B3 | 通识选修(16) 默认**不含**经法管；一门课学分只有一种去向（不双计） |
| C1 | 最多 **6** 学分经法管计入大类平台 |
| C2 | 超过 6 分的经法管**溢出 → 计回通识教育·选修** |
| C3 | 不双计，二选一 |
| D1/D2 | `credit_count_to` 单值二选一；由**用户手动**切换 |
| E1 | 经法管**并入大类平台卡片**展示（在大类平台下显示"经法管 x/6"一行） |
| E2 | 需要**实时切换**交互（通识 ↔ 大类平台），数字实时变化 |
| E3 | 满 6 分后继续往大类平台放 → 允许，按 C2 自动溢出并提示 |
| F1 | **后端为唯一真相源**，前端显示后端计算结果 |
| F2 | 优先**数字准确可解释** |

---

## 二、学分计算口径（定稿 · 前后端唯一依据）

### 2.1 要求桶（与数据库一致，不改）

| 类别 | required | elective | interdisciplinary |
|---|---|---|---|
| 通识教育 general_education | 32 | 16 | — |
| 大类平台 major_platform | 30 | 10 | **6** |
| 专业教育 professional_education | 18 | 20 | — |
| 素质教育 quality_education | 6 | 6 | — |
| 实践教育 practice_education | 16 | 0 | — |

### 2.2 经法管融通归桶规则

一门经法管课 = `requirement_type = '经法管融通'`，带单值 `credit_count_to ∈ {大类平台-选修(默认), 通识教育-选修}`，由用户手动设定。

1. **取所有 `credit_count_to = 大类平台-选修` 的经法管课**：按状态优先级（已修读 > 正在修读 > 计划修读；未通过剔除、未修读不计学分）+ 学分降序排序，依次计入 `major_platform · interdisciplinary` 桶，**累计上限 6 学分**。
2. **超过 6 学分的部分（溢出）→ 计入 `general_education · elective`（通识选修 16）桶。**
3. **`credit_count_to = 通识教育-选修` 的经法管课 → 直接计入 `general_education · elective`。**
4. 普通课程不变：必修→`{category}·required`；选修→`{category}·elective`；跨专业→`general_education·elective`。
5. **不双计**：每门课只进一个桶。未通过不计；未修读占位展示但学分按 0 计入 earned/planned。

> ⚠️ **一处需你最终确认的细节（B3 vs C2）**：B3 说"通识选修默认不含经法管"，C2 又说"溢出计回通识选修"。我采用的可操作规则是：
> **经法管只有在 (a) 用户手动设为「通识教育-选修」 或 (b) 超过大类平台 6 分上限而溢出时，才计入通识选修；默认（大类平台）的经法管不占用通识选修额度。** 这同时满足"默认进大类平台"和"不双计"。如与你预期不符，看到后喊停即可，改动很小。

### 2.3 展示口径（E1）

- 经法管作为**大类平台卡片下的一行**："经法管 x / 6"，与"大类平台·选修 x / 10"并列。
- 因溢出而进入通识选修的经法管学分，体现在**通识·选修**那一行里。

---

## 三、架构决策（F1）

**`/api/progress` 为唯一真相源。** 前端所有"学分数字 / 各桶达成情况 / 经法管溢出"都来自后端，删除前端 `lib/progress.ts` 里那套并行的桶计算。前端只负责：展示 + 交互（切换归属）+ 切换后重新拉取后端结果（F2：以后端为准）。

**保持不变（降低风险）：**
- 数据库 schema 与要求表（B1 模型①）——**零改动**。
- 现有写接口 `/credit-assignment`、`/study-record`、`/plan`、`/trash` ——**复用**，不新增写逻辑。

---

## 四、分阶段实施清单（重点在前端）

### Phase 0 · 后端：修正并增强 `/api/progress`（小，是前端的前提，你无需细看）
- [x] `progress.service.ts`：按 §2.2 重写经法管归桶——`大类平台-选修` 进 `major_platform·interdisciplinary`（上限 6），溢出进 `general_education·elective`；`通识教育-选修` 进 `general_education·elective`。
- [x] 丰富返回结构，足以驱动旅迹页：每个桶带课程明细（courseCode/courseName/credits/studyStatus/source/score），并单列经法管 `counted/overflow/cap` 信息。
- [x] `tsc --noEmit` 通过；用脚本核对 `/api/progress` 输出数字符合定稿。

### Phase 1 · 前端：接入后端真相源（核心）
- [x] `types.ts`：新增 `ProgressResponse` 等后端响应类型。
- [x] `lib/api.ts`：新增 `api.progress()`（直接透传后端 camelCase 结果，不做旧模型转换）。
- [x] `pages/Trail.tsx`：改为消费 `api.progress()` 渲染各类别/各桶的 required/earned/planned/pending 数字与课程明细；移除 `computeRequirementRows`/`bundleByCategory` 调用。
- [x] `lib/progress.ts`：删除桶计算逻辑（保留纯展示/格式化用得到的部分，或整体删除）。

### Phase 2 · 前端：经法管展示与切换交互（E1/E2/E3）
- [x] E1：在大类平台卡片下渲染"经法管 x/6"行；溢出学分体现在通识选修行。
- [x] E2：每门经法管课提供"通识 ↔ 大类平台"切换 → 调 `/credit-assignment` → 重新 `api.progress()` 刷新数字（保留 `InterdisciplinaryFlow` 可视化，数据改由后端结果驱动）。
- [x] E3：当大类平台经法管已达 6 分，切换时提示"超出部分将计入通识选修"（允许操作）。

### Phase 3 · 收尾
- [x] 删除前端因迁移而残留的死代码 / 未用类型。
- [x] 刷新 `docs/05-frontend-design.md` 与 `docs/06-database-design.md` 中经法管口径描述。
- [x] 自测：旅迹页数字 = 后端 `/api/progress`；切换归属后数字正确联动。

---

## 五、风险与回滚

- **风险**：`Trail.tsx`（763 行）与旧 `lib/progress.ts` 深度耦合（含 `InterdisciplinaryFlow`、展开/内联改分），整页改造面较大。
- **策略**：分阶段、每步保持 `tsc` 通过与应用可运行。Phase 0 与 Phase 1 的 `api.progress()` 都是**新增/不破坏**现有调用；旅迹页切换是最后一步，切换前后用 Playwright/手测核对。
- **回滚**：每个 Phase 独立提交，出问题可逐 Phase 回退。

## 六、验证方式
- `npx tsc --noEmit` 每步零报错。
- 用一个临时 node 脚本打印 `/api/progress` 结果，对照 §2.2 手算校验经法管 6 分上限与溢出。
- 旅迹页与后端数字逐桶对齐。

---

## 进度记录
- 2026-05-29：计划定稿，开始 Phase 0。
- 2026-05-29：**Phase 0 完成并验证**。`progress.service.ts` 按 §2.2 重写经法管归桶（大类平台·经法管上限 6、溢出→通识选修、通识方向直入通识选修），并给 `BucketCourse` 增加 `term`/`categoryCode`。用脚本对实库计算，`/api/progress` 数字符合定稿；`tsc --noEmit` 通过。
- 2026-05-29：**Phase 1 完成并验证**。`types.ts` 增加 `ProgressResponse` 等类型；`api.ts` 增加 `progress()` 与 `idForCourse()`；`lib/progress.ts` 删除本地桶计算，改为 `bundlesFromProgress` / `flowItemsFromProgress` 映射后端结果；`Trail.tsx` 改为消费 `api.progress()`，保留原有卡片/药丸/流向图/内联改分交互。`tsc` 通过、`npm run build` 通过。
- 2026-05-29：**Playwright 实测通过**。旅迹页正常渲染，无报错；大类平台卡片显示「大类平台（经法管融通）2+4 / 6」，与后端 `/api/progress` 完全一致（E1 已达成；E2 切换沿用既有交互，切换后重新拉取后端进度）。
- 2026-05-29：**E3 + Phase 3 完成**。旅迹页「学分流向」加入上限说明 + 溢出提示（提示数据来自后端 `overflow.interdisciplinary`，Playwright 实测文案渲染正常、无报错）；移除迁移残留死代码 `api.creditAssignments` 与未用的 `CreditAssignment` 类型；刷新 `docs/05`、`docs/06` 口径说明。`tsc --noEmit` 与 `npm run build` 均通过。
- **可选/剩余**：经法管「切换归属」交互已接好（沿用既有 `/credit-assignment` 等接口 + 切换后重拉 `/api/progress`），为避免改动你的真实数据未做点击式实测；§2.2 ⚠️ 的 B3/C2 细节如需调整可随时改。
- 2026-05-29：**进度口径与时间轴「我的计划」对齐**。`progress.service.ts` 改为按"是否落在时间轴上"归类（`placementTerm` = 计划修读用 plannedTerm（可为 null=抽屉，不回退默认）；其余官方课 `actual ?? planned ?? 默认开课学期`；未落位一律不计），未修读但有默认开课学期的官方课现计入 `planned`。前端 `lib/progress.ts` 的 planned 过滤改为按 `term != null` 判定。实测：实践教育·必修 现完整显示 军训(已修)+社会实践/思想政治理论课实践/毕业实习/毕业论文/学年论文(计划)；旅迹四态合计 = 时间轴「我的计划合计」= 169.5。旅迹总览底部由「预计完成」改为「我的计划合计」，与时间轴共用 `lib/planTotal`。
