import { createAuth } from "../auth";
import { Db } from "../db";
import type { Env } from "../env";
import { ensureUserInitialized } from "../lib/user-init";
import demoData from "./demo-data.json";

/**
 * 示例模式：为访客创建一个临时账号，并写入一套完整的演示数据（8 个学期的计划、成绩、课表）。
 *
 * - 临时账号走正常的 Better Auth 会话，所有页面和接口与真实账号完全一致，访客可以随意编辑。
 * - 邮箱固定为 demo-<uuid>@demo.invalid（.invalid 是保留域名，永远收不到邮件），据此识别示例账号。
 * - 创建 24 小时后在下一次有人进入示例时自动清除；同一 IP 每小时最多创建 DEMO_RATE_MAX 个。
 * - 数据来源与生成规则见 scripts/build_demo_data.py。
 */

export const DEMO_EMAIL_DOMAIN = "@demo.invalid";
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
const DEMO_RATE_WINDOW_MS = 60 * 60 * 1000;
const DEMO_RATE_MAX = 10;
/** 同时存在的示例账号上限，防止被刷爆数据库。 */
const DEMO_ACTIVE_MAX = 300;

export function isDemoEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN));
}

type DemoCourse = (typeof demoData.courses)[number] & Partial<{
  section: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  requirementType: string;
  subcategory: string | null;
  credits: number;
  lectureHours: number;
  experimentHours: number;
  extraHours: number;
  creditCountTo: string | null;
}>;

export class DemoError extends Error {
  constructor(message: string, readonly status: 429 | 503) {
    super(message);
  }
}

/** 北京时间的“当前学年”起始年份与是否秋季学期（8 月–次年 1 月为秋季）。 */
function academicNow(now: Date) {
  const cn = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const month = cn.getUTCMonth() + 1;
  const year = cn.getUTCFullYear();
  const academicStart = month >= 8 ? year : year - 1;
  const isFall = month >= 8 || month <= 1;
  return { academicStart, isFall };
}

/** 让示例同学永远处在大三：秋季是第 5 学期，春季是第 6 学期。 */
export function demoTimeline(now = new Date()) {
  const { academicStart, isFall } = academicNow(now);
  const enrollmentYear = academicStart - 2;
  const currentTerm = isFall ? 5 : 6;
  return { enrollmentYear, currentTerm };
}

function termToSemester(enrollmentYear: number, term: number) {
  const start = enrollmentYear + Math.floor((term - 1) / 2);
  return { academicYear: `${start}-${start + 1}`, semester: term % 2 === 1 ? "fall" : "spring" };
}

async function checkRateLimit(db: Db, ip: string): Promise<void> {
  const key = `demo:${ip}`;
  const now = Date.now();
  const row = await db.first<{ count: number; lastRequest: number }>(
    `SELECT "count", "lastRequest" FROM "rateLimit" WHERE "key" = ?`,
    [key]
  );
  if (!row || now - Number(row.lastRequest) > DEMO_RATE_WINDOW_MS) {
    await db.run(
      `INSERT INTO "rateLimit"("id", "key", "count", "lastRequest") VALUES (?, ?, 1, ?)
       ON CONFLICT("key") DO UPDATE SET "count" = 1, "lastRequest" = excluded."lastRequest"`,
      [key, key, now]
    );
    return;
  }
  if (row.count >= DEMO_RATE_MAX) {
    throw new DemoError("示例账号创建太频繁，请稍后再试", 429);
  }
  await db.run(`UPDATE "rateLimit" SET "count" = "count" + 1 WHERE "key" = ?`, [key]);
}

/** 删除超过 24 小时的示例账号（及其全部数据）。 */
export async function cleanupExpiredDemoUsers(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - DEMO_TTL_MS).toISOString();
  const expired = `SELECT "id" FROM "user" WHERE "email" LIKE '%${DEMO_EMAIL_DOMAIN}' AND "createdAt" < ? LIMIT 100`;
  const ids = (await db.all<{ id: string }>(expired, [cutoff])).map((r) => r.id);
  if (ids.length === 0) return 0;
  const marks = ids.map(() => "?").join(",");
  await db.d1.batch([
    db.prepare(`DELETE FROM user_course_meetings WHERE user_id IN (${marks})`, ids),
    db.prepare(`DELETE FROM my_plan_courses WHERE user_id IN (${marks})`, ids),
    db.prepare(`DELETE FROM user_requirement_overrides WHERE user_id IN (${marks})`, ids),
    db.prepare(`DELETE FROM user_profiles WHERE user_id IN (${marks})`, ids),
    db.prepare(`DELETE FROM "session" WHERE "userId" IN (${marks})`, ids),
    db.prepare(`DELETE FROM "account" WHERE "userId" IN (${marks})`, ids),
    db.prepare(`DELETE FROM "user" WHERE "id" IN (${marks})`, ids),
  ]);
  return ids.length;
}

