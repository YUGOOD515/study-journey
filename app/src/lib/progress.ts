import type {
  CategoryCode,
  CourseWithCategory,
  PersonalPlanItem,
  ProgramRequirement,
  SemesterCourse,
} from "../types";

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
  id: number | null;
  courseCode: string | null;
  courseName: string;
  credits: number;
  categoryCode: CategoryCode;
  courseNature: "必修" | "选修" | "跨专业";
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
  personalPlan: PersonalPlanItem[] = []
): RequirementRow[] {
  const officialByCode = new Map(
    semesterCourses
      .filter((s) => s.source === "official" && s.course_code)
      .map((s) => [s.course_code as string, s])
  );
  const completedOfficialCodes = new Set(officialByCode.keys());
  const manualCourses = semesterCourses.filter(
    (s) => s.source === "manual" && s.category_code && s.course_nature
  );
  const plannedManualCourses = personalPlan.filter(
    (p) => p.item_type === "manual"
  );

  return requirements.map((req) => {
    const officialMatched = matchCourses(req, courses)
      .filter((c) => officialByCode.has(c.course_code))
      .map((c): EarnedCourse => {
        const record = officialByCode.get(c.course_code);
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

    const manualMatched = manualCourses
      .filter((c) => matchManualCourse(req, c))
      .map((c): EarnedCourse => ({
        source: "manual",
        id: c.id,
        courseCode: null,
        courseName: c.course_name,
        credits: c.credits,
        score: c.score,
        categoryCode: c.category_code as CategoryCode,
        courseNature: c.course_nature as "必修" | "选修",
      }));

    const matched = [...officialMatched, ...manualMatched];
    const earnedCredits = round1(
      matched.reduce((s, c) => s + (c.credits ?? 0), 0)
    );

    const plannedOfficial = matchCourses(req, courses)
      .filter((c) => !completedOfficialCodes.has(c.course_code))
      .map(
        (c): PlannedCourse => ({
          source: "official",
          id: null,
          courseCode: c.course_code,
          courseName: c.course_name,
          credits: c.credits,
          categoryCode: c.category_code,
          courseNature: c.course_nature,
        })
      );
    const plannedManual = plannedManualCourses
      .filter((c) => matchPersonalPlanManual(req, c))
      .map(
        (c): PlannedCourse => ({
          source: "manual",
          id: c.id,
          courseCode: null,
          courseName: c.course_name,
          credits: c.credits,
          categoryCode: c.category_code,
          courseNature: c.course_nature as "必修" | "选修",
        })
      );
    const plannedCourses = [...plannedOfficial, ...plannedManual];
    const plannedCredits = round1(
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
 * 根据要求行筛选课程归属。
 *  - required → 该 category 下 course_nature='必修'
 *  - elective → 该 category 下 course_nature='选修' 或 '跨专业'（跨专业课按选修计入所在板块）
 *               并排除标记为"经法管融通"的课（避免与 interdisciplinary 行重复计分）
 *  - interdisciplinary → 任意板块下 course_category 含"经法管融通"的课（独占归属）
 */
function matchCourses(
  req: ProgramRequirement,
  courses: CourseWithCategory[]
): CourseWithCategory[] {
  if (req.requirement_type === "interdisciplinary") {
    return courses.filter((c) => isInterdisciplinary(c));
  }
  if (req.requirement_type === "required") {
    return courses.filter(
      (c) =>
        c.category_code === req.category_code && c.course_nature === "必修"
    );
  }
  // elective：把"选修"和"跨专业"都归入；同时排除经法管融通（已被独立要求承接）
  return courses.filter(
    (c) =>
      c.category_code === req.category_code &&
      (c.course_nature === "选修" || c.course_nature === "跨专业") &&
      !isInterdisciplinary(c)
  );
}

function matchManualCourse(req: ProgramRequirement, c: SemesterCourse): boolean {
  if (!c.category_code || !c.course_nature) return false;
  if (req.requirement_type === "interdisciplinary") return false;
  if (req.requirement_type === "required") {
    return c.category_code === req.category_code && c.course_nature === "必修";
  }
  return c.category_code === req.category_code && c.course_nature === "选修";
}

function matchPersonalPlanManual(
  req: ProgramRequirement,
  c: PersonalPlanItem
): boolean {
  if (req.requirement_type === "interdisciplinary") return false;
  if (req.requirement_type === "required") {
    return c.category_code === req.category_code && c.course_nature === "必修";
  }
  return c.category_code === req.category_code && c.course_nature === "选修";
}

function isInterdisciplinary(c: CourseWithCategory): boolean {
  return !!(c.course_category && c.course_category.includes("经法管融通"));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
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
      totalRequired: round1(list.reduce((s, r) => s + r.requiredCredits, 0)),
      totalEarned: round1(list.reduce((s, r) => s + r.earnedCredits, 0)),
      totalPlanned: round1(list.reduce((s, r) => s + r.plannedCredits, 0)),
    };
  });
}
