import type {
  CategoryCode,
  ActualCourseMeeting,
  Course,
  CourseNature,
  CreditAssignmentTarget,
  CreditCountTo,
  PlanCoursePatch,
  ProgressResponse,
  RawCourseSearchResult,
  RequirementType,
  StudyStatus,
} from "../types";
import { UNAUTHORIZED_EVENT } from "./auth";

type LegacyManualPatch = PlanCoursePatch & { term_number?: number | null };

interface ApiEnvelope<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface RequirementDto {
  categoryCode: string;
  categoryName: string;
  requirementTypeCode: "required" | "elective" | "interdisciplinary";
  requirementName: string;
  requiredCredits: number;
  source: string | null;
  note: string | null;
}

const courseCacheByCode = new Map<string, Course>();

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const r = await fetch(path, { credentials: "same-origin", ...options });
  const text = await r.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (r.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!r.ok) {
    const err = body as ApiErrorEnvelope | null;
    const message =
      err && err.ok === false
        ? `${err.error.code}: ${err.error.message}`
        : `${options.method ?? "GET"} ${path} → HTTP ${r.status} ${text}`;
    throw new Error(message);
  }

  if (body && typeof body === "object" && "ok" in body) {
    const envelope = body as ApiEnvelope<T>;
    return envelope.data;
  }
  return body as T;
}

function getJSON<T>(path: string): Promise<T> {
  return request<T>(path);
}

async function send<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  return request<T>(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function rememberCourse(course: Course): Course {
  courseCacheByCode.set(course.courseCode, course);
  return course;
}

function rememberCourses(courses: Course[]): Course[] {
  courses.forEach(rememberCourse);
  return courses;
}

async function fetchCourses(query = "limit=1000"): Promise<Course[]> {
  const data = await getJSON<Course[]>(`/api/courses?${query}`);
  return rememberCourses(data);
}

async function getCourse(code: string): Promise<Course> {
  const cached = courseCacheByCode.get(code);
  if (cached) return cached;
  const course = await getJSON<Course>(`/api/courses/${encodeURIComponent(code)}`);
  return rememberCourse(course);
}

function visibleNature(requirementType: RequirementType): CourseNature {
  return requirementType === "经法管融通" ? "选修" : requirementType;
}

function assignmentToCreditCountTo(
  assignedTo: CreditAssignmentTarget | undefined | null
): CreditCountTo {
  return assignedTo === "elective" ? "通识教育-选修" : "大类平台-选修";
}

function toCreateCustomBody(input: {
  course_code?: string | null;
  planned_term?: number | null;
  term_number?: number | null;
  course_name: string;
  credits: number;
  category_code: CategoryCode;
  course_nature: CourseNature;
  lecture_hours?: number;
  experiment_hours?: number;
  extra_hours?: number;
  prerequisite_course_code?: string | null;
  note?: string | null;
  is_interdisciplinary?: 0 | 1;
  assigned_to?: CreditAssignmentTarget;
}) {
  const lectureHours = input.lecture_hours ?? 0;
  const experimentHours = input.experiment_hours ?? 0;
  const extraHours = input.extra_hours ?? 0;
  const isInter = input.is_interdisciplinary === 1;
  return {
    courseCode: input.course_code?.trim() || null,
    courseName: input.course_name,
    categoryCode: input.category_code,
    requirementType: (isInter ? "经法管融通" : input.course_nature) as RequirementType,
    courseSubcategory: isInter ? `${categoryName(input.category_code)}（经法管融通）` : null,
    credits: input.credits,
    totalHours: lectureHours + experimentHours + extraHours,
    lectureHours,
    experimentHours,
    extraHours,
    plannedTerm: input.planned_term ?? input.term_number ?? null,
    creditCountTo: isInter ? assignmentToCreditCountTo(input.assigned_to) : null,
    prerequisiteCourseCode: input.prerequisite_course_code ?? null,
    note: input.note ?? null,
  };
}

function categoryName(code: CategoryCode): string {
  const names: Record<CategoryCode, string> = {
    general_education: "通识教育",
    major_platform: "大类平台",
    professional_education: "专业教育",
    quality_education: "素质教育",
    practice_education: "实践教育",
  };
  return names[code];
}

function toCoursePatch(patch: PlanCoursePatch, existing?: Course): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.course_name !== undefined) body.courseName = patch.course_name;
  if (patch.category_code !== undefined) body.categoryCode = patch.category_code;
  if (patch.course_nature !== undefined || patch.is_interdisciplinary !== undefined) {
    const isInter = patch.is_interdisciplinary === 1;
    body.requirementType = isInter ? "经法管融通" : patch.course_nature ?? visibleNature(existing?.requirementType ?? "选修");
    body.courseSubcategory = isInter
      ? `${categoryName((patch.category_code ?? existing?.categoryCode ?? "general_education") as CategoryCode)}（经法管融通）`
      : null;
    body.creditCountTo = isInter ? assignmentToCreditCountTo(patch.assigned_to) : null;
  } else if (patch.assigned_to !== undefined && existing?.requirementType === "经法管融通") {
    body.creditCountTo = assignmentToCreditCountTo(patch.assigned_to);
  }
  if (patch.credits !== undefined) body.credits = patch.credits;

  const hasHours =
    patch.lecture_hours !== undefined ||
    patch.experiment_hours !== undefined ||
    patch.extra_hours !== undefined;
  if (hasHours) {
    const lectureHours = patch.lecture_hours ?? existing?.lectureHours ?? 0;
    const experimentHours = patch.experiment_hours ?? existing?.experimentHours ?? 0;
    const extraHours = patch.extra_hours ?? existing?.extraHours ?? 0;
    body.lectureHours = lectureHours;
    body.experimentHours = experimentHours;
    body.extraHours = extraHours;
    body.totalHours = lectureHours + experimentHours + extraHours;
  }

  if (patch.prerequisite_course_code !== undefined) {
    body.prerequisiteCourseCode = patch.prerequisite_course_code;
  }
  if (patch.note !== undefined) body.note = patch.note;
  return body;
}

