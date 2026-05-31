import type {
  CourseWithCategory,
  PersonalPlanItem,
  SemesterCourse,
} from "../types";
import { parseOfferedTerm } from "./offeredTerm";

/**
 * “我的计划合计”的唯一计算口径，时间轴页与旅迹页共用（保证两处一致）。
 *
 * 规则：只统计落在 8 学期时间轴上（plannedTerm != null，抽屉里的不算）的课程学分。
 *  - 官方课程：override(personal_plan).planned_term ?? actual_term ?? planned_term ?? 默认开课学期
 *  - 自定义课程：personal_plan(manual) 的 planned_term；已修/在修 custom 课用其 term_number
 * 不按学习状态、不按毕业要求桶过滤——它表示“整张计划时间轴上铺了多少学分”。
 */

function defaultTerm(course: CourseWithCategory): number | null {
  const parsed = parseOfferedTerm(course.offered_term);
  if (parsed.isFlexible || parsed.primary == null) return null;
  return parsed.primary;
}

export function myPlanTotalCredits(
  courses: CourseWithCategory[],
  personalPlan: PersonalPlanItem[],
  done: SemesterCourse[]
): number {
  // 官方课程：用 personal_plan 的 override 决定学期，否则按 actual/planned/默认。
  const officialOverrides = new Map(
    personalPlan
      .filter((p) => p.item_type === "official" && p.course_code)
      .map((p) => [p.course_code as string, p])
  );

  let officialOnTimeline = 0;
  for (const c of courses) {
    const override = officialOverrides.get(c.course_code);
    const plannedTerm = override
      ? override.planned_term
      : c.actual_term ?? c.planned_term ?? defaultTerm(c);
    if (plannedTerm != null) officialOnTimeline += c.credits;
  }

  // 自定义课程：计划修读来自 personal_plan(manual)；已修/在修 custom 来自 done。
  const seenCodes = new Set<string>();
  let manualOnTimeline = 0;
  for (const item of personalPlan) {
    if (item.item_type !== "manual") continue;
    if (item.course_code) seenCodes.add(item.course_code);
    if (item.planned_term != null) manualOnTimeline += item.credits;
  }
  for (const item of done) {
    if (
      item.source !== "manual" ||
      !item.course_code ||
      item.category_code == null ||
      item.course_nature == null ||
      seenCodes.has(item.course_code)
    ) {
      continue;
    }
    if (item.term_number != null) manualOnTimeline += item.credits;
  }

  return officialOnTimeline + manualOnTimeline;
}
