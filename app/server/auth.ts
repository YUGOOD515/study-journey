import { betterAuth } from "better-auth";
import { captcha } from "better-auth/plugins/captcha";
import type { Env } from "./env";
import { mailEnabled, sendActionMail } from "./lib/mail";
import { hashPassword, resolveIterations, verifyPassword } from "./lib/password";

/** 当前请求的来源 + TRUSTED_ORIGINS 里配置的额外来源。 */
export function trustedOrigins(env: Env, request: Request): string[] {
  const own = new URL(request.url).origin;
  const extra = (env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return Array.from(new Set([own, ...extra]));
}

export function authFeatures(env: Env) {
  const emailEnabled = mailEnabled(env);
  return {
    emailEnabled,
    requireEmailVerification: emailEnabled && env.REQUIRE_EMAIL_VERIFICATION === "true",
    turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
  };
}

/**
 * 每个请求创建一次（Workers 的 env 只在请求内可用）。
 * baseURL 取请求来源，所以 workers.dev、预览别名、自定义域名都能直接使用。
 */
export function createAuth(env: Env, request: Request) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET 未配置或长度不足 32");
  }
  const origin = new URL(request.url).origin;
  const features = authFeatures(env);
  const iterations = resolveIterations(env.PASSWORD_PBKDF2_ITERATIONS);

  return betterAuth({
    appName: "学旅",
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: trustedOrigins(env, request),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: features.requireEmailVerification,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => hashPassword(password, iterations),
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
      ...(features.emailEnabled
        ? {
            sendResetPassword: async ({ user, url }) => {
              await sendActionMail(env, {
                to: user.email,
                subject: "学旅：重置密码",
                intro: "我们收到了重置学旅账号密码的请求，链接 1 小时内有效。",
                actionText: "重置密码",
                url,
              });
            },
          }
        : {}),
    },
    ...(features.emailEnabled
      ? {
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => {
              await sendActionMail(env, {
                to: user.email,
                subject: "学旅：验证邮箱",
                intro: "欢迎使用学旅，请点击下方按钮验证你的邮箱。",
                actionText: "验证邮箱",
                url,
              });
            },
          },
        }
      : {}),
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      deleteUser: { enabled: true },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/request-password-reset": { window: 3600, max: 3 },
        "/send-verification-email": { window: 3600, max: 3 },
        "/change-password": { window: 60, max: 5 },
        "/delete-user": { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: features.turnstileEnabled
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: env.TURNSTILE_SECRET_KEY!,
            endpoints: ["/sign-up/email", "/sign-in/email", "/request-password-reset"],
          }),
        ]
      : [],
  });
}
