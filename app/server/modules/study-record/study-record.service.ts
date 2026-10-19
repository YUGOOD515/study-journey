import type { Ctx } from "../../context";
import { fail } from "../../lib/errors";
import { expectEnum, expectNumber } from "../../lib/validate";
import type { Course, StudyStatus } from "../courses/course.types";
import { resolveCourse } from "../courses/course-resolver";
import { CustomCourseRepository } from "../courses/custom-course.repository";
import { assertNotInTrash, assertStudyRecordValid } from "../courses/state-machine";

const STUDY_STATUSES: StudyStatus[] = [
  "未修读",
  "计划修读",
  "正在修读",
  "已修读",
  "未通过",
];

async function applyRecord(
  ctx: Ctx,
  course: Course,
  next: { studyStatus: StudyStatus; term: number | null; score: number | null }
): Promise<void> {
  if (course.source === "program") {
    throw fail.precondition("官方培养计划是只读的，请先把课程加入我的计划", {
      courseCode: course.courseCode,
    });
  }

  await CustomCourseRepository.update(ctx, course.courseCode, {
    study_status: next.studyStatus,
    planned_term: next.studyStatus === "未修读" ? null : next.term,
    actual_term:
      next.studyStatus === "正在修读" ||
      next.studyStatus === "已修读" ||
      next.studyStatus === "未通过"
        ? next.term
        : null,
    score: next.studyStatus === "未修读" ? null : next.score,
  });
}

export const StudyRecordService = {
  async upsert(ctx: Ctx, code: string, body: unknown): Promise<Course> {
    const course = await resolveCourse(ctx, code);
    assertNotInTrash(course);

    const dto = (body ?? {}) as Record<string, unknown>;
    const studyStatus = expectEnum(dto.studyStatus, "studyStatus", STUDY_STATUSES)!;
    const term =
      dto.term === null || dto.term === undefined
        ? null
        : expectNumber(dto.term, "term", { min: 1, max: 8, integer: true })!;
    const score =
      dto.score === null || dto.score === undefined
        ? null
        : expectNumber(dto.score, "score", { min: 0, max: 100 })!;

    assertStudyRecordValid({ studyStatus, term, score });
    await applyRecord(ctx, course, { studyStatus, term, score });
    return resolveCourse(ctx, code);
  },

  async clear(ctx: Ctx, code: string, fallback: "none" | "plan" = "none"): Promise<Course> {
    const course = await resolveCourse(ctx, code);
    assertNotInTrash(course);

    if (
      course.studyStatus !== "已修读" &&
      course.studyStatus !== "正在修读" &&
      course.studyStatus !== "未通过"
    ) {
      throw fail.conflict(`当前状态 ${course.studyStatus} 没有可清空的修读记录`, {
        expected: ["已修读", "正在修读", "未通过"],
        actual: course.studyStatus,
      });
    }

    if (fallback === "plan" && course.actualTerm !== null) {
      await applyRecord(ctx, course, { studyStatus: "计划修读", term: course.actualTerm, score: null });
    } else {
      await applyRecord(ctx, course, { studyStatus: "未修读", term: null, score: null });
    }
    return resolveCourse(ctx, code);
  },
};