/** 每个学期对应的导入批次（决定课表页显示的学年）；没有对应学年的批次时补一条示例批次。 */
async function resolveBatches(db: Db, enrollmentYear: number): Promise<Map<number, number>> {
  const phaseRank: Record<string, number> = { actual_schedule: 0, final: 1, beginning_add: 2 };
  const load = () =>
    db.all<{ id: number; academic_year: string; semester: string; phase: string }>(
      "SELECT id, academic_year, semester, phase FROM raw_import_batches"
    );
  const pick = (rows: Awaited<ReturnType<typeof load>>) => {
    const map = new Map<number, number>();
    for (let term = 1; term <= 8; term++) {
      const { academicYear, semester } = termToSemester(enrollmentYear, term);
      const best = rows
        .filter((r) => r.academic_year === academicYear && r.semester === semester)
        .sort((a, b) => (phaseRank[a.phase] ?? 9) - (phaseRank[b.phase] ?? 9) || a.id - b.id)[0];
      if (best) map.set(term, best.id);
    }
    return map;
  };

  let map = pick(await load());
  const missing = Array.from({ length: 8 }, (_, i) => i + 1).filter((t) => !map.has(t));
  if (missing.length > 0) {
    await db.d1.batch(
      missing.map((term) => {
        const { academicYear, semester } = termToSemester(enrollmentYear, term);
        return db.prepare(
          `INSERT INTO raw_import_batches(academic_year, semester, phase, source_file, note)
           SELECT ?, ?, 'actual_schedule', 'demo', '示例模式：合成课表'
            WHERE NOT EXISTS (SELECT 1 FROM raw_import_batches WHERE academic_year = ? AND semester = ?)`,
          [academicYear, semester, academicYear, semester]
        );
      })
    );
    map = pick(await load());
  }
  return map;
}

