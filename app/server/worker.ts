import { Hono } from "hono";
import type { AppEnv } from "./app-types";
import { authFeatures, createAuth, trustedOrigins } from "./auth";
import { createDemoSession, DemoError, isDemoEmail } from "./demo/demo";
import { Db } from "./db";
import type { Env } from "./env";
import { expectNumber } from "./lib/validate";
import { errorBody, handleError, ok, readJson } from "./lib/response";
import { defaultEnrollmentYear, ensureUserInitialized, rememberEnrollmentYear } from "./lib/user-init";
import { registerCourseBatchRoutes } from "./modules/courses/batch.module";
import { registerCourseRoutes } from "./modules/courses/course.module";
import { registerCreditAssignmentRoutes } from "./modules/credit-assignment/credit-assignment.module";
import { registerMetaRoutes } from "./modules/meta/meta.module";
import { registerPlanRoutes } from "./modules/plan/plan.module";
import { registerProgressRoutes } from "./modules/progress/progress.module";
import { registerRawRoutes } from "./modules/raw/raw.module";
import { registerRequirementRoutes } from "./modules/requirements/requirement.module";
import { registerStudyRecordRoutes } from "./modules/study-record/study-record.module";
import { registerTrashRoutes } from "./modules/trash/trash.module";

const api = new Hono<AppEnv>().basePath("/api");

api.onError(handleError);
api.notFound((c) => c.json(errorBody("NOT_FOUND", `接口不存在: ${c.req.method} ${c.req.path}`), 404));

// ---- 公开接口 -------------------------------------------------------------

api.get("/health", (c) => ok(c, { ok: true, time: new Date().toISOString() }));

api.get("/config", (c) => {
  const features = authFeatures(c.env);
  return ok(c, {
    turnstileSiteKey: features.turnstileEnabled ? c.env.TURNSTILE_SITE_KEY : null,
    emailEnabled: features.emailEnabled,
    requireEmailVerification: features.requireEmailVerification,
  });
});

api.on(["GET", "POST"], "/auth/*", async (c) => {
  return createAuth(c.env, c.req.raw).handler(c.req.raw);
});

/** 示例模式：创建一个 24 小时的临时账号并写入演示数据，响应里带会话 Cookie。 */
api.post("/demo/session", async (c) => {
  const origin = c.req.header("origin");
  if (!origin || !trustedOrigins(c.env, c.req.raw).includes(origin)) {
    return c.json(errorBody("FORBIDDEN", "请求来源不受信任"), 403);
  }
  try {
    const headers = await createDemoSession(c.env, c.req.raw);
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify({ ok: true, data: { demo: true } }), { status: 200, headers });
  } catch (err) {
    if (err instanceof DemoError) {
      return c.json(errorBody("PRECONDITION_FAILED", err.message), err.status);
    }
    throw err;
  }
});

// ---- 需要登录的接口 -------------------------------------------------------

/** 写请求必须来自本站（Cookie 会话下的 CSRF 防护）。 */
api.use("*", async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = c.req.header("origin");
    if (!origin || !trustedOrigins(c.env, c.req.raw).includes(origin)) {
      return c.json(errorBody("FORBIDDEN", "请求来源不受信任"), 403);
    }
  }
  await next();
});

api.use("*", async (c, next) => {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json(errorBody("UNAUTHORIZED", "请先登录"), 401);
  }
  const db = new Db(c.env.DB);
  const userId = session.user.id;
  const enrollmentYear = await ensureUserInitialized(db, userId, defaultEnrollmentYear(c.env.DEFAULT_ENROLLMENT_YEAR));
  c.set("ctx", { db, userId, enrollmentYear });
  c.set("user", { id: userId, email: session.user.email, name: session.user.name, emailVerified: session.user.emailVerified });
  await next();
});

api.get("/me", (c) => {
  const user = c.var.user;
  return ok(c, { ...user, enrollmentYear: c.var.ctx.enrollmentYear, isDemo: isDemoEmail(user.email) });
});

api.patch("/me", async (c) => {
  const body = await readJson(c);
  const year = expectNumber(body.enrollmentYear, "enrollmentYear", { min: 2000, max: 2100, integer: true })!;
  const { db, userId } = c.var.ctx;
  await db.run(
    "UPDATE user_profiles SET enrollment_year = ?, updated_at = datetime('now') WHERE user_id = ?",
    [year, userId]
  );
  rememberEnrollmentYear(userId, year);
  return ok(c, { ...c.var.user, enrollmentYear: year, isDemo: isDemoEmail(c.var.user.email) });
});

// 含冒号的批量动作要先注册，避免被 /courses/:code、/trash/:code 抢匹配。
registerTrashRoutes(api);
registerCourseBatchRoutes(api);
registerMetaRoutes(api);
registerRequirementRoutes(api);
registerProgressRoutes(api);
registerRawRoutes(api);
registerPlanRoutes(api);
registerStudyRecordRoutes(api);
registerCreditAssignmentRoutes(api);
registerCourseRoutes(api);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
