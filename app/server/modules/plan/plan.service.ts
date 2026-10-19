import type { Ctx } from "../../context";
import { fail } from "../../lib/errors";
import { expectNumber } from "../../lib/validate";
import { resolveCourse } from "../courses/course-resolver";
import { CustomCourseRepository } from "../courses/custom-course.repository";
import { assertPlanWritable } from "../courses/state-machine";
import type { Course } from "../courses/course.types";

async function writeTerm(ctx: Ctx, course: Course, term: number | null, status: "计划修读" | "未修读") {
  if (course.source === "program") {
    throw fail.precondition("官方培养计划是只读的，请先把课程加入我的计划", {
      courseCode: course.courseCode,
    });
  }
  await CustomCourseRepository.update(ctx, course.courseCode, {
    planned_term: term,
    // 计划/未修读状态下不存在“实际学期”，与 study-record 口径一致；
    // 同时修复历史导入数据里残留的 actual_term（否则改计划学期后卡片不动）
    actual_term: null,
    study_status: status,
  });
}

export const PlanService = {
  async setPlan(ctx: Ctx, code: string, body: unknown): Promise<Course> {
    const course = await resolveCourse(ctx, code);
    assertPlanWritable(course);

    const dto = (body ?? {}) as Record<string, unknown>;
    let term: number | null;
    if (dto.term === null || dto.term === undefined) {
      term = null;
    } else {
      term = expectNumber(dto.term, "term", { min: 1, max: 8, integer: true })!;
    }
    await writeTerm(ctx, course, term, "计划修读");
    return resolveCourse(ctx, code);
  },

  async removeFromPlan(ctx: Ctx, code: string): Promise<Course> {
    const course = await resolveCourse(ctx, code);
    assertPlanWritable(course);
    await writeTerm(ctx, course, null, "未修读");
    return resolveCourse(ctx, code);
  },
};
