import { fail } from "../../lib/errors";
import { expectNumber } from "../../lib/validate";
import { resolveCourse } from "../courses/course-resolver";
import { CustomCourseRepository } from "../courses/custom-course.repository";
import { assertPlanWritable } from "../courses/state-machine";
import type { Course } from "../courses/course.types";

function writeTerm(course: Course, term: number | null, status: "计划修读" | "未修读"): void {
  if (course.source === "program") {
    throw fail.precondition("官方培养计划是只读的，请先把课程加入我的计划", {
      courseCode: course.courseCode,
    });
  }
  CustomCourseRepository.update(course.courseCode, {
    planned_term: term,
    study_status: status,
  });
}

export const PlanService = {
  setPlan(code: string, body: unknown): Course {
    const course = resolveCourse(code);
    assertPlanWritable(course);

    const dto = (body ?? {}) as Record<string, unknown>;
    let term: number | null;
    if (dto.term === null || dto.term === undefined) {
      term = null;
    } else {
      term = expectNumber(dto.term, "term", { min: 1, max: 8, integer: true })!;
    }
    writeTerm(course, term, "计划修读");
    return resolveCourse(code);
  },

  removeFromPlan(code: string): Course {
    const course = resolveCourse(code);
    assertPlanWritable(course);
    writeTerm(course, null, "未修读");
    return resolveCourse(code);
  },
};
