import type {
  CategoryCode,
  CourseWithCategory,
  CreditAssignment,
  PersonalPlanItem,
  PlanCoursePatch,
  ProgramRequirement,
  SemesterCourse,
  TrashItem,
} from "../types";

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function send<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
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
  trash: () => getJSON<TrashItem[]>("/api/trash"),

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
    is_interdisciplinary?: 0 | 1;
    assigned_to?: "interdisciplinary" | "elective";
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
      is_interdisciplinary: 0 | 1;
      assigned_to: "interdisciplinary" | "elective";
    }>
  ) =>
    send<{ ok: true }>(`/api/semester-courses/manual/${id}`, "PATCH", patch),

  deleteManual: (id: number) =>
    send<{ ok: true }>(`/api/semester-courses/manual/${id}`, "DELETE"),

  // ── 我的计划（不等于已修记录）────────────
  upsertPersonalOfficial: (input: {
    course_code: string;
    /** null = 放进"待安排"抽屉 */
    planned_term: number | null;
    note?: string | null;
  }) =>
    send<{
      ok: true;
      id: number | null;
      course_code: string;
      planned_term: number | null;
    }>("/api/personal-plan/official", "POST", input),

  resetPersonalOfficial: (course_code: string) =>
    send<{ ok: true; changes: number }>(
      `/api/personal-plan/official/${encodeURIComponent(course_code)}`,
      "DELETE"
    ),

  trashOfficial: (course_code: string) =>
    send<{ ok: true; changes: number }>(
      `/api/personal-plan/official/${encodeURIComponent(course_code)}/trash`,
      "DELETE"
    ),

  createPersonalManual: (input: {
    /** null = 放进"待安排"抽屉 */
    planned_term: number | null;
    course_name: string;
    credits: number;
    category_code: CategoryCode;
    course_nature: "必修" | "选修";
    note?: string | null;
    is_interdisciplinary?: 0 | 1;
    assigned_to?: "interdisciplinary" | "elective";
  }) =>
    send<{ ok: true; id: number }>(
      "/api/personal-plan/manual",
      "POST",
      input
    ),

  patchPersonalPlan: (
    id: number,
    patch: Partial<{
      /** null = 放进"待安排"抽屉 */
      planned_term: number | null;
      course_name: string;
      credits: number;
      category_code: CategoryCode;
      course_nature: "必修" | "选修";
      note: string | null;
      is_interdisciplinary: 0 | 1;
      assigned_to: "interdisciplinary" | "elective";
    }>
  ) => send<{ ok: true; id: number }>(`/api/personal-plan/${id}`, "PATCH", patch),

  deletePersonalPlan: (id: number) =>
    send<{ ok: true }>(`/api/personal-plan/${id}`, "DELETE"),

  // ── 垃圾篓 ────────────
  restoreTrashItem: (item: TrashItem) =>
    item.source === "program" && item.course_code
      ? send<{ ok: true; changes: number }>(
          `/api/trash/program/${encodeURIComponent(item.course_code)}/restore`,
          "POST"
        )
      : send<{ ok: true; changes: number }>(
          `/api/trash/custom/${encodeURIComponent(String(item.id))}/restore`,
          "POST"
        ),

  permanentlyDeleteTrashItem: (item: TrashItem) =>
    item.source === "program" && item.course_code
      ? send<{ ok: true; changes: number }>(
          `/api/trash/program/${encodeURIComponent(item.course_code)}`,
          "DELETE"
        )
      : send<{ ok: true; changes: number }>(
          `/api/trash/custom/${encodeURIComponent(String(item.id))}`,
          "DELETE"
        ),

  restoreAllTrash: () =>
    send<{ ok: true; changes: number }>("/api/trash/restore-all", "POST"),

  emptyTrash: () =>
    send<{ ok: true; changes: number }>("/api/trash/empty", "DELETE"),


  // ── 课程悬浮卡片轻量编辑 ─────────────
  updateProgramCourse: (course_code: string, patch: PlanCoursePatch) =>
    send<{ ok: true; changes: number }>(
      `/api/plan-courses/program/${encodeURIComponent(course_code)}`,
      "PATCH",
      patch
    ),

  updateCustomCourse: (id: number, patch: PlanCoursePatch) =>
    send<{ ok: true; changes: number }>(
      `/api/plan-courses/custom/${encodeURIComponent(String(id))}`,
      "PATCH",
      patch
    ),

  // ── 经法管融通学分归属覆盖 ────────────
  creditAssignments: () =>
    getJSON<CreditAssignment[]>("/api/credit-assignments"),

  setCreditAssignment: (
    course_code: string,
    assigned_to: "interdisciplinary" | "elective"
  ) =>
    send<{ ok: true }>(
      `/api/credit-assignments/${encodeURIComponent(course_code)}`,
      "PUT",
      { assigned_to }
    ),

  resetCreditAssignment: (course_code: string) =>
    send<{ ok: true }>(
      `/api/credit-assignments/${encodeURIComponent(course_code)}`,
      "DELETE"
    ),
};