function hasFieldPatch(body: Record<string, unknown>) {
  return Object.keys(body).length > 0;
}

async function applyStatePatch(code: string, patch: PlanCoursePatch): Promise<Course | null> {
  if (patch.score === undefined && patch.planned_term === undefined) return null;

  const course = await getCourse(code);
  const term = patch.planned_term !== undefined
    ? patch.planned_term
    : course.actualTerm ?? course.plannedTerm;

  if (patch.score !== undefined) {
    if (term == null) {
      throw new Error("填写或修改成绩前，需要先设置课程学期");
    }
    const studyStatus: StudyStatus =
      patch.score == null ? "正在修读" : patch.score >= 60 ? "已修读" : "未通过";
    const updated = await send<Course>(
      `/api/courses/${encodeURIComponent(code)}/study-record`,
      "POST",
      { studyStatus, term, score: patch.score ?? null }
    );
    return rememberCourse(updated);
  }

  const updated = await send<Course>(
    course.studyStatus === "正在修读" ||
      course.studyStatus === "已修读" ||
      course.studyStatus === "未通过"
      ? `/api/courses/${encodeURIComponent(code)}/study-record`
      : `/api/courses/${encodeURIComponent(code)}/plan`,
    "POST",
    course.studyStatus === "正在修读" ||
      course.studyStatus === "已修读" ||
      course.studyStatus === "未通过"
      ? { studyStatus: course.studyStatus, term, score: course.score }
      : { term }
  );
  return rememberCourse(updated);
}

async function updateCourse(code: string, patch: PlanCoursePatch): Promise<Course> {
  const existing = await getCourse(code);
  const fieldPatch = toCoursePatch(patch, existing);
  let latest = existing;
  if (hasFieldPatch(fieldPatch)) {
    latest = rememberCourse(
      await send<Course>(`/api/courses/${encodeURIComponent(code)}`, "PATCH", fieldPatch)
    );
  }
  const stateUpdated = await applyStatePatch(code, patch);
  return stateUpdated ?? latest;
}

