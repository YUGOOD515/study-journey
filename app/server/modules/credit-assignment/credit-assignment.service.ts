import { fail } from "../../lib/errors";
import { expectEnum } from "../../lib/validate";
import type { Course, CreditCountTo } from "../courses/course.types";
import { resolveCourse } from "../courses/course-resolver";
import { CustomCourseRepository } from "../courses/custom-course.repository";
import { ProgramCourseRepository } from "../courses/program-course.repository";

const CREDIT_COUNT_TO_VALUES: CreditCountTo[] = ["通识教育-选修", "大类平台-选修"];

function writeCountTo(course: Course, value: CreditCountTo | null): void {
  const patch = { credit_count_to: value };
  if (course.source === "program") ProgramCourseRepository.update(course.courseCode, patch);
  else CustomCourseRepository.update(course.courseCode, patch);
}

export const CreditAssignmentService = {
  set(code: string, body: unknown): Course {
    const course = resolveCourse(code);
    if (course.requirementType !== "经法管融通") {
      throw fail.precondition(
        `仅经法管融通课程允许设置 creditCountTo，当前课程性质为 ${course.requirementType}`,
        { requirementType: course.requirementType }
      );
    }
    const dto = (body ?? {}) as Record<string, unknown>;
    const target = expectEnum(dto.creditCountTo, "creditCountTo", CREDIT_COUNT_TO_VALUES)!;
    writeCountTo(course, target);
    return resolveCourse(code);
  },

  clear(code: string): Course {
    const course = resolveCourse(code);
    if (course.requirementType === "经法管融通") {
      throw fail.precondition(
        "经法管融通课程不能清空 creditCountTo；先调 PATCH /courses/:code 切换性质",
        { requirementType: course.requirementType }
      );
    }
    writeCountTo(course, null);
    return resolveCourse(code);
  },
};
