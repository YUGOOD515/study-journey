import type {
  CategoryCode,
  CourseWithCategory,
  PersonalPlanItem,
  ProgramRequirement,
  SemesterCourse,
} from "../types";

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function send<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${method} ${path} → HTTP ${r.status} ${text}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  coursesWithCategory: () =>
    getJSON<CourseWithCategory[]>("/api/courses-with-category"),
  programRequirements: () =>
    getJSON<ProgramRequirement[]>("/api/program-requirements"),
  semesterCourses: () =>
    getJSON<SemesterCourse[]>("/api/semester-courses"),
  personalPlan: () =>
    getJSON<PersonalPlanItem[]>("/api/personal-plan"),

  // ── 官方课（培养方案内）────────────
  upsertOfficial: (input: {
    term_number: number;
    course_code: string;
    score?: number | null;
  }) => send<{ ok: true }>("/api/semester-courses/official", "POST", input),

  patchOfficial: (
    course_code: string,
    patch: { term_number?: number; score?: number | null }
  ) =>
    send<{ ok: true }>(
      `/api/semester-courses/official/${encodeURIComponent(course_code)}`,
      "PATCH",
      patch
    ),

  deleteOfficial: (course_code: string) =>
    send<{ ok: true }>(
      `/api/semester-courses/official/${encodeURIComponent(course_code)}`,
      "DELETE"
    ),

  // ── 手动课（培养方案外）────────────
  createManual: (input: {
    term_number: number;
    course_name: string;
    credits: number;
    category_code: CategoryCode;
    course_nature: "必修" | "选修";
    score?: number | null;
    note?: string | null;
  }) =>
    send<{ ok: true; id: number }>(
      "/api/semester-courses/manual",
      "POST",
      input
    ),

  patchManual: (
    id: number,
    patch: Partial<{
      term_number: number;
      course_name: string;
      credits: number;
      category_code: CategoryCode;
      course_nature: "必修" | "选修";
      score: number | null;
      note: string | null;
    }>
  ) =>
    send<{ ok: true }>(`/api/semester-courses/manual/${id}`, "PATCH", patch),

  deleteManual: (id: number) =>
    send<{ ok: true }>(`/api/semester-courses/manual/${id}`, "DELETE"),

  // ── 我的计划（不等于已修记录）────────────
  upsertPersonalOfficial: (input: {
    course_code: string;
    planned_term: number;
    note?: string | null;
  }) =>
    send<{ ok: true; id: number | null; course_code: string; planned_term: number }>(
      "/api/personal-plan/official",
      "POST",
      input
    ),

  resetPersonalOfficial: (course_code: string) =>
    send<{ ok: true; changes: number }>(
      `/api/personal-plan/official/${encodeURIComponent(course_code)}`,
      "DELETE"
    ),

  createPersonalManual: (input: {
    planned_term: number;
    course_name: string;
    credits: number;
    category_code: CategoryCode;
    course_nature: "必修" | "选修";
    note?: string | null;
  }) =>
    send<{ ok: true; id: number }>(
      "/api/personal-plan/manual",
      "POST",
      input
    ),

  patchPersonalPlan: (
    id: number,
    patch: Partial<{
      planned_term: number;
      course_name: string;
      credits: number;
      category_code: CategoryCode;
      course_nature: "必修" | "选修";
      note: string | null;
    }>
  ) => send<{ ok: true; id: number }>(`/api/personal-plan/${id}`, "PATCH", patch),

  deletePersonalPlan: (id: number) =>
    send<{ ok: true }>(`/api/personal-plan/${id}`, "DELETE"),
};