/** 写入示例数据：官方课程按示例安排落位，追加自定义课程与课表。 */
export async function seedDemoData(db: Db, userId: string, now = new Date()): Promise<void> {
  const { enrollmentYear, currentTerm } = demoTimeline(now);
  await ensureUserInitialized(db, userId, enrollmentYear);
  const batches = await resolveBatches(db, enrollmentYear);

  const status = (term: number) => {
    if (term < currentTerm) return { status: "已修读", actual: term, scored: true };
    if (term === currentTerm) return { status: "正在修读", actual: term, scored: false };
    return { status: "计划修读", actual: null, scored: false };
  };

  const courses = demoData.courses as DemoCourse[];
  const official = courses
    .filter((c) => c.origin === "official")
    .map((c) => {
      const s = status(c.term);
      return { code: c.code, term: c.term, actual: s.actual, status: s.status, score: s.scored ? c.score : null };
    });
  const custom = courses
    .filter((c) => c.origin !== "official")
    .map((c) => {
      const s = status(c.term);
      return {
        origin: c.origin,
        code: c.code,
        section: c.section ?? null,
        name: c.name,
        categoryCode: c.categoryCode,
        categoryName: c.categoryName,
        requirementType: c.requirementType,
        subcategory: c.subcategory ?? null,
        term: c.term,
        actual: s.actual,
        status: s.status,
        score: s.scored ? c.score : null,
        credits: c.credits,
        lecture: c.lectureHours ?? 0,
        experiment: c.experimentHours ?? 0,
        extra: c.extraHours ?? 0,
        creditCountTo: c.creditCountTo ?? null,
      };
    });
  const meetings = demoData.meetings
    .filter((m) => batches.has(m.term))
    .map((m, i) => ({ ...m, batch: batches.get(m.term)!, row: i + 1 }));

  const j = (path: string) => `json_extract(value, '$.${path}')`;
  await db.d1.batch([
    db.prepare(
      `UPDATE my_plan_courses
          SET planned_term = NULL, actual_term = NULL, study_status = '未修读', score = NULL,
              updated_at = datetime('now')
        WHERE user_id = ? AND origin_type = 'official'`,
      [userId]
    ),
    db.prepare(
      `UPDATE my_plan_courses AS p
          SET planned_term = d.term, actual_term = d.actual, study_status = d.status, score = d.score,
              updated_at = datetime('now')
         FROM (SELECT ${j("code")} AS code, ${j("term")} AS term, ${j("actual")} AS actual,
                      ${j("status")} AS status, ${j("score")} AS score
                 FROM json_each(?)) AS d
        WHERE p.user_id = ? AND p.course_code = d.code`,
      [JSON.stringify(official), userId]
    ),
    db.prepare(
      `INSERT OR IGNORE INTO my_plan_courses(
          user_id, origin_type, category_code, category_name, requirement_type, course_subcategory,
          course_code, section_code, course_name, planned_term, actual_term, credits,
          total_hours, lecture_hours, experiment_hours, extra_hours, study_status, score, credit_count_to, note
       )
       SELECT ?, ${j("origin")}, ${j("categoryCode")}, ${j("categoryName")}, ${j("requirementType")},
              ${j("subcategory")}, ${j("code")}, ${j("section")}, ${j("name")}, ${j("term")}, ${j("actual")},
              ${j("credits")}, ${j("lecture")} + ${j("experiment")} + ${j("extra")},
              ${j("lecture")}, ${j("experiment")}, ${j("extra")}, ${j("status")}, ${j("score")},
              ${j("creditCountTo")}, '示例数据'
         FROM json_each(?)`,
      [userId, JSON.stringify(custom)]
    ),
    db.prepare(
      `INSERT OR IGNORE INTO user_course_meetings(
          user_id, batch_id, term, course_code, section_code, meeting_no, start_week, end_week,
          weekday, start_period, end_period, location_text, course_name, teacher,
          course_nature, course_attribute, location_raw, source_sheet, source_row
       )
       SELECT ?, ${j("batch")}, ${j("term")}, ${j("code")}, ${j("section")}, ${j("no")},
              ${j("startWeek")}, ${j("endWeek")}, ${j("weekday")}, ${j("startPeriod")}, ${j("endPeriod")},
              ${j("location")}, ${j("name")}, ${j("teacher")}, ${j("nature")}, ${j("attribute")},
              ${j("location")}, 'demo', ${j("row")}
         FROM json_each(?)`,
      [userId, JSON.stringify(meetings)]
    ),
  ]);
}

/**
 * 创建示例账号并返回带会话 Cookie 的响应头。
 * 用一份关闭了邮件与人机验证的 auth 配置注册：示例邮箱不会收到任何邮件。
 */
export async function createDemoSession(env: Env, request: Request): Promise<Headers> {
  const db = new Db(env.DB);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  await checkRateLimit(db, ip);
  await cleanupExpiredDemoUsers(db);

  const active = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM "user" WHERE "email" LIKE '%${DEMO_EMAIL_DOMAIN}'`
  );
  if ((active?.n ?? 0) >= DEMO_ACTIVE_MAX) {
    throw new DemoError("示例名额暂时已满，请稍后再试或直接注册", 503);
  }

  const quietEnv: Env = { ...env, RESEND_API_KEY: undefined, MAIL_FROM: undefined, TURNSTILE_SECRET_KEY: undefined };
  const auth = createAuth(quietEnv, request);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const password = `${crypto.randomUUID()}${crypto.randomUUID()}`.slice(0, 64);
  const res = await auth.api.signUpEmail({
    body: { email: `demo-${id}${DEMO_EMAIL_DOMAIN}`, password, name: "示例同学" },
    headers: request.headers,
    asResponse: true,
  });
  if (!res.ok) throw new Error(`demo sign-up failed: HTTP ${res.status}`);
  const body = (await res.json()) as { user?: { id?: string } };
  const userId = body.user?.id;
  if (!userId) throw new Error("demo sign-up returned no user");

  await seedDemoData(db, userId);

  const headers = new Headers();
  for (const cookie of res.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return headers;
}
