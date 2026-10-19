# Cloudflare 部署与多用户架构

> 自 `cloudflare-multiuser` 分支起，学旅从「本地单用户（Express + node:sqlite）」改为「Cloudflare Workers + D1 的多用户网站」，开放注册。本文是部署、数据和账号体系的正式说明；旧文档中关于 Express、`DB_PATH`、单用户 `my_plan_courses` 的描述以本文为准。

## 1. 架构

```text
浏览器 ──► Worker「study-journey」（单个 Worker）
            ├─ /api/auth/*   Better Auth（邮箱 + 密码，会话 Cookie）
            ├─ /api/*        Hono 路由 → 各业务模块（courses / plan / progress / raw / trash …）
            └─ 其他路径      Workers Static Assets（Vite 构建的 dist，SPA 回退 index.html）
                    │
                    ▼
                 D1「study-journey」
```

| 组件 | 选型 | 说明 |
|---|---|---|
| 运行时 | Cloudflare Workers | `app/server/worker.ts`，`app/wrangler.jsonc` |
| 路由 | Hono | 与旧 Express 路由一一对应，路径不变 |
| 数据库 | D1（SQLite） | 迁移在 `d1/migrations/`，由 `wrangler d1 migrations apply` 管理 |
| 账号 | Better Auth 1.7 | 数据直接存 D1；密码用 WebCrypto PBKDF2-SHA256（`server/lib/password.ts`） |
| 人机验证 | Cloudflare Turnstile | 注册 / 登录 / 找回密码强制校验（配置了密钥时） |
| 邮件（可选） | Resend | 配置后启用邮箱验证与找回密码；未配置时这两项隐藏 |

为什么不用 Cloudflare Access：Access 适合「已知名单」的内部工具，免费版 50 人上限、没有自助注册，也无法给每个用户单独存数据，因此只适合作为管理后台的额外保护层。

## 2. 数据边界

| 表 | 归属 | 说明 |
|---|---|---|
| `raw_import_batches`、`raw_term_course_sections`、`raw_term_added_courses`、`raw_course_catalog_previews` | 公共、只读 | 学校开课数据 |
| `plan_program_courses`、`plan_program_requirements` | 公共、只读 | 培养方案模板（不含任何个人状态） |
| `user`、`session`、`account`、`verification`、`rateLimit` | Better Auth | 账号与会话 |
| `user_profiles` | 每用户 | 入学年份、初始化时间 |
| `my_plan_courses` | 每用户 | 我的计划、修读状态、成绩（主键 `(user_id, course_code)`） |
| `user_course_meetings` | 每用户 | 学期课表片段（原 `raw_actual_course_meetings`，单用户版里它其实是个人课表） |
| `user_requirement_overrides` | 每用户 | 对学分要求的个人调整 |

规则：

- 所有每用户表都带 `user_id`，外键 `ON DELETE CASCADE`；注销账号会删除全部个人数据。
- 服务端每个查询都从会话取 `ctx.userId`，前端不能指定用户。
- 新用户第一次请求时自动初始化：创建 `user_profiles`，并把培养方案复制进 `my_plan_courses`（`official_term` 为 1–8 的课程放进对应学期并标为「计划修读」，其余「未修读」）。
- 「第 N 学期」与学年的换算使用用户的入学年份（账号菜单里可改），不再取 raw 数据的最早年份。
- 官方培养方案对所有人只读；学分要求的修改写入 `user_requirement_overrides`。

## 3. 安全措施

- 会话：HttpOnly Cookie，30 天有效，每天续期；生产环境自动使用 `__Secure-` 前缀。
- CSRF：所有非 GET 的 `/api/*` 请求必须带同源 `Origin`；Better Auth 自身也校验来源。
- 限流（存 D1）：登录 5 次/分钟、注册 5 次/小时、找回密码 3 次/小时（按 `cf-connecting-ip`）。
- 密码：8–128 位；PBKDF2-SHA256 100000 次迭代（Workers 上限），哈希里带迭代次数，以后可调整。
- 响应头：`app/public/_headers` 设置 `nosniff`、`X-Frame-Options: DENY` 等。

## 4. 本地开发

```bash
cd app
npm install
cp .dev.vars.example .dev.vars          # 本地密钥（已被 .gitignore 忽略）
npm run db:migrate:local                 # 在 .wrangler/ 里建本地 D1
python3 ../scripts/build_d1_seed.py      # 由本地 SQLite 生成 ../.d1-data/public.sql
npx wrangler d1 execute study-journey --local --file=../.d1-data/public.sql
npm run dev                              # Vite 6173 + wrangler dev 6174
```

访问 http://localhost:6173 ，注册任意邮箱即可使用（本地 Turnstile 用的是官方「总是通过」测试密钥）。

## 5. 部署

一次性准备（已完成的项可跳过）：

| 步骤 | 命令 / 位置 |
|---|---|
| 登录 | `npx wrangler login` |
| 创建 D1 | `npx wrangler d1 create study-journey`，把 `database_id` 写进 `wrangler.jsonc` |
| 建表 | `npm run db:migrate:remote` |
| 导入公共数据 | `npx wrangler d1 execute study-journey --remote --file=../.d1-data/public.sql` |
| 会话密钥 | `openssl rand -hex 32 \| npx wrangler secret put BETTER_AUTH_SECRET` |
| Turnstile | 控制台创建 widget，`TURNSTILE_SITE_KEY` 写进 vars 或 secret，`npx wrangler secret put TURNSTILE_SECRET_KEY` |
| 邮件（可选） | `npx wrangler secret put RESEND_API_KEY`、`MAIL_FROM` |

日常发布遵循「分支 → 预览 → 合并 → 生产」：

```bash
npm run deploy:preview -- <别名>   # 例如 multiuser-v1 → https://multiuser-v1-study-journey.<子域>.workers.dev
npm run deploy                     # 仅在合并到主干后执行
```

注意：预览版本和生产共用同一个 D1，预览里注册的账号上线后仍然存在。

`scripts/cloudflare-setup.sh` 把上面的步骤串成一条命令（可重复执行）。

## 6. 导入自己的旧数据

1. 在网站上用自己的邮箱注册。
2. 生成个人数据 SQL（不会进 Git）：
   ```bash
   python3 scripts/build_d1_seed.py --db <你的 course_planner_v2.sqlite> --email you@example.com
   ```
3. 导入（会覆盖该账号现有的计划和课表）：
   ```bash
   cd app && npx wrangler d1 execute study-journey --remote --file=../.d1-data/personal.sql
   ```

`build_d1_seed.py` 会把培养方案里的个人状态清空后才写入公共数据，并去掉课表来源里的学号。

## 7. 免费套餐提示

- Workers 免费版单请求 CPU 10ms。普通接口约 5ms；注册 / 登录因 PBKDF2 偶尔更高。如果出现 1102 错误，把 `PASSWORD_PBKDF2_ITERATIONS` 调低（如 `50000`），已有密码不受影响。
- D1 免费版：5GB、每天 500 万行读取，个人 / 小规模使用足够。
