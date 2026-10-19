import type { Course } from "../../types";
import { parseOfferedTerm } from "../../lib/offeredTerm";

export const TERMS = [1, 2, 3, 4, 5, 6, 7, 8];

export type ViewMode = "official" | "personal";

/** 拖拽 / 菜单移动时描述一门课 */
export interface MovePayload {
  kind: "official" | "manual";
  courseCode: string;
  courseName: string;
  /** null = 待安排 */
  fromTerm: number | null;
  /** 已修读/正在修读等状态：不能通过计划接口移动 */
  lockedStatus?: string;
}

/** /plan 仅允许在这两种状态下修改学期 */
export function isPlanLocked(status: string | null | undefined): boolean {
  return status != null && status !== "未修读" && status !== "计划修读";
}

export interface PlannedOfficial {
  course: Course;
  plannedTerm: number | null;
  warning: string | null;
}

/** 放置目标：学期号 / 待安排 / 垃圾篓 */
export type DropTarget = { type: "term"; term: number } | { type: "pending" } | { type: "trash" };

export function emptyTermBuckets<T>(): Record<number, T[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
}

export function sortOfficial(arr: Course[]) {
  arr.sort((a, b) => {
    if (a.requirementType !== b.requirementType) {
      return a.requirementType === "必修" ? -1 : 1;
    }
    return a.categoryName.localeCompare(b.categoryName, "zh");
  });
}

export function sortPlanned(arr: PlannedOfficial[]) {
  arr.sort((a, b) => {
    if (a.course.requirementType !== b.course.requirementType) {
      return a.course.requirementType === "必修" ? -1 : 1;
    }
    return a.course.categoryName.localeCompare(b.course.categoryName, "zh");
  });
}

export function allowedTerms(course: Course): number[] {
  const parsed = parseOfferedTerm(course.officialTerm);
  if (parsed.isFlexible || parsed.primary == null) return TERMS;
  if (parsed.rangeEnd != null) {
    return TERMS.filter((t) => t >= parsed.primary! && t <= parsed.rangeEnd!);
  }
  return [parsed.primary];
}

export function placementWarning(
  course: Course,
  term: number,
  plannedTermByCode: Map<string, number | null>,
  allCourses: Course[],
): string | null {
  const warnings: string[] = [];
  const allowed = allowedTerms(course);
  if (!allowed.includes(term)) {
    warnings.push(`开课建议：${formatAllowedTerms(allowed)}`);
  }

  if (course.prerequisiteCourseCode) {
    const prereqTerm = plannedTermByCode.get(course.prerequisiteCourseCode);
    const prereq = allCourses.find((c) => c.courseCode === course.prerequisiteCourseCode);
    if (prereqTerm != null && prereqTerm >= term) {
      warnings.push(`先修「${prereq?.courseName ?? "未命名课程"}」不早于本课`);
    }
  }

  return warnings.length > 0 ? warnings.join("；") : null;
}

export function formatAllowedTerms(terms: number[]) {
  if (terms.length === 8) return "任意学期";
  if (terms.length === 1) return `第 ${terms[0]} 学期`;
  return `第 ${terms[0]}–${terms[terms.length - 1]} 学期`;
}

export function dropTargetFromId(id: string | number | undefined | null): DropTarget | null {
  if (id == null) return null;
  const s = String(id).replace(/-panel$/, "");
  if (s === "pending") return { type: "pending" };
  if (s === "trash") return { type: "trash" };
  const m = /^(?:term|chip):(\d)$/.exec(s);
  if (m) return { type: "term", term: Number(m[1]) };
  return null;
}

export function sumCredits<T>(items: T[], get: (item: T) => number) {
  return items.reduce((s, item) => s + (get(item) || 0), 0);
}
