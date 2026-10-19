#!/usr/bin/env bash
# 学旅 Cloudflare 一键准备 / 预览发布脚本（可重复执行）。
#
# 用法：
#   scripts/cloudflare-setup.sh [预览别名]              # 默认别名 multiuser-v1
#   SQLITE_DB=~/private/course_planner_v2.sqlite OWNER_EMAIL=you@example.com scripts/cloudflare-setup.sh
#
# 做的事：检查登录 → 建表（未执行过的迁移）→ 可选导入公共数据 / 个人数据 → 检查密钥 → 上传预览版本。
# 不会部署生产版本；合并到主干后再执行 `cd app && npm run deploy`。
set -euo pipefail

ALIAS="${1:-multiuser-v1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
DB_NAME="study-journey"
SQLITE_DB="${SQLITE_DB:-$ROOT/db/course_planner_v2.sqlite}"
cd "$APP"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ask() { local a; read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy]$ ]]; }

say "安装依赖"
npm install --no-audit --no-fund >/dev/null

say "检查 Cloudflare 登录"
npx wrangler whoami >/dev/null 2>&1 || npx wrangler login

say "应用 D1 迁移（只执行尚未执行的）"
npx wrangler d1 migrations apply "$DB_NAME" --remote

if [[ -f "$SQLITE_DB" ]]; then
  if ask "用 $SQLITE_DB 重新导入公共数据（开课表 / 培养方案）？"; then
    python3 "$ROOT/scripts/build_d1_seed.py" --db "$SQLITE_DB"
    npx wrangler d1 execute "$DB_NAME" --remote --file="$ROOT/.d1-data/public.sql" --yes
  fi
  if [[ -n "${OWNER_EMAIL:-}" ]] && ask "把旧数据库里的个人计划导入到账号 $OWNER_EMAIL（需已注册，会覆盖现有计划）？"; then
    python3 "$ROOT/scripts/build_d1_seed.py" --db "$SQLITE_DB" --email "$OWNER_EMAIL"
    npx wrangler d1 execute "$DB_NAME" --remote --file="$ROOT/.d1-data/personal.sql" --yes
  fi
else
  echo "未找到 $SQLITE_DB，跳过数据导入（可用 SQLITE_DB=... 指定）。"
fi

say "检查密钥"
SECRETS="$(npx wrangler secret list --format json 2>/dev/null || echo '[]')"
if ! grep -q '"BETTER_AUTH_SECRET"' <<<"$SECRETS"; then
  openssl rand -hex 32 | npx wrangler secret put BETTER_AUTH_SECRET
fi
if ! grep -q '"TURNSTILE_SECRET_KEY"' <<<"$SECRETS"; then
  echo "提示：还没有 TURNSTILE_SECRET_KEY，注册将不做人机验证。"
  echo "      在 Cloudflare 控制台 → Turnstile 复制 secret 后执行：npx wrangler secret put TURNSTILE_SECRET_KEY"
fi

say "构建并上传预览版本：$ALIAS"
npm run build
npx wrangler versions upload --preview-alias "$ALIAS"
echo
echo "预览地址：https://$ALIAS-study-journey.<你的 workers.dev 子域>.workers.dev"
