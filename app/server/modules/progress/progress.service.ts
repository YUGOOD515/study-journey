import type { Ctx } from "../../context";
import type { CategoryCode } from "../../db";
import type {
  Course,
  CourseSource,
  CreditCountTo,
  RequirementType,
  StudyStatus,
} from "../courses/course.types";
import { CustomCourseRepository } from "../courses/custom-course.repository";
import {
  RequirementRepository,
  type RequirementRow,
  type RequirementTypeCode,
} from "../requirements/requirement.repository";

/**
 * 进度 / 学分统计。口径定稿见 docs/16-credit-rule-finalization-and-frontend-plan.md §2。
 *
 * 经法管融通规则（要点）：
 *  - credit_count_to=大类平台-选修：按优先级+学分降序，整门计入「大类平台·经法管」直至 6 学分（上限）；
 *    放不下的整门溢出，计入「通识·选修」。
 *  - credit_count_to=通识教育-选修：直接计入「通识·选修」。
 *  - 不双计；未通过剔除；未修读占位展示（0 学分）。
 */

const INTERDISCIPLINARY_CAP = 6;

/** 教学性质 → 毕业要求性质码。经法管融通课程不走这里，单独按 creditCountTo 拆桶。 */
const REQ_TYPE_BY_NATURE: Record<string, RequirementTypeCode> = {
  必修: "required",
  选修: "elective",
};

function bucketKey(category: CategoryCode, type: RequirementTypeCode): string {
  return `${category}|${type}`;
}

export interface BucketCourse {
  courseCode: string;
  courseName: string;
  credits: number;
  studyStatus: StudyStatus;
  source: CourseSource;
  score: number | null;
  /** 课程本身所属类别（用于经法管流向图等展示）。 */
  categoryCode: CategoryCode;
  /** program 取 actualTerm ?? plannedTerm；custom 取 plannedTerm。 */
  term: number | null;
  requirementType: RequirementType;
  /** 经法管融通课程的学分计入方向；非经法管为 null。 */
  creditCountTo: CreditCountTo | null;
}

export interface Bucket {
  categoryCode: CategoryCode;
  categoryName: string;
  requirementTypeCode: RequirementTypeCode;
  requirementName: string;
  required: number;
  earned: number;
  inProgress: number;
  planned: number;
  pending: number;
  courses: BucketCourse[];
}

export interface OverflowReport {
  interdisciplinary: {
    cap: number;
    /** 计入大类平台方向、且为计学分状态的经法管学分合计 = counted + overflowCredits。 */
    totalAttempted: number;
    /** 实际落进「大类平台·经法管」桶的学分（≤ cap）。 */
    counted: number;
    /** 因超过 cap 而溢出到「通识·选修」的学分。 */
    overflowCredits: number;
    overflowCourses: Array<{
      courseCode: string;
      courseName: string;
      credits: number;
      studyStatus: StudyStatus;
    }>;
  };
}

const STATUS_PRIORITY: Record<StudyStatus, number> = {
  已修读: 0,
  正在修读: 1,
  计划修读: 2,
  未修读: 3,
  未通过: 4,
};

function activeCourses(ctx: Ctx): Promise<Course[]> {
  return CustomCourseRepository.find(ctx, { limit: 1000 });
}

function statusCreditBucketField(
  status: StudyStatus
): "earned" | "inProgress" | "planned" | null {
  if (status === "已修读") return "earned";
  if (status === "正在修读") return "inProgress";
  if (status === "计划修读") return "planned";
  return null;
}

function emptyBucket(req: RequirementRow): Bucket {
  return {
    categoryCode: req.category_code as CategoryCode,
    categoryName: req.category_name,
    requirementTypeCode: req.requirement_type_code,
    requirementName: req.requirement_name,
    required: req.required_credits,
    earned: 0,
    inProgress: 0,
    planned: 0,
    pending: 0,
    courses: [],
  };
}

type CreditField = "earned" | "inProgress" | "planned" | null;

/**
 * 课程在“我的计划”时间轴上的学期；null = 未落位（灵活/抽屉）。与时间轴页同口径。
 *
 * 我的计划已经是最终用户状态；未落位课程不回退官方默认学期。
 */
function placementTerm(course: Course): number | null {
  return course.actualTerm ?? course.plannedTerm;
}

/**
 * 学分归类，与时间轴“我的计划”一致：
 *  已修读→earned，正在修读→inProgress，计划修读→planned，
 *  未修读但已落位（有默认/实际学期）→planned，其余（未通过 / 灵活未修读）→不计。
 */
function effectiveField(course: Course, term: number | null): CreditField {
  // 未落位（抽屉/灵活，term=null）一律不计入——与时间轴“我的计划合计”一致。
  if (term == null) return null;
  switch (course.studyStatus) {
    case "已修读":
      return "earned";
    case "正在修读":
      return "inProgress";
    case "计划修读":
    case "未修读":
      return "planned";
    default:
      return null; // 未通过
  }
}

function toBucketCourse(course: Course, term: number | null): BucketCourse {
  return {
    courseCode: course.courseCode,
    courseName: course.courseName,
    credits: course.credits,
    studyStatus: course.studyStatus,
    source: course.source,
    score: course.score,
    categoryCode: course.categoryCode,
    term,
    requirementType: course.requirementType,
    creditCountTo: course.creditCountTo,
  };
}

