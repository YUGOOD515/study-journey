import type { CourseCardDisplayOptions } from "../types";

export const DEFAULT_COURSE_CARD_DISPLAY_OPTIONS: CourseCardDisplayOptions = {
  showNature: true,
  showScore: true,
  showCredits: true,
  showCourseCode: true,
};

export const COURSE_CARD_DISPLAY_ITEMS = [
  { key: "showNature", label: "必选修" },
  { key: "showScore", label: "成绩" },
  { key: "showCredits", label: "学分" },
  { key: "showCourseCode", label: "课程号" },
] as const satisfies ReadonlyArray<{
  key: keyof CourseCardDisplayOptions;
  label: string;
}>;

const STORAGE_KEY = "study-journey.timeline-card-display";

export function loadCourseCardDisplayOptions(): CourseCardDisplayOptions {
  if (typeof window === "undefined") return DEFAULT_COURSE_CARD_DISPLAY_OPTIONS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COURSE_CARD_DISPLAY_OPTIONS;
    return normalizeDisplayOptions(JSON.parse(raw));
  } catch {
    return DEFAULT_COURSE_CARD_DISPLAY_OPTIONS;
  }
}

export function saveCourseCardDisplayOptions(options: CourseCardDisplayOptions) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
}

function normalizeDisplayOptions(raw: unknown): CourseCardDisplayOptions {
  if (!raw || typeof raw !== "object") return DEFAULT_COURSE_CARD_DISPLAY_OPTIONS;
  const candidate = raw as Partial<Record<keyof CourseCardDisplayOptions, unknown>>;

  return {
    showNature:
      typeof candidate.showNature === "boolean"
        ? candidate.showNature
        : DEFAULT_COURSE_CARD_DISPLAY_OPTIONS.showNature,
    showScore:
      typeof candidate.showScore === "boolean"
        ? candidate.showScore
        : DEFAULT_COURSE_CARD_DISPLAY_OPTIONS.showScore,
    showCredits:
      typeof candidate.showCredits === "boolean"
        ? candidate.showCredits
        : DEFAULT_COURSE_CARD_DISPLAY_OPTIONS.showCredits,
    showCourseCode:
      typeof candidate.showCourseCode === "boolean"
        ? candidate.showCourseCode
        : DEFAULT_COURSE_CARD_DISPLAY_OPTIONS.showCourseCode,
  };
}
