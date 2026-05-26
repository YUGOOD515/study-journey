// ─────────────────────────────────────────────
// 进度计算（v2）
//
// 输入：plan_program_courses + plan_custom_courses + plan_program_requirements
// 输出：每个 requirement 行的 earned/planned 课程清单与学分合计
//
// 规则：
//   - 跨专业课程（requirement_type='跨专业'）不计入任何 requirement bucket
//   - 经法管融通课程 → 计入 major_platform·interdisciplinary 桶（face credits）
//     同时按 credit_count_to 流入对应的 elective 桶（通识·选修 或 大类·选修）
//   - 普通 必修/选修 → 按 category_code + requirement_type 直接匹配
// ─────────────────────────────────────────────

import type {
  CategoryCode,
  CreditCountTo,
  PlanCustomCourse,
  PlanProgramCourse,
  ProgramRequirement,
  RequirementType,
  StudyStatus,
} from "../types";

/** PlanProgramCourse 与 PlanCustomCourse 的统一视图 */
export interface CourseInstance {
  source: "program" | "custom";
  course_code: string;
  course_name: string;
  credits: number;
  category_code: CategoryCode;
  requirement_type: RequirementType;
  course_subcategory: string | null;
  /** program 用 planned_term；custom 用 term_number；null = 待安排 */
  planned_term: number | null;
  /** 仅 program 有 */
  actual_term: number | null;
  study_status: StudyStatus;
  score: number | null;
  credit_count_to: CreditCountTo | null;
}

export function toInstances(
  program: PlanProgramCourse[],
  custom: PlanCustomCourse[] = []
): CourseInstance[] {
  return [
    ...program.map(
      (p): CourseInstance => ({
        source: "program",
        course_code: p.course_code,
        course_name: p.course_name,
        credits: p.credits,
        category_code: p.category_code,
        requirement_type: p.requirement_type,
        course_subcategory: p.course_subcategory,
        planned_term: p.planned_term,
        actual_term: p.actual_term,
        study_status: p.study_status,
        score: p.score,
        credit_count_to: p.credit_count_to,
      })
    ),
    ...custom.map(
      (c): CourseInstance => ({
        source: "custom",
        course_code: c.course_code,
        course_name: c.course_name,
        credits: c.credits,
        category_code: c.category_code,
        requirement_type: c.requirement_type,
        course_subcategory: c.course_subcategory,
        planned_term: c.term_number,
        actual_term: null,
        study_status: c.study_status,
        score: c.score,
        credit_count_to: c.credit_count_to,
      })
    ),
  ];
}

export function isInterdisciplinary(c: CourseInstance): boolean {
  return (
    c.requirement_type === "经法管融通" ||
    (c.course_subcategory != null && c.course_subcategory.includes("经法管融通"))
  );
}

function matchesRequirement(c: CourseInstance, req: ProgramRequirement): boolean {
  // 跨专业不计入任何 requirement bucket
  if (c.requirement_type === "跨专业") return false;

  if (req.requirement_type_code === "required") {
    return c.category_code === req.category_code && c.requirement_type === "必修";
  }

  if (req.requirement_type_code === "interdisciplinary") {
    // 仅 major_platform 有 interdisciplinary 桶；所有 经法管融通 课进
    return req.category_code === "major_platform" && isInterdisciplinary(c);
  }

  // elective
  if (isInterdisciplinary(c)) {
    // 经法管融通课按 credit_count_to 决定流向哪个 elective 桶
    if (c.credit_count_to === "通识教育-选修") {
      return req.category_code === "general_education";
    }
    if (c.credit_count_to === "大类平台-选修") {
      return req.category_code === "major_platform";
    }
    return false;
  }
  if (c.requirement_type === "选修") {
    return c.category_code === req.category_code;
  }
  return false;
}

export interface RequirementRow {
  categoryCode: CategoryCode;
  categoryName: string;
  requirementTypeCode: "required" | "elective" | "interdisciplinary";
  requirementName: string;
  requiredCredits: number;
  earnedCourses: CourseInstance[];
  earnedCredits: number;
  plannedCourses: CourseInstance[];
  plannedCredits: number;
}

export function computeRequirementRows(
  requirements: ProgramRequirement[],
  instances: CourseInstance[]
): RequirementRow[] {
  return requirements.map((req) => {
    const matched = instances.filter((c) => matchesRequirement(c, req));
    const earned = matched.filter((c) => c.study_status === "已修读");
    const planned = matched.filter((c) => c.study_status !== "已修读");
    return {
      categoryCode: req.category_code,
      categoryName: req.category_name,
      requirementTypeCode: req.requirement_type_code,
      requirementName: req.requirement_name,
      requiredCredits: req.required_credits,
      earnedCourses: earned,
      earnedCredits: round1(earned.reduce((s, c) => s + c.credits, 0)),
      plannedCourses: planned,
      plannedCredits: round1(planned.reduce((s, c) => s + c.credits, 0)),
    };
  });
}

// ─────────────────────────────────────────────
// 按 category 打包成 5 张大卡片
// ─────────────────────────────────────────────
export interface CategoryBundle {
  code: CategoryCode;
  name: string;
  rows: RequirementRow[];
  totalRequired: number;
  totalEarned: number;
  totalPlanned: number;
}

const CATEGORY_ORDER: CategoryCode[] = [
  "general_education",
  "major_platform",
  "professional_education",
  "quality_education",
  "practice_education",
];

const CATEGORY_NAMES: Record<CategoryCode, string> = {
  general_education: "通识教育",
  major_platform: "大类平台",
  professional_education: "专业教育",
  quality_education: "素质教育",
  practice_education: "实践教育",
};

export function bundleByCategory(rows: RequirementRow[]): CategoryBundle[] {
  const map = new Map<CategoryCode, RequirementRow[]>();
  for (const code of CATEGORY_ORDER) map.set(code, []);
  for (const r of rows) map.get(r.categoryCode)?.push(r);
  return CATEGORY_ORDER.map((code) => {
    const list = map.get(code) ?? [];
    return {
      code,
      name: CATEGORY_NAMES[code],
      rows: list,
      totalRequired: round1(list.reduce((s, r) => s + r.requiredCredits, 0)),
      totalEarned: round1(list.reduce((s, r) => s + r.earnedCredits, 0)),
      totalPlanned: round1(list.reduce((s, r) => s + r.plannedCredits, 0)),
    };
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