function addToBucket(
  bucket: Bucket | undefined,
  course: Course,
  field: CreditField,
  term: number | null
): void {
  if (!bucket) return;
  if (field) bucket[field] += course.credits;
  bucket.courses.push(toBucketCourse(course, term));
}

export const ProgressService = {
  async compute(ctx: Ctx): Promise<{
    byCategory: Bucket[];
    totals: { required: number; earned: number; inProgress: number; planned: number; pending: number };
    overflow: OverflowReport;
  }> {
    const requirements = await RequirementRepository.findAll(ctx);
    const buckets = new Map<string, Bucket>();
    for (const r of requirements) {
      buckets.set(bucketKey(r.category_code as CategoryCode, r.requirement_type_code), emptyBucket(r));
    }

    const generalElective = buckets.get(bucketKey("general_education", "elective"));
    const majorInterdisciplinary = buckets.get(bucketKey("major_platform", "interdisciplinary"));

    const courses = await activeCourses(ctx);
    const interToMajor: Array<{ course: Course; term: number | null; field: CreditField }> = [];

    for (const c of courses) {
      const term = placementTerm(c);
      const field = effectiveField(c, term);
      if (c.requirementType === "经法管融通") {
        // credit_count_to=通识教育-选修 → 直接进通识选修；
        // 其余（含 creditCountTo 缺失的数据异常）按默认"大类平台-选修"处理。
        if (c.creditCountTo === "通识教育-选修") {
          addToBucket(generalElective, c, field, term);
        } else {
          interToMajor.push({ course: c, term, field });
        }
        continue;
      }
      const reqType =
        c.requirementType === "跨专业" ? "elective" : REQ_TYPE_BY_NATURE[c.requirementType];
      if (!reqType) continue;
      const targetCategory = c.requirementType === "跨专业" ? "general_education" : c.categoryCode;
      addToBucket(buckets.get(bucketKey(targetCategory, reqType)), c, field, term);
    }

    // 大类平台方向的经法管：优先级（已修 > 在修 > 计划 > 未修）+ 学分降序，整门装入
    //「大类平台·经法管」直至累计 6 学分；放不下的整门溢出到「通识·选修」。
    interToMajor.sort((a, b) => {
      const sp =
        (STATUS_PRIORITY[a.course.studyStatus] ?? 9) - (STATUS_PRIORITY[b.course.studyStatus] ?? 9);
      if (sp !== 0) return sp;
      return b.course.credits - a.course.credits;
    });

    let remaining = INTERDISCIPLINARY_CAP;
    let totalAttempted = 0;
    const overflowCourses: OverflowReport["interdisciplinary"]["overflowCourses"] = [];

    for (const { course: c, term, field } of interToMajor) {
      if (field === null) {
        // 未通过 / 灵活未修读：展示在桶里但不计学分、不占额度
        addToBucket(majorInterdisciplinary, c, null, term);
        continue;
      }
      totalAttempted += c.credits;
      if (c.credits <= remaining + 1e-9) {
        addToBucket(majorInterdisciplinary, c, field, term);
        remaining = Math.max(0, remaining - c.credits);
      } else {
        // 溢出：整门计入通识选修
        addToBucket(generalElective, c, field, term);
        overflowCourses.push({
          courseCode: c.courseCode,
          courseName: c.courseName,
          credits: c.credits,
          studyStatus: c.studyStatus,
        });
      }
    }

    const byCategory = Array.from(buckets.values()).map((b) => {
      const used = b.earned + b.inProgress + b.planned;
      const pending = Math.max(0, b.required - used);
      return { ...b, pending };
    });

    const totals = byCategory.reduce(
      (acc, b) => {
        acc.required += b.required;
        acc.earned += b.earned;
        acc.inProgress += b.inProgress;
        acc.planned += b.planned;
        acc.pending += b.pending;
        return acc;
      },
      { required: 0, earned: 0, inProgress: 0, planned: 0, pending: 0 }
    );

    const counted = INTERDISCIPLINARY_CAP - remaining;
    const overflowCredits = overflowCourses.reduce((s, c) => s + c.credits, 0);

    return {
      byCategory,
      totals,
      overflow: {
        interdisciplinary: {
          cap: INTERDISCIPLINARY_CAP,
          totalAttempted,
          counted,
          overflowCredits,
          overflowCourses,
        },
      },
    };
  },

  async timeline(ctx: Ctx): Promise<{
    terms: Array<{
      term: number;
      credits: { earned: number; inProgress: number; planned: number };
      courseCount: number;
    }>;
  }> {
    const terms = Array.from({ length: 8 }, (_, i) => ({
      term: i + 1,
      credits: { earned: 0, inProgress: 0, planned: 0 },
      courseCount: 0,
    }));

    for (const c of await activeCourses(ctx)) {
      const t = c.actualTerm ?? c.plannedTerm;
      if (!t || t < 1 || t > 8) continue;
      const bucket = terms[t - 1];
      bucket.courseCount += 1;
      const field = statusCreditBucketField(c.studyStatus);
      if (field) bucket.credits[field] += c.credits;
    }
    return { terms };
  },
};
