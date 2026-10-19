import type { Ctx } from "../../context";
import { fail } from "../../lib/errors";
import { expectEnum } from "../../lib/validate";
import type { Course, CreditCountTo } from "../courses/course.types";
import { resolveCourse } from "../courses/course-resolver";
import { CustomCourseRepository } from "../courses/custom-course.repository";

const CREDIT_COUNT_TO_VALUES: CreditCountTo[] = ["通识教育-选修", "大类平台-选修"];

async function writeCountTo(ctx: Ctx, course: Course, value: CreditCountTo | null) {
  if (course.source === "program") {
    throw fail.precondition("官方培养计划是只读的，请在我的计划中设置学分归属", {
      courseCode: course.courseCode,
    });
  }
  await CustomCourseRepository.update(ctx, course.courseCode, { credit_count_to: value });
}

export const CreditAssignmentService = {
  async set(ctx: Ctx, code: string, body: unknown): Promise<Course> {
    const course = await resolveCourse(ctx, code);
    if (course.requirementType !== "经法管融通") {
      throw fail.precondition(
        `仅经法管融通课程允许设置 creditCountTo，当前课程性质为 ${course.requirementType}`,
        { requirementType: course.requirementType }
      );
    }
    const dto = (body ?? {}) as Record<string, unknown>;
    const target = expectEnum(dto.creditCountTo, "creditCountTo", CREDIT_COUNT_TO_VALUES)!;
    await writeCountTo(ctx, course, target);
    return resolveCourse(ctx, code);
  },

  async clear(ctx: Ctx, code: string): Promise<Course> {
    const course = await resolveCourse(ctx, code);
    if (course.requirementType === "经法管融通") {
      throw fail.precondition(
        "经法管融通课程不能清空 creditCountTo；先调 PATCH /courses/:code 切换性质",
        { requirementType: course.requirementType }
      );
    }
    await writeCountTo(ctx, course, null);
    return resolveCourse(ctx, code);
  },
};
