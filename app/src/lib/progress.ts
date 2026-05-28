import type {
  CategoryCode,
  CourseWithCategory,
  CreditAssignment,
  PersonalPlanItem,
  ProgramRequirement,
  SemesterCourse,
} from "../types";
import { roundCredits } from "./credits";
import { parseOfferedTerm } from "./offeredTerm";

export type CreditAssignmentMap = Map<string, "interdisciplinary" | "elective">;

export function buildAssignmentMap(
  assignments: CreditAssignment[] = []
): CreditAssignmentMap {
  return new Map(assignments.map((a) => [a.course_code, a.assigned_to]));
}

function assignmentOf(
  c: CourseWithCategory,
  map?: CreditAssignmentMap
): "interdisciplinary" | "elective" {
  return map?.get(c.course_code) ?? "interdisciplinary";
}

export interface EarnedCourse {
  source: "official" | "manual";
  id: number | null;
  courseCode: string | null;
  courseName: string;
  credits: number;
  score: number | null;
  categoryCode: CategoryCode;
  courseNature: "必修" | "选修" | "跨专业";
}

export interface PlannedCourse {
  source: "official" | "manual";
  origin: "plan" | "record";
  id: number | null;
  courseCode: string | null;
  courseName: string;
  credits: number;
  /** null = 显式放进"待安排"抽屉 */
  plannedTerm: number | null;
  categoryCode: CategoryCode;
  courseNature: "必修" | "选修" | "跨专业";
  isInterdisciplinary?: boolean;
  assignedTo?: "interdisciplinary" | "elective";
}

/**
 * 一个具体的"要求条目"，例如「通识教育 · 必修 · 32 学分」
 * earnedCredits 表示已修学分；earnedCourses 列出对应的课程
 */
export interface RequirementRow {
  categoryCode: CategoryCode;
  categoryName: string;
  requirementType: "required" | "elective" | "interdisciplinary";
  requirementName: string;
  requiredCredits: number;
  earnedCredits: number;
  earnedCourses: EarnedCourse[];
  plannedCredits: number;
  plannedCourses: PlannedCourse[];
}

/**
 * 把 program_requirements 的每一行展开为 RequirementRow（含已修计算）。
 */
