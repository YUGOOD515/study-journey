# 学旅 Study Journey

学旅是面向本科课程规划的 Web 应用：培养方案课程、自选课程、八学期时间轴、学分进度、学期课表、垃圾篓，以及学校开课数据查询。

现在它是一个**开放注册的多用户网站**，运行在 Cloudflare 上：

- 前端：React + Vite + Tailwind（`app/src`）
- 后端：Cloudflare Worker + Hono（`app/server`），静态资源由同一个 Worker 托管
- 数据库：Cloudflare D1（迁移在 `d1/migrations/`）
- 账号：Better Auth 邮箱密码登录 + Turnstile 人机验证；每个用户的计划、成绩、课表互相隔离

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
├─ d1/           # D1 迁移
├─ scripts/      # 学校数据导入、D1 种子生成、Cloudflare 部署脚本
├─ migrations/   # 旧版本地 SQLite 迁移（历史）
├─ seeds/        # 旧版种子数据（历史）
├─ src_data/     # 学校原始 Excel 数据
├─ fetch/        # 教务数据抓取脚本
└─ docs/         # 文档
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
10. [维护与重构计划](docs/09-maintenance-and-refactor-plan.md)
11. [Cloudflare 部署与多用户架构](docs/18-cloudflare-deployment.md) ← 运行、部署、数据以此为准