export const api = {
  coursesWithCategory: async (): Promise<Course[]> => {
    return fetchCourses("source=program&limit=1000");
  },

  programRequirements: async (): Promise<RequirementDto[]> => {
    return getJSON<RequirementDto[]>("/api/requirements");
  },

  /** 进度/学分统计的唯一真相源（后端计算，详见 docs/16）。 */
  progress: async (): Promise<ProgressResponse> => {
    return getJSON<ProgressResponse>("/api/progress");
  },

  /** 把课程号直接返回（不再合成 number id，统一使用 courseCode 寻址）。 */
  idForCourse: (courseCode: string, _source: "program" | "custom"): string => courseCode,

  semesterCourses: async (): Promise<Course[]> => {
    const courses = await fetchCourses("status=正在修读,已修读,未通过&limit=1000");
    return courses.filter((c) => (c.actualTerm ?? c.plannedTerm) != null);
  },

  personalPlan: async (): Promise<Course[]> => {
    return fetchCourses("limit=1000");
  },

  trash: async (): Promise<Course[]> => {
    const courses = await getJSON<Course[]>("/api/trash");
    return rememberCourses(courses);
  },

  upsertOfficial: async (input: {
    term_number: number;
    course_code: string;
    score?: number | null;
  }) => {
    const studyStatus: StudyStatus =
      input.score == null ? "正在修读" : input.score >= 60 ? "已修读" : "未通过";
    const course = await send<Course>(
      `/api/courses/${encodeURIComponent(input.course_code)}/study-record`,
      "POST",
      { studyStatus, term: input.term_number, score: input.score ?? null }
    );
    rememberCourse(course);
    return { ok: true as const };
  },

  patchOfficial: async (
    course_code: string,
    patch: { term_number?: number; score?: number | null }
  ) => {
    const course = await getCourse(course_code);
    const term = patch.term_number ?? course.actualTerm ?? course.plannedTerm;
    if (term == null) throw new Error("修改修读记录前，需要先设置课程学期");
    const score = patch.score !== undefined ? patch.score : course.score;
    const studyStatus: StudyStatus =
      score == null ? "正在修读" : score >= 60 ? "已修读" : "未通过";
    const updated = await send<Course>(
      `/api/courses/${encodeURIComponent(course_code)}/study-record`,
      "POST",
      { studyStatus, term, score: score ?? null }
    );
    rememberCourse(updated);
    return { ok: true as const };
  },

  deleteOfficial: async (course_code: string) => {
    const course = await send<Course>(
      `/api/courses/${encodeURIComponent(course_code)}/study-record?fallback=plan`,
      "DELETE"
    );
    rememberCourse(course);
    return { ok: true as const };
  },

  createManual: async (input: {
    term_number: number;
    course_code?: string | null;
    course_name: string;
    credits: number;
    category_code: CategoryCode;
    course_nature: CourseNature;
    lecture_hours?: number;
    experiment_hours?: number;
    extra_hours?: number;
    prerequisite_course_code?: string | null;
    score?: number | null;
    note?: string | null;
    is_interdisciplinary?: 0 | 1;
    assigned_to?: CreditAssignmentTarget;
  }) => {
    const created = rememberCourse(await send<Course>("/api/courses", "POST", toCreateCustomBody(input)));
    const score = input.score ?? null;
    const studyStatus: StudyStatus = score == null ? "正在修读" : score >= 60 ? "已修读" : "未通过";
    rememberCourse(
      await send<Course>(
        `/api/courses/${encodeURIComponent(created.courseCode)}/study-record`,
        "POST",
        { studyStatus, term: input.term_number, score }
      )
    );
    return { ok: true as const, courseCode: created.courseCode };
  },

  patchManual: async (courseCode: string, patch: LegacyManualPatch) => {
    await updateCourse(courseCode, {
      ...patch,
      planned_term: patch.planned_term ?? patch.term_number,
    });
    return { ok: true as const };
  },

  deleteManual: async (courseCode: string) => {
    rememberCourse(
      await send<Course>(`/api/courses/${encodeURIComponent(courseCode)}/trash`, "POST", {
        note: "手动课程移入垃圾篓",
      })
    );
    return { ok: true as const };
  },

  upsertPersonalOfficial: async (input: {
    course_code: string;
    planned_term: number | null;
    note?: string | null;
  }) => {
    const course = await send<Course>(
      `/api/courses/${encodeURIComponent(input.course_code)}/plan`,
      "POST",
      { term: input.planned_term, note: input.note ?? null }
    );
    rememberCourse(course);
    return {
      ok: true as const,
      course_code: input.course_code,
      planned_term: input.planned_term,
    };
  },

  resetPersonalOfficial: async (course_code: string) => {
    const course = await send<Course>(
      `/api/courses/${encodeURIComponent(course_code)}/plan`,
      "DELETE"
    );
    rememberCourse(course);
    return { ok: true as const, changes: 1 };
  },

  trashOfficial: async (course_code: string) => {
    const course = await send<Course>(
      `/api/courses/${encodeURIComponent(course_code)}/trash`,
      "POST",
      { note: "培养方案课程移入垃圾篓" }
    );
    rememberCourse(course);
    return { ok: true as const, changes: 1 };
  },

  createPersonalManual: async (input: {
    planned_term: number | null;
    course_code?: string | null;
    course_name: string;
    credits: number;
    category_code: CategoryCode;
    course_nature: CourseNature;
    lecture_hours?: number;
    experiment_hours?: number;
    extra_hours?: number;
    prerequisite_course_code?: string | null;
    score?: number | null;
    note?: string | null;
    is_interdisciplinary?: 0 | 1;
    assigned_to?: CreditAssignmentTarget;
  }) => {
    const created = rememberCourse(await send<Course>("/api/courses", "POST", toCreateCustomBody(input)));
    if (input.score != null) {
      const term = input.planned_term;
      if (term == null) throw new Error("填写成绩的手动课程必须设置学期");
      rememberCourse(
        await send<Course>(
          `/api/courses/${encodeURIComponent(created.courseCode)}/study-record`,
          "POST",
          { studyStatus: input.score >= 60 ? "已修读" : "未通过", term, score: input.score }
        )
      );
    } else {
      rememberCourse(
        await send<Course>(
          `/api/courses/${encodeURIComponent(created.courseCode)}/plan`,
          "POST",
          { term: input.planned_term }
        )
      );
    }
    return { ok: true as const, courseCode: created.courseCode };
  },

  searchRawCourses: async (input: {
    q?: string;
    term?: number | null;
    source?: "all" | "section" | "added";
    limit?: number;
  } = {}) => {
    const params = new URLSearchParams();
    if (input.q?.trim()) params.set("q", input.q.trim());
    if (input.term != null) params.set("term", String(input.term));
    params.set("source", input.source ?? "all");
    params.set("limit", String(input.limit ?? 40));
    return getJSON<RawCourseSearchResult[]>(`/api/raw/course-search?${params.toString()}`);
  },

  createPersonalFromRaw: async (input: {
    sourceType: "section" | "added";
    batchId: number;
    sourceRow: number;
    courseCode: string;
    courseName: string;
    sectionCode: string | null;
    existsInProgram: boolean;
    existsInCustom: boolean;
    termNumber: number;
    categoryCode: CategoryCode;
    courseNature: CourseNature;
    isInterdisciplinary: boolean;
    assignedTo: CreditAssignmentTarget;
    credits: number;
    totalHours: number;
    lectureHours: number;
    experimentHours: number;
    extraHours: number;
    studyStatus: StudyStatus;
    score: number | null;
    note?: string | null;
  }) => {
    const created = rememberCourse(
      await send<Course>("/api/courses/from-raw", "POST", input)
    );
    return { ok: true as const, courseCode: created.courseCode };
  },

  patchPersonalPlan: async (courseCode: string, patch: PlanCoursePatch) => {
    await updateCourse(courseCode, patch);
    return { ok: true as const, courseCode };
  },

  deletePersonalPlan: async (courseCode: string) => {
    rememberCourse(
      await send<Course>(`/api/courses/${encodeURIComponent(courseCode)}/trash`, "POST", {
        note: "计划课程移入垃圾篓",
      })
    );
    return { ok: true as const };
  },

  restoreTrashItem: async (item: Course) => {
    const code = item.courseCode;
    const course = await send<Course>(
      `/api/trash/${encodeURIComponent(code)}/restore`,
      "POST"
    );
    rememberCourse(course);
    return { ok: true as const, changes: 1 };
  },

  permanentlyDeleteTrashItem: async (item: Course) => {
    const code = item.courseCode;
    await send<{ courseCode: string; source: string; status: string }>(
      `/api/trash/${encodeURIComponent(code)}`,
      "DELETE"
    );
    return { ok: true as const, changes: 1 };
  },

  restoreAllTrash: async () => {
    const result = await send<{ restored: number }>("/api/trash:restore-all", "POST");
    return { ok: true as const, changes: result.restored };
  },

  emptyTrash: async () => {
    const result = await send<{ purged: number }>("/api/trash:empty", "DELETE");
    return { ok: true as const, changes: result.purged };
  },

  updateProgramCourse: async (course_code: string, patch: PlanCoursePatch) => {
    await updateCourse(course_code, patch);
    return { ok: true as const, changes: 1 };
  },

  updateCustomCourse: async (courseCode: string, patch: PlanCoursePatch) => {
    await updateCourse(courseCode, patch);
    return { ok: true as const, changes: 1 };
  },

  setCreditAssignment: async (
    course_code: string,
    assigned_to: CreditAssignmentTarget
  ) => {
    const course = await send<Course>(
      `/api/courses/${encodeURIComponent(course_code)}/credit-assignment`,
      "POST",
      { creditCountTo: assignmentToCreditCountTo(assigned_to) }
    );
    rememberCourse(course);
    return { ok: true as const };
  },

  resetCreditAssignment: async (course_code: string) => {
    const course = await send<Course>(
      `/api/courses/${encodeURIComponent(course_code)}/credit-assignment`,
      "DELETE"
    );
    rememberCourse(course);
    return { ok: true as const };
  },

  actualCourseMeetings: async (input: {
    term?: number;
    week?: number;
    weekday?: number;
    courseCode?: string;
    limit?: number;
  } = {}) => {
    const params = new URLSearchParams();
    if (input.term !== undefined) params.set("term", String(input.term));
    if (input.week !== undefined) params.set("week", String(input.week));
    if (input.weekday !== undefined) params.set("weekday", String(input.weekday));
    if (input.courseCode) params.set("courseCode", input.courseCode);
    params.set("limit", String(input.limit ?? 1000));
    return getJSON<ActualCourseMeeting[]>(
      `/api/raw/actual-course-meetings?${params.toString()}`
    );
  },
};