export function computeRequirementRows(
  requirements: ProgramRequirement[],
  courses: CourseWithCategory[],
  semesterCourses: SemesterCourse[],
  personalPlan: PersonalPlanItem[] = [],
  assignments: CreditAssignmentMap = new Map()
): RequirementRow[] {
  const officialRecordsByCode = new Map(
    semesterCourses
      .filter((s) => s.source === "official" && s.course_code)
      .map((s) => [s.course_code as string, s])
  );
  const earnedOfficialByCode = new Map(
    semesterCourses
      .filter((s) => s.source === "official" && s.course_code && s.score != null)
      .map((s) => [s.course_code as string, s])
  );
  const completedOfficialCodes = new Set(earnedOfficialByCode.keys());
  const plannedOfficialOverrides = new Map(
    personalPlan
      .filter((p) => p.item_type === "official" && p.course_code)
      .map((p) => [p.course_code as string, p])
  );
  const manualCourses = semesterCourses.filter(
    (s) => s.source === "manual" && s.category_code && s.course_nature
  );
  const earnedManualCourses = manualCourses.filter((s) => s.score != null);
  const plannedManualRecords = manualCourses.filter((s) => s.score == null);
  const plannedManualCourses = personalPlan.filter(
    (p) => p.item_type === "manual"
  );

  return requirements.map((req) => {
    const officialMatched = matchCourses(req, courses, assignments)
      .filter((c) => earnedOfficialByCode.has(c.course_code))
      .map((c): EarnedCourse => {
        const record = earnedOfficialByCode.get(c.course_code);
        return {
          source: "official",
          id: null,
          courseCode: c.course_code,
          courseName: c.course_name,
          credits: c.credits,
          score: record?.score ?? null,
          categoryCode: c.category_code,
          courseNature: c.course_nature,
        };
      });

    const manualMatched = earnedManualCourses
      .filter((c) => matchManualCourse(req, c))
      .map((c): EarnedCourse => ({
        source: "manual",
        id: c.id,
        courseCode: null,
        courseName: c.course_name,
        credits: c.credits,
        score: c.score,
        categoryCode: c.category_code as CategoryCode,
        courseNature: c.course_nature as "必修" | "选修" | "跨专业",
      }));

    const matched = [...officialMatched, ...manualMatched];
    const earnedCredits = roundCredits(
      matched.reduce((s, c) => s + (c.credits ?? 0), 0)
    );

    const plannedOfficial = matchCourses(req, courses, assignments)
      .filter((c) => !completedOfficialCodes.has(c.course_code))
      .map((c): PlannedCourse => {
        const override = plannedOfficialOverrides.get(c.course_code);
        const hasOverride = override !== undefined;
        // 三态：
        //  - semester_courses 已有 record（无成绩）→ 跟随该 term
        //  - personal_plan 有 override → planned_term 可能是数字、也可能是 null（"待安排"抽屉）
        //  - 都没有 → 走 offered_term 默认（灵活课返回 null）
        const recordTerm = officialRecordsByCode.get(c.course_code)?.term_number;
        const plannedTerm: number | null =
          recordTerm ??
          (hasOverride ? override!.planned_term : defaultPlannedTerm(c));
        return {
          source: "official",
          origin: officialRecordsByCode.has(c.course_code) ? "record" : "plan",
          id: null,
          courseCode: c.course_code,
          courseName: c.course_name,
          credits: c.credits,
          plannedTerm,
          categoryCode: c.category_code,
          courseNature: c.course_nature,
        };
      });
    const plannedManualFromRecords = plannedManualRecords
      .filter((c) => matchManualCourse(req, c))
      .map(
        (c): PlannedCourse => ({
          source: "manual",
          origin: "record",
          id: c.id,
          courseCode: null,
          courseName: c.course_name,
          credits: c.credits,
          plannedTerm: c.term_number,
          categoryCode: c.category_code as CategoryCode,
          courseNature: c.course_nature as "必修" | "选修" | "跨专业",
          isInterdisciplinary: c.is_interdisciplinary === 1,
          assignedTo: (c.assigned_to ?? "interdisciplinary") as
            | "interdisciplinary"
            | "elective",
        })
      );
    const plannedManual = plannedManualCourses
      .filter((c) => matchPersonalPlanManual(req, c))
      .map(
        (c): PlannedCourse => ({
          source: "manual",
          origin: "plan",
          id: c.id,
          courseCode: null,
          courseName: c.course_name,
          credits: c.credits,
          plannedTerm: c.planned_term,
          categoryCode: c.category_code,
          courseNature: c.course_nature as "必修" | "选修" | "跨专业",
          isInterdisciplinary: c.is_interdisciplinary === 1,
          assignedTo: (c.assigned_to ?? "interdisciplinary") as
            | "interdisciplinary"
            | "elective",
        })
      );
    // 旅迹页只统计真正放在“我的计划”时间轴上的课程。
    // plannedTerm === null 表示还在“待安排”抽屉，不计入预计学分。
    const plannedCourses = [
      ...plannedOfficial,
      ...plannedManualFromRecords,
      ...plannedManual,
    ].filter((c) => c.plannedTerm != null);
    const plannedCredits = roundCredits(
      plannedCourses.reduce((s, c) => s + c.credits, 0)
    );

    return {
      categoryCode: req.category_code as CategoryCode,
      categoryName: req.category_name,
      requirementType: req.requirement_type,
      requirementName: req.requirement_name,
      requiredCredits: req.required_credits,
      earnedCredits,
      earnedCourses: matched,
      plannedCredits,
      plannedCourses,
    };
  });
}

/**
 * 根据要求行筛选课程归属，并尊重用户的"二选一"覆盖：
 *  - required → 该 category 下 course_nature='必修'
 *  - elective → 该 category 下选修/跨专业；默认排除经法管融通课，
 *               但若用户把某门经法管融通课的 assignment 显式设为 'elective'，
 *               则把它纳入"原属板块·选修"
 *  - interdisciplinary → 所有 isInterdisciplinary 的课，
 *               但 assignment='elective' 的会被排除（已搬到选修桶）
 */
