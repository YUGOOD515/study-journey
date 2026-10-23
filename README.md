# 学旅 Study Journey

学旅是面向中南财经政法大学本科生的四年选课规划工具：按培养方案把课程排进八个学期，自动计算毕业学分进度，并提醒开课学期和先修顺序。

> **flask-rewrite 分支**：整个项目正在从 React + Hono（TypeScript）重写为 **Python Flask + Jinja + Tailwind CSS + 少量 JS**。
> 新代码在 `src/`、`public/`、`assets/`、`tests/`；旧的 TypeScript 代码（`app/`、`d1/` 等）暂时保留作对照，迁移完成后删除。

## 技术栈

- 后端：Flask，按 MVC 组织：`models/` 数据与业务规则，`controllers/` 路由，`templates/` 视图
- 前端：Jinja 服务端渲染 + Tailwind CSS v4 + SortableJS（拖拽排课）
- 数据：本地版用 SQLite；演示版用内置示例数据，改动只存在访客自己的浏览器会话里
- 项目管理：uv；演示部署：Cloudflare Python Workers
- 不需要账号，大家在自己电脑上运行

## 本地运行（PowerShell）

```powershell
uv sync                                             # 安装依赖（含开发工具）
uv run flask --app study_journey --debug run        # 本地版：http://127.0.0.1:5000
$env:STUDY_JOURNEY_MODE = "demo"                    # 切到演示数据后再运行上一条
uv run pytest                                       # 测试
```

本地版的数据保存在 `instance/study_journey.sqlite3`（不进 Git）。入学年份默认 2024，可用环境变量 `ENROLLMENT_YEAR` 修改；
设置 `CLASS_NAME`（如 `$env:CLASS_NAME = "数金2401班"`）后，学期课表会优先选本班的教学班。

## 学期课表

「学期课表」页（`/timetable`）给某学期排进来的每门课选一个教学班，按周一到周日、第 1–12 节排出课表：

- 检查时间冲突（同一天、节次重叠、周次重叠才算冲突，前八周 / 后八周的课不算）
- 可以切换周次，只看某一周的课
- 「自动排课」只给还没选的课挑教学班：先避开冲突，再尽量选本班的；已选的保持不动
- 从没排过的学期，会先把有本班教学班的课选上本班的
- 开课表还没发布的学期，按最近一个同季学期试排（班级按年级自动换算，如 2401 → 2301）

## 修改样式

样式源文件是 `assets/app.css`（设计 tokens 也在这里），改完重新生成：

```powershell
uv run tailwindcss -i assets/app.css -o public/static/css/app.css --minify   # 开发时加 --watch
```

## 更新培养方案数据

```powershell
uv run --group importers python -m study_journey.services.importers.program_xlsx src_data/培养方案.xlsx src/study_journey/data/program.json
```

导入器只导出培养方案本身，不导出表格里的完成学期、成绩、意愿度等个人字段。

## 开课数据

学校每学期在官网公开发布开课 Excel（一学期 2～3 份：本科生选课、补退选、通识/经法管融通/素质教育课程一览表）。
它和个人数据分开存放：

| | 个人数据 | 开课数据 |
|---|---|---|
| 内容 | 培养方案、成绩、自己的规划 | 每学期开哪些课、教学班、时间、教师 |
| 来源 | 自己用脚本从教务系统获取 | 学校公开发布，维护者每学期统一导入 |
| 存放 | `instance/`，只在自己电脑上 | 仓库自带 `public/static/data/offerings/`；本机下载或导入的放 `instance/offerings/` |

两处都有同一学期时，取更新日期较新的那份。课程详情里会列出该学期的教学班；某学期的开课表还没发布时，用最近一个同季学期作参考。

**维护者：每学期导入一次并提交**

```powershell
# 把新学期的 Excel 放进 src_data/，文件名保留学校原来的（要含「2026-2027学年第1学期」这样的学期信息）
uv run --group importers flask --app study_journey offerings import src_data --out public/static/data/offerings
git add public/static/data/offerings
git commit -m "data: 2026-2027-1 开课数据"
```

每个学期生成一个 JSON，`manifest.json` 记录各学期的版本指纹；内容没变的学期不会重写。「有课表课程」是个人课表导出，导入时会跳过。

**使用者：更新开课数据**（任选一种）

- `git pull`：连同代码一起更新
- 页面底部「检查开课数据更新」，或 `uv run flask --app study_journey offerings update`：从 jsDelivr / GitHub 下载新数据到 `instance/offerings/`，下载后校验指纹
- 自己导入学校的 Excel：`uv run --group importers flask --app study_journey offerings import <文件夹>`（默认写到 `instance/offerings/`）

