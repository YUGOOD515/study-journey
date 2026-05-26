import type {
  CategoryCode,
  CreditCountTo,
  PlanCustomCourse,
  PlanProgramCourse,
  ProgramRequirement,
  RequirementType,
  StudyStatus,
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

export type PlanCoursePatch = Partial<{
  planned_term: number | null;
  actual_term: number | null;
  study_status: StudyStatus;
  score: number | null;
  credit_count_to: CreditCountTo | null;
  note: string | null;
  preference_level: number | null;
}>;

export type CustomCourseCreate = {
  course_code: string;
  course_name: string;
  category_code: CategoryCode;
  requirement_type: RequirementType;
  credits: number;
  course_subcategory?: string | null;
  section_code?: string | null;
  term_number?: number | null;
  lecture_hours?: number;
  experiment_hours?: number;
  extra_hours?: number;
  prerequisite_course_code?: string | null;
  study_status?: StudyStatus;
  score?: number | null;
  credit_count_to?: CreditCountTo | null;
  note?: string | null;
};

export type CustomCoursePatch = Partial<Omit<CustomCourseCreate, "course_code">>;

export const api = {
  // ── 培养方案课程 ───────────────────────────
  planCourses: () => getJSON<PlanProgramCourse[]>("/api/plan-courses"),
  planCourse: (code: string) =>
    getJSON<PlanProgramCourse>(`/api/plan-courses/${encodeURIComponent(code)}`),
  patchPlanCourse: (code: string, patch: PlanCoursePatch) =>
    send<{ ok: true; changes: number }>(
      `/api/plan-courses/${encodeURIComponent(code)}`,
      "PATCH",
      patch
    ),

  // ── 自定义课程 ─────────────────────────────
  customCourses: () => getJSON<PlanCustomCourse[]>("/api/custom-courses"),
  customCourse: (code: string) =>
    getJSON<PlanCustomCourse>(`/api/custom-courses/${encodeURIComponent(code)}`),
  createCustomCourse: (input: CustomCourseCreate) =>
    send<{ ok: true; course_code: string; changes: number }>(
      "/api/custom-courses",
      "POST",
      input
    ),
  patchCustomCourse: (code: string, patch: CustomCoursePatch) =>
    send<{ ok: true; changes: number }>(
      `/api/custom-courses/${encodeURIComponent(code)}`,
      "PATCH",
      patch
    ),
  deleteCustomCourse: (code: string) =>
    send<{ ok: true; changes: number }>(
      `/api/custom-courses/${encodeURIComponent(code)}`,
      "DELETE"
    ),

  // ── 毕业要求 ───────────────────────────────
  programRequirements: () =>
    getJSON<ProgramRequirement[]>("/api/program-requirements"),

  // ── 删除（走垃圾篓）─────────────────────────
  deletePlanCourse: (code: string) =>
    send<{ ok: true }>(`/api/plan-courses/${encodeURIComponent(code)}`, "DELETE"),

  // ── 垃圾篓 ─────────────────────────────────
  trash: () => getJSON<TrashEntry[]>("/api/trash"),
  restoreTrash: (id: number) =>
    send<{ ok: true }>(`/api/trash/${id}/restore`, "POST"),
  permanentDeleteTrash: (id: number) =>
    send<{ ok: true }>(`/api/trash/${id}`, "DELETE"),
  emptyTrash: () =>
    send<{ ok: true; changes: number }>("/api/trash", "DELETE"),
};

export interface TrashEntry {
  id: number;
  source_table: "plan_program_courses" | "plan_custom_courses";
  course_code: string;
  course_name: string;
  deleted_at: string;
  snapshot: Record<string, unknown>;
}
