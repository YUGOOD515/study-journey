import type { Db } from "../db";

/** 每个 isolate 内已确认初始化过的用户（短时缓存），避免每个请求都查一次。 */
const CACHE_TTL_MS = 60_000;
const initialized = new Map<string, { year: number; at: number }>();

function cacheGet(userId: string): number | undefined {
  const hit = initialized.get(userId);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    initialized.delete(userId);
    return undefined;
  }
  return hit.year;
}

function cacheSet(userId: string, year: number) {
  if (initialized.size > 5000) initialized.clear();
  initialized.set(userId, { year, at: Date.now() });
}

export function defaultEnrollmentYear(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : 2024;
}

/**
 * 读取用户档案；首次访问时创建档案并把官方培养方案复制到「我的计划」：
 * official_term 是 1–8 的课程默认放进对应学期（计划修读），其他课程保持未修读。
 * 全部语句在一个 batch 里执行，并发请求靠 INSERT OR IGNORE 去重。
 */
export async function ensureUserInitialized(db: Db, userId: string, fallbackYear: number): Promise<number> {
  const cached = cacheGet(userId);
  if (cached !== undefined) return cached;

  const existing = await db.first<{ enrollment_year: number }>(
    "SELECT enrollment_year FROM user_profiles WHERE user_id = ?",
    [userId]
  );
  if (existing) {
    cacheSet(userId, existing.enrollment_year);
    return existing.enrollment_year;
  }

  await db.d1.batch([
    db.prepare(
      `INSERT OR IGNORE INTO user_profiles(user_id, enrollment_year, initialized_at)
       VALUES (?, ?, datetime('now'))`,
      [userId, fallbackYear]
    ),
    db.prepare(
      `INSERT OR IGNORE INTO my_plan_courses(
          user_id, origin_type, official_course_code, category_code, category_name, requirement_type,
          course_subcategory, course_code, section_code, course_name, official_term, planned_term,
          actual_term, credits, total_hours, lecture_hours, experiment_hours, extra_hours,
          prerequisite_course_code, study_status, score, credit_count_to
       )
       SELECT
          ?, 'official', p.course_code, p.category_code, p.category_name, p.requirement_type,
          p.course_subcategory, p.course_code, p.section_code, p.course_name, p.official_term,
          CASE WHEN p.official_term GLOB '[1-8]' THEN CAST(p.official_term AS INTEGER) END,
          NULL, p.credits, p.total_hours, p.lecture_hours, p.experiment_hours, p.extra_hours,
          p.prerequisite_course_code,
          CASE WHEN p.official_term GLOB '[1-8]' THEN '计划修读' ELSE '未修读' END,
          NULL,
          CASE WHEN p.requirement_type = '经法管融通' THEN COALESCE(p.credit_count_to, '通识教育-选修') END
         FROM plan_program_courses p
        WHERE p.is_permanently_deleted = 0`,
      [userId]
    ),
  ]);

  const row = await db.first<{ enrollment_year: number }>(
    "SELECT enrollment_year FROM user_profiles WHERE user_id = ?",
    [userId]
  );
  const year = row?.enrollment_year ?? fallbackYear;
  cacheSet(userId, year);
  return year;
}

export function rememberEnrollmentYear(userId: string, year: number) {
  cacheSet(userId, year);
}