## Cloudflare 演示部署

```powershell
uv run --group worker pywrangler dev                                             # 用 Cloudflare 本地运行时预览
uv run --group worker pywrangler versions upload --preview-alias flask-rewrite   # 上传预览版本，不影响线上
uv run --group worker pywrangler deploy                                          # 合并到主干后正式发布
```

## 目录

```text
├─ pyproject.toml / uv.lock
├─ wrangler.jsonc            # Cloudflare 演示版配置
├─ assets/app.css            # Tailwind 源文件与设计 tokens
├─ public/static/            # 生成的 CSS、JS、第三方库（Cloudflare 直接返回）
│  └─ data/offerings/        # 各学期开课数据（公开，演示版和下载更新都用这里）
├─ src/
│  ├─ worker.py              # Cloudflare 入口（演示模式）
│  └─ study_journey/
│     ├─ models/             # Model：培养方案、计划、学分进度、时间轴、数据仓库
│     ├─ controllers/        # Controller：Flask 路由
│     ├─ templates/          # View：Jinja 页面与组件
│     ├─ services/importers/ # 学校数据导入（培养方案、开课 Excel）
│     ├─ services/offerings_sync.py # 本地版下载开课数据
│     └─ data/               # 培养方案与演示数据（JSON）
├─ tests/
├─ fetch/、scripts/          # 原有 Python 抓取与导入脚本，后续并入 services/
└─ app/、d1/、docs/ …        # 旧 TypeScript 版本，迁移完成后删除
```

---

## 旧版说明（TypeScript）

学旅是面向本科课程规划的 Web 应用：培养方案课程、自选课程、八学期时间轴、学分进度、学期课表、垃圾篓，以及学校开课数据查询。

现在它是一个**开放注册的多用户网站**，运行在 Cloudflare 上：

- 前端：React + Vite + Tailwind（`app/src`）
- 后端：Cloudflare Worker + Hono（`app/server`），静态资源由同一个 Worker 托管
- 数据库：Cloudflare D1（迁移在 `d1/migrations/`）
- 账号：Better Auth 邮箱密码登录 + Turnstile 人机验证；每个用户的计划、成绩、课表互相隔离
- 示例模式：不注册也能访问 `/demo` 体验完整的八学期示例数据（临时账号，24 小时后清除，见 [docs/19](docs/19-demo-mode.md)）

## 快速启动（本地）

```bash
cd app
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
python3 ../scripts/build_d1_seed.py --db <本地 course_planner_v2.sqlite>
npx wrangler d1 execute study-journey --local --file=../.d1-data/public.sql
npm run dev            # http://localhost:6173
```

## 部署

```bash
scripts/cloudflare-setup.sh multiuser-v1   # 上传名为 multiuser-v1 的预览版本
cd app && npm run deploy                   # 合并到主干后发布生产
```

详见 [docs/18-cloudflare-deployment.md](docs/18-cloudflare-deployment.md)。

## 目录

```text
项目根目录/
├─ app/          # React 前端 + Worker 后端（wrangler.jsonc）
├─ d1/           # 线上 D1 迁移（以此为准）
├─ migrations/   # 本地 SQLite 导入库的建表脚本（只用于学校数据导入 → 生成 D1 种子）
├─ scripts/      # 学校数据导入、D1 种子生成、Cloudflare 部署脚本
├─ src_data/     # 学校原始 Excel 数据
├─ fetch/        # 教务数据抓取脚本（输出写到 fetch/outputs/，不进 Git）
└─ docs/         # 文档（docs/archive/ 为历史计划与分析）
```

## 数据与隐私

- 个人数据（计划、成绩、课表）只存在 D1 的每用户表里，不进 Git。
- `db/*.sqlite`、`.d1-data/`、个人课表抓取结果已加入 `.gitignore`。
- 注销账号会级联删除该用户的全部数据。

## 文档导航

建议按以下顺序阅读：

1. [文档索引](docs/00-document-index.md)
2. [项目总览](docs/01-project-overview.md)
3. [运行与开发说明](docs/02-run-and-development.md)
4. [项目架构说明](docs/03-architecture.md)
5. [后端设计说明](docs/04-backend-design.md)
6. [前端设计说明](docs/05-frontend-design.md)
7. [数据库设计说明](docs/06-database-design.md)
8. [数据导入与 raw 表说明](docs/07-data-import-and-raw-tables.md)
9. [API 接口说明](docs/08-api-reference.md)
10. [Cloudflare 部署与多用户架构](docs/18-cloudflare-deployment.md) ← 运行、部署、数据以此为准

