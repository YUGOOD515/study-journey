import type {
  CategoryCode,
  ProgressBucket,
  ProgressBucketCourse,
  ProgressResponse,
} from "../types";
import type { FlowItem } from "../components/InterdisciplinaryFlow";
import { roundCredits } from "./credits";

/**
 * 进度页数据映射层。
 *
 * 唯一真相源是后端 `/api/progress`（口径见 docs/16）。本文件**不再自行计算学分桶**，
 * 只把后端返回的 byCategory 结构映射为旅迹页组件沿用的 CategoryBundle / RequirementRow 形状。
 */

export type CourseNature = "必修" | "选修" | "跨专业";

export interface EarnedCourse {
  source: "official" | "manual";
  courseCode: string | null;
  courseName: string;
  credits: number;
  score: number | null;
  categoryCode: CategoryCode;
  courseNature: CourseNature;
}

export interface PlannedCourse {
  source: "official" | "manual";
  origin: "plan" | "record";
  courseCode: string | null;
  courseName: string;
  credits: number;
  /** null = 显式放进"待安排"抽屉 */
  plannedTerm: number | null;
  categoryCode: CategoryCode;
  courseNature: CourseNature;
  isInterdisciplinary?: boolean;
  assignedTo?: "interdisciplinary" | "elective";
}

export interface RequirementRow {
  categoryCode: CategoryCode;
  categoryName: string;
  requirementType: "required" | "elective" | "interdisciplinary";
  requirementName: string;
  requiredCredits: number;
  earnedCredits: number;
  /** 正在修读学分（与 earned / planned 分开，便于分段进度条展示）。 */
  inProgressCredits: number;
  earnedCourses: EarnedCourse[];
  /** 计划修读学分（不含正在修读）。 */
  plannedCredits: number;
  plannedCourses: PlannedCourse[];
}

export interface CategoryBundle {
  code: CategoryCode;
  name: string;
  rows: RequirementRow[];
  totalRequired: number;
  totalEarned: number;
  totalInProgress: number;
  totalPlanned: number;
}

/** 把课程号直接返回（不再合成 number id，统一使用 courseCode 寻址）。 */
export type IdForCourse = (courseCode: string, source: "program" | "custom") => string;

const CATEGORY_ORDER: CategoryCode[] = [
  "general_education",
  "major_platform",
  "professional_education",
  "quality_education",
  "practice_education",
];

const CATEGORY_NAME: Record<CategoryCode, string> = {
  general_education: "通识教育",
  major_platform: "大类平台",
  professional_education: "专业教育",
  quality_education: "素质教育",
  practice_education: "实践教育",
};

function visibleNature(requirementType: ProgressBucketCourse["requirementType"]): CourseNature {
  if (requirementType === "经法管融通") return "选修";
  return requirementType;
}

function assignmentOf(creditCountTo: string | null): "interdisciplinary" | "elective" {
  // 大类平台-选修（含缺省）= 计入大类平台经法管桶；通识教育-选修 = 切到通识选修。
  return creditCountTo === "通识教育-选修" ? "elective" : "interdisciplinary";
}

function isEarned(c: ProgressBucketCourse): boolean {
  return c.studyStatus === "已修读" || c.studyStatus === "未通过";
}

/** 落在时间轴上、尚未完成的课（计划 / 在修 / 默认放置的未修）——与时间轴“我的计划”口径一致。 */
function isPlanned(c: ProgressBucketCourse): boolean {
  return c.term != null && !isEarned(c);
}

function toEarned(c: ProgressBucketCourse, _idFor: IdForCourse): EarnedCourse {
  const source = c.source === "program" ? "official" : "manual";
  return {
    source,
    courseCode: c.courseCode,
    courseName: c.courseName,
    credits: c.credits,
    score: c.score,
    categoryCode: c.categoryCode,
    courseNature: visibleNature(c.requirementType),
  };
}

function toPlanned(c: ProgressBucketCourse, _idFor: IdForCourse): PlannedCourse {
  const source = c.source === "program" ? "official" : "manual";
  return {
    source,
    // 正在修读 视为已有修读记录（record）；计划修读 视为计划项（plan）。
    origin: c.studyStatus === "正在修读" ? "record" : "plan",
    courseCode: c.courseCode,
    courseName: c.courseName,
    credits: c.credits,
    plannedTerm: c.term,
    categoryCode: c.categoryCode,
    courseNature: visibleNature(c.requirementType),
    isInterdisciplinary: c.requirementType === "经法管融通",
    assignedTo: assignmentOf(c.creditCountTo),
  };
}

function toRow(bucket: ProgressBucket, idFor: IdForCourse): RequirementRow {
  const earnedCourses = bucket.courses.filter(isEarned).map((c) => toEarned(c, idFor));
  const plannedCourses = bucket.courses.filter(isPlanned).map((c) => toPlanned(c, idFor));
  return {
    categoryCode: bucket.categoryCode,
    categoryName: bucket.categoryName,
    requirementType: bucket.requirementTypeCode,
    requirementName: bucket.requirementName,
    requiredCredits: bucket.required,
    earnedCredits: roundCredits(bucket.earned),
    inProgressCredits: roundCredits(bucket.inProgress),
    earnedCourses,
    plannedCredits: roundCredits(bucket.planned),
    plannedCourses,
  };
}

/** 把 /api/progress 的 byCategory 映射为按类别打包的 5 张卡片数据。 */
export function bundlesFromProgress(
  progress: ProgressResponse,
  idFor: IdForCourse
): CategoryBundle[] {
  const rowsByCategory = new Map<CategoryCode, RequirementRow[]>();
  for (const code of CATEGORY_ORDER) rowsByCategory.set(code, []);
  for (const bucket of progress.byCategory) {
    rowsByCategory.get(bucket.categoryCode)?.push(toRow(bucket, idFor));
  }
  return CATEGORY_ORDER.map((code) => {
    const rows = rowsByCategory.get(code) ?? [];
    return {
      code,
      name: rows[0]?.categoryName ?? CATEGORY_NAME[code],
      rows,
      totalRequired: roundCredits(rows.reduce((s, r) => s + r.requiredCredits, 0)),
      totalEarned: roundCredits(rows.reduce((s, r) => s + r.earnedCredits, 0)),
      totalInProgress: roundCredits(rows.reduce((s, r) => s + r.inProgressCredits, 0)),
      totalPlanned: roundCredits(rows.reduce((s, r) => s + r.plannedCredits, 0)),
    };
  });
}

/** 从进度结果里抽取所有经法管融通课程，构造流向图 items（每门课一次）。 */
export function flowItemsFromProgress(
  progress: ProgressResponse,
  idFor: IdForCourse
): FlowItem[] {
  const seen = new Set<string>();
  const list: FlowItem[] = [];
  for (const bucket of progress.byCategory) {
    for (const c of bucket.courses) {
      if (c.requirementType !== "经法管融通") continue;
      if (seen.has(c.courseCode)) continue;
      seen.add(c.courseCode);
      const key =
        c.source === "program"
          ? `official:${c.courseCode}`
          : `record:${c.courseCode}`;
      list.push({
        key,
        courseName: c.courseName,
        credits: c.credits,
        categoryCode: c.categoryCode,
        isEarned: c.studyStatus === "已修读",
        assignment: assignmentOf(c.creditCountTo),
      });
    }
  }
  return list;
}
