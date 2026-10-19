/**
 * Cloudflare Worker 绑定与环境变量。
 *
 * - DB / ASSETS 在 wrangler.jsonc 中声明。
 * - *_SECRET / *_API_KEY 用 `wrangler secret put` 设置，不写进仓库。
 */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  /** Better Auth 会话签名密钥（至少 32 字节随机字符串）。必填。 */
  BETTER_AUTH_SECRET: string;

  /** Turnstile 人机验证。两者都配置时注册/登录/找回密码会强制校验。 */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;

  /** 可选：Resend 邮件服务，用于邮箱验证与找回密码。未配置时这两项功能关闭。 */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** "true" 时注册后必须先验证邮箱才能登录（需要邮件服务）。 */
  REQUIRE_EMAIL_VERIFICATION?: string;

  /** 新用户默认入学年份；用户可在账号设置里修改。 */
  DEFAULT_ENROLLMENT_YEAR?: string;

  /** 额外信任的来源（逗号分隔），本地开发时填 Vite 地址 http://localhost:6173。 */
  TRUSTED_ORIGINS?: string;

  /** PBKDF2 迭代次数（10000–100000，默认 100000）。免费套餐若出现 CPU 超限可调低。 */
  PASSWORD_PBKDF2_ITERATIONS?: string;
}
