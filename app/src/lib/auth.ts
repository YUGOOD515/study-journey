/**
 * 账号相关请求：Better Auth（/api/auth/*）+ 学旅自己的 /api/config、/api/me。
 * 会话保存在 HttpOnly Cookie 中，前端不接触 token。
 */

export interface AppConfig {
  turnstileSiteKey: string | null;
  emailEnabled: boolean;
  requireEmailVerification: boolean;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  enrollmentYear: number;
}

export const UNAUTHORIZED_EVENT = "study-journey:unauthorized";

export class AuthError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不正确",
  INVALID_EMAIL: "邮箱格式不正确",
  INVALID_PASSWORD: "密码不正确",
  USER_ALREADY_EXISTS: "该邮箱已注册，请直接登录",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "该邮箱已注册，请直接登录",
  PASSWORD_TOO_SHORT: "密码至少 8 位",
  PASSWORD_TOO_LONG: "密码最多 128 位",
  EMAIL_NOT_VERIFIED: "邮箱尚未验证，请先点击验证邮件中的链接",
  INVALID_TOKEN: "链接无效或已过期，请重新申请",
  TOKEN_EXPIRED: "链接已过期，请重新申请",
  SESSION_EXPIRED: "登录已过期，请重新登录后再操作",
  SESSION_NOT_FRESH: "为了安全，请重新登录后再操作",
  MISSING_RESPONSE: "请先完成人机验证",
  VERIFICATION_FAILED: "人机验证未通过，请重试",
  INVALID_ORIGIN: "请求来源不受信任",
};

function messageOf(status: number, body: unknown): AuthError {
  const b = (body ?? {}) as { code?: string; message?: string; error?: { code?: string; message?: string } };
  const code = b.code ?? b.error?.code;
  if (status === 429) return new AuthError("操作太频繁，请稍后再试", "RATE_LIMITED", status);
  const msg = (code && MESSAGES[code]) || b.error?.message || b.message || `请求失败（HTTP ${status}）`;
  return new AuthError(msg, code, status);
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; captchaToken?: string | null } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.captchaToken) headers["x-captcha-response"] = init.captchaToken;
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) throw messageOf(res.status, body);
  if (body && typeof body === "object" && "ok" in body && (body as { ok: unknown }).ok === true) {
    return (body as unknown as { data: T }).data;
  }
  return body as T;
}

export const authApi = {
  config: () => call<AppConfig>("/api/config"),

  /** 未登录时返回 null。 */
  async me(): Promise<Me | null> {
    try {
      return await call<Me>("/api/me");
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) return null;
      throw e;
    }
  },

  updateMe: (patch: { enrollmentYear: number }) =>
    call<Me>("/api/me", { method: "PATCH", body: patch }),

  signIn: (email: string, password: string, captchaToken: string | null) =>
    call("/api/auth/sign-in/email", { body: { email, password, rememberMe: true }, captchaToken }),

  signUp: (email: string, password: string, name: string, captchaToken: string | null) =>
    call<{ token: string | null }>("/api/auth/sign-up/email", {
      body: { email, password, name, callbackURL: "/" },
      captchaToken,
    }),

  signOut: () => call("/api/auth/sign-out", { body: {} }),

  requestPasswordReset: (email: string, captchaToken: string | null) =>
    call("/api/auth/request-password-reset", {
      body: { email, redirectTo: `${window.location.origin}/?auth=reset` },
      captchaToken,
    }),

  resetPassword: (token: string, newPassword: string) =>
    call("/api/auth/reset-password", { body: { token, newPassword } }),

  changePassword: (currentPassword: string, newPassword: string) =>
    call("/api/auth/change-password", {
      body: { currentPassword, newPassword, revokeOtherSessions: true },
    }),

  deleteAccount: (password: string) => call("/api/auth/delete-user", { body: { password } }),
};
