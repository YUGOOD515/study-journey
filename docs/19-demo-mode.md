# 示例模式（Demo）

让没有账号的访客直接体验完整的八学期数据。入口：登录页「先看看示例」按钮，或直接访问 `/demo`。

## 1. 流程

1. 前端 `POST /api/demo/session`（`lib/auth.ts` 的 `startDemo()`）。
2. 后端 `app/server/demo/demo.ts` 的 `createDemoSession`：
   - 按 IP 限流：每小时 10 次（`rateLimit` 表，key `demo:<ip>`），超出返回 429；
   - 懒清理：顺带删除 24 小时前创建的示例账号；
   - 活跃示例账号上限 300，超出返回 503；
   - 创建临时账号 `demo-<16位hex>@demo.invalid`（不发邮件、不走 Turnstile），返回会话 Cookie。
3. `seedDemoData` 把 `app/server/demo/demo-data.json` 写进该账号（单个 D1 batch）。
4. `/api/me` 返回 `isDemo: true`，前端显示示例横幅（`components/DemoBanner.tsx`），账号菜单隐藏改密码/账号与数据。
5. 「退出示例」或「注册账号」会直接删除该临时账号（级联删除全部数据）；未主动退出的在 24 小时后清除。

## 2. 示例数据

由 `scripts/build_demo_data.py` 生成（固定随机种子，可复现）：

```bash
python3 scripts/build_demo_data.py --input <导出的用户数据 JSON>
```

输出写到 `app/server/demo/demo-data.json`。输入文件含个人数据，不要提交到仓库；生成的 `demo-data.json` 已匿名化。

规则：

| 项目 | 规则 |
|---|---|
| 必修课 | 沿用原计划的学期安排 |
| 选修课 | 按培养方案学分要求重新挑选，各类别正好达标（合计 160 学分） |
| 成绩 | 随机模拟，整体偏优；每学期加权均分 86–92，总均分约 89.6 |
| 课表 | 沿用原课表中同学期同课程的时间，其余课程合成空闲时段；实践类、0 学时课程不排课 |
| 教师 | 匿名为「X老师」 |

学期与当前时间对齐（北京时间）：秋季学期时示例同学处于第 5 学期，春季处于第 6 学期。之前的学期为「已修读」并带成绩，当前学期「正在修读」，之后为「计划修读」。第 8 学期只有毕业论文，没有课表。

## 3. 注意

- 示例账号和正式账号在同一个 D1 里，预览版本也会写入生产库。
- 若某学期在 `raw_import_batches` 里没有批次，会自动补一条 `source_file = 'demo'` 的批次（备注「示例模式：合成课表」），供课表挂载。
