import type {
  CategoryCode,
  CourseWithCategory,
  ProgramRequirement,
  SemesterCourse,
} from "../types";

/**
 * 一个具体的"要求条目"，例如「通识教育 · 必修 · 32 学分」
 * earnedCredits 表示已修学分；earnedCourses 列出对应的课程
 */
export interface RequirementRow {
  categoryCode: CategoryCode | "major_platform"; // major_platform 也是 CategoryCode
  categoryName: string;
  requirementType: "required" | "elective" | "interdisciplinary";
  requirementName: string;
  requiredCredits: number;
  earnedCredits: number;
  earnedCourses: CourseWithCategory[];
}

/**
 * 把 program_requirements 的每一行展开为 RequirementRow（含已修计算）。
 */
export function computeRequirementRows(
  requirements: ProgramRequirement[],
  courses: CourseWithCategory[],
  semesterCourses: SemesterCourse[]
): RequirementRow[] {
  // 仅官方课走"按 course_code 命中要求行"的逻辑；
  // 手动课没有 course_code，会在 Phase H 里以另一条路径计入板块学分。
  const completed = new Set(
    semesterCourses
      .filter((s) => s.source === "official" && s.course_code)
      .map((s) => s.course_code as string)
  );

  return requirements.map((req) => {
    const matched = matchCourses(req, courses).filter((c) =>
      completed.has(c.course_code)
    );
    const earnedCredits = round1(
      matched.reduce((s, c) => s + (c.credits ?? 0), 0)
    );
    return {
      categoryCode: req.category_code as CategoryCode,
      categoryName: req.category_name,
      requirementType: req.requirement_type,
      requirementName: req.requirement_name,
      requiredCredits: req.required_credits,
      earnedCredits,
      earnedCourses: matched,
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
    };
  });
}
