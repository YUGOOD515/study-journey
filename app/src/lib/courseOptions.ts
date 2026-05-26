import type { CategoryCode } from "../types";

export const COURSE_CATEGORY_OPTIONS: Array<{
  code: CategoryCode;
  name: string;
  shortName: string;
}> = [
  { code: "general_education", name: "通识教育", shortName: "通识" },
  { code: "major_platform", name: "大类平台", shortName: "大类" },
  { code: "professional_education", name: "专业教育", shortName: "专业" },
  { code: "quality_education", name: "素质教育", shortName: "素质" },
  { code: "practice_education", name: "实践教育", shortName: "实践" },
];

export const COURSE_NATURE_OPTIONS = ["选修", "必修", "跨专业"] as const;

export const TERM_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const CREDIT_ASSIGNMENT_OPTIONS = [
  { value: "interdisciplinary", label: "大类平台-选修" },
  { value: "elective", label: "通识教育-选修" },
] as const;

export function canUseInterdisciplinary(categoryCode: CategoryCode) {
  return categoryCode === "general_education" || categoryCode === "major_platform";
}

export function assignmentLabel(value: "interdisciplinary" | "elective" | null | undefined) {
  return value === "elective" ? "通识教育-选修" : "大类平台-选修";
}

export function categoryNameOf(code: CategoryCode) {
  return COURSE_CATEGORY_OPTIONS.find((item) => item.code === code)?.name ?? code;
}