function matchCourses(
  req: ProgramRequirement,
  courses: CourseWithCategory[],
  assignments: CreditAssignmentMap
): CourseWithCategory[] {
  if (req.requirement_type === "interdisciplinary") {
    return courses.filter(
      (c) => isInterdisciplinary(c) && assignmentOf(c, assignments) !== "elective"
    );
  }
  if (req.requirement_type === "required") {
    return courses.filter(
      (c) =>
        c.category_code === req.category_code && c.course_nature === "必修"
    );
  }
  // elective
  return courses.filter((c) => {
    if (c.course_nature === "跨专业") {
      return req.category_code === "general_education";
    }
    if (c.category_code !== req.category_code) return false;
    if (c.course_nature !== "选修") return false;
    if (isInterdisciplinary(c)) {
      // 仅当用户明确把这门课切到 elective 时才纳入
      return assignmentOf(c, assignments) === "elective";
    }
    return true;
  });
}

function matchManualCourse(req: ProgramRequirement, c: SemesterCourse): boolean {
  if (!c.category_code || !c.course_nature) return false;
  const isInter = c.is_interdisciplinary === 1;
  const inter = c.assigned_to ?? "interdisciplinary";

  if (req.requirement_type === "interdisciplinary") {
    // 经法管融通桶：仅收 is_interdisciplinary=1 且 assigned_to != elective 的手动课
    return isInter && inter !== "elective";
  }
  if (req.requirement_type === "required") {
    return c.category_code === req.category_code && c.course_nature === "必修";
  }
  // elective
  if (c.course_nature === "跨专业") {
    return req.category_code === "general_education";
  }
  if (c.category_code !== req.category_code) return false;
  if (c.course_nature !== "选修") return false;
  if (isInter) return inter === "elective"; // 经融课仅在被切到 elective 时入选修桶
  return true;
}

function matchPersonalPlanManual(
  req: ProgramRequirement,
  c: PersonalPlanItem
): boolean {
  const isInter = c.is_interdisciplinary === 1;
  const inter = c.assigned_to ?? "interdisciplinary";

  if (req.requirement_type === "interdisciplinary") {
    return isInter && inter !== "elective";
  }
  if (req.requirement_type === "required") {
    return c.category_code === req.category_code && c.course_nature === "必修";
  }
  if (c.course_nature === "跨专业") {
    return req.category_code === "general_education";
  }
  if (c.category_code !== req.category_code) return false;
  if (c.course_nature !== "选修") return false;
  if (isInter) return inter === "elective";
  return true;
}

function isInterdisciplinary(c: CourseWithCategory): boolean {
  return !!(c.course_category && c.course_category.includes("经法管融通"));
}

function defaultPlannedTerm(c: CourseWithCategory): number | null {
  const parsed = parseOfferedTerm(c.offered_term);
  // 灵活课（A/null/1-8）→ null = 归入"待安排"
  if (parsed.isFlexible) return null;
  return parsed.primary;
}

/**
 * 按 category_code 把要求行打包成"5 张大卡片"用的数据
 */
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

const CATEGORY_NAME_TO_CODE: Record<string, CategoryCode> = {
  通识教育: "general_education",
  大类平台: "major_platform",
  专业教育: "professional_education",
  素质教育: "quality_education",
  实践教育: "practice_education",
};

export function bundleByCategory(rows: RequirementRow[]): CategoryBundle[] {
  const map = new Map<CategoryCode, RequirementRow[]>();
  for (const code of CATEGORY_ORDER) map.set(code, []);
  for (const r of rows) {
    // program_requirements.category_code 用的是 "professional_education" 等，
    // 与 CategoryCode 完全一致；但保险起见再用名字兜底
    const code =
      (CATEGORY_NAME_TO_CODE[r.categoryName] as CategoryCode) ?? r.categoryCode;
    map.get(code)?.push(r);
  }
  return CATEGORY_ORDER.map((code) => {
    const list = map.get(code) ?? [];
    return {
      code,
      name: list[0]?.categoryName ?? code,
      rows: list,
      totalRequired: roundCredits(list.reduce((s, r) => s + r.requiredCredits, 0)),
      totalEarned: roundCredits(list.reduce((s, r) => s + r.earnedCredits, 0)),
      totalPlanned: roundCredits(list.reduce((s, r) => s + r.plannedCredits, 0)),
    };
  });
}
