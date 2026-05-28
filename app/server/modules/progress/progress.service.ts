import type { CategoryCode } from "../../db";
import type {
  Course,
  CreditCountTo,
  StudyStatus,
} from "../courses/course.types";
import { CustomCourseRepository } from "../courses/custom-course.repository";
import { ProgramCourseRepository } from "../courses/program-course.repository";
import {
  RequirementRepository,
  type RequirementRow,
  type RequirementTypeCode,
} from "../requirements/requirement.repository";

const INTERDISCIPLINARY_CAP = 6;

/** 教学性质 → 毕业要求性质码。经法管融通课程不走这里，单独按 creditCountTo 拆桶。 */
const REQ_TYPE_BY_NATURE: Record<string, RequirementTypeCode> = {
  必修: "required",
  选修: "elective",
};

function bucketKey(category: CategoryCode, type: RequirementTypeCode): string {
  return `${category}|${type}`;
}

interface Bucket {
  categoryCode: CategoryCode;
  categoryName: string;
  requirementTypeCode: RequirementTypeCode;
  requirementName: string;
  required: number;
  earned: number;
  inProgress: number;
  planned: number;
  pending: number;
  courses: Array<{
    courseCode: string;
    courseName: string;
    credits: number;
    studyStatus: StudyStatus;
  }>;
}

interface OverflowReport {
  interdisciplinary: {
    cap: number;
    totalAttempted: number;
    counted: number;
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
  未通过: 4, // 未通过课程其实不应占名额，但保留位置；下面会过滤掉
};

function parseCountTo(value: CreditCountTo | null): { category: CategoryCode; type: RequirementTypeCode } | null {
  if (!value) return null;
  if (value === "通识教育-选修") return { category: "general_education", type: "elective" };
  if (value === "大类平台-选修") return { category: "major_platform", type: "elective" };
  return null;
}

function activeCourses(): Course[] {
  const program = ProgramCourseRepository.find({ limit: 1000 });
  const custom = CustomCourseRepository.find({ limit: 1000 });
  return [...program, ...custom];
}

function isCountedStatus(status: StudyStatus): boolean {
  return status === "已修读" || status === "正在修读" || status === "计划修读";
}

function statusCreditBucketField(status: StudyStatus): "earned" | "inProgress" | "planned" | null {
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

function addCourseToBucket(bucket: Bucket, course: Course): void {
  const field = statusCreditBucketField(course.studyStatus);
  if (field) bucket[field] += course.credits;
  bucket.courses.push({
    courseCode: course.courseCode,
    courseName: course.courseName,
    credits: course.credits,
    studyStatus: course.studyStatus,
  });
}

export const ProgressService = {
  compute(): {
    byCategory: Bucket[];
    totals: { required: number; earned: number; inProgress: number; planned: number; pending: number };
    overflow: OverflowReport;
  } {
    const requirements = RequirementRepository.findAll();
    const buckets = new Map<string, Bucket>();
    for (const r of requirements) {
      buckets.set(bucketKey(r.category_code as CategoryCode, r.requirement_type_code), emptyBucket(r));
    }

    const courses = activeCourses();
    const interdisciplinaryQueue: Course[] = [];

    for (const c of courses) {
      if (c.requirementType === "经法管融通") {
        interdisciplinaryQueue.push(c);
        continue;
      }
      const reqType =
        c.requirementType === "跨专业"
          ? "elective"
          : REQ_TYPE_BY_NATURE[c.requirementType];
      if (!reqType) continue;
      const targetCategory =
        c.requirementType === "跨专业" ? "general_education" : c.categoryCode;
      const bucket = buckets.get(bucketKey(targetCategory, reqType));
      if (bucket) addCourseToBucket(bucket, c);
    }

    // 经法管融通：按 (已修读 > 正在修读 > 计划修读 > 未修读) 优先级、credits 降序排队，
    // 占用累计 6 学分内的名额；溢出部分进入 overflow，不进任何 bucket。
    interdisciplinaryQueue.sort((a, b) => {
      const sp = (STATUS_PRIORITY[a.studyStatus] ?? 9) - (STATUS_PRIORITY[b.studyStatus] ?? 9);
      if (sp !== 0) return sp;
      return b.credits - a.credits;
    });

    let remaining = INTERDISCIPLINARY_CAP;
    let totalAttempted = 0;
    const overflowCourses: OverflowReport["interdisciplinary"]["overflowCourses"] = [];

    for (const c of interdisciplinaryQueue) {
      if (isCountedStatus(c.studyStatus)) totalAttempted += c.credits;
      // 未通过课程：不进 bucket、不计 attempt
      if (c.studyStatus === "未通过") continue;
      if (c.studyStatus === "未修读") {
        // 未修读不占用名额、但也不进入桶；仍要计算 attempt
        continue;
      }
      const target = parseCountTo(c.creditCountTo);
      if (!target) {
        // 经法管融通课程没填 creditCountTo（数据异常）；跳过
        continue;
      }
      if (c.credits <= remaining + 1e-9) {
        const bucket = buckets.get(bucketKey(target.category, target.type));
        if (bucket) addCourseToBucket(bucket, c);
        remaining = Math.max(0, remaining - c.credits);
      } else {
        overflowCourses.push({
          courseCode: c.courseCode,
          courseName: c.courseName,
          credits: c.credits,
          studyStatus: c.studyStatus,
        });
      }
    }

    // 计算 pending 与 totals
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
    return {
      byCategory,
      totals,
      overflow: {
        interdisciplinary: {
          cap: INTERDISCIPLINARY_CAP,
          totalAttempted,
          counted,
          overflowCredits: Math.max(0, totalAttempted - counted),
          overflowCourses,
        },
      },
    };
  },

  timeline(): {
    terms: Array<{
      term: number;
      credits: { earned: number; inProgress: number; planned: number };
      courseCount: number;
    }>;
  } {
    const terms = Array.from({ length: 8 }, (_, i) => ({
      term: i + 1,
      credits: { earned: 0, inProgress: 0, planned: 0 },
      courseCount: 0,
    }));

    for (const c of activeCourses()) {
      // program 用 actualTerm 优先，custom 用 plannedTerm（mapper 已经统一为相同字段）
      const t = c.source === "program" ? c.actualTerm ?? c.plannedTerm : c.plannedTerm;
      if (!t || t < 1 || t > 8) continue;
      const bucket = terms[t - 1];
      bucket.courseCount += 1;
      const field = statusCreditBucketField(c.studyStatus);
      if (field) bucket.credits[field] += c.credits;
    }
    return { terms };
  },
};
