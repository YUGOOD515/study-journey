import { fail } from "../../lib/errors";
import { expectEnum, expectNumber } from "../../lib/validate";
import type { Course, StudyStatus } from "../courses/course.types";
import { resolveCourse } from "../courses/course-resolver";
import { CustomCourseRepository } from "../courses/custom-course.repository";
import { ProgramCourseRepository } from "../courses/program-course.repository";
import { assertNotInTrash, assertStudyRecordValid } from "../courses/state-machine";

const STUDY_STATUSES: StudyStatus[] = [
  "未修读",
  "计划修读",
  "正在修读",
  "已修读",
  "未通过",
];

function applyRecord(
  course: Course,
  next: { studyStatus: StudyStatus; term: number | null; score: number | null }
): void {
  if (course.source === "program") {
    ProgramCourseRepository.update(course.courseCode, {
      study_status: next.studyStatus,
      // program 区分 planned_term / actual_term；
      //  - 计划修读/正在修读：写 planned_term，actual_term 保持
      //  - 已修读/未通过：写 actual_term；不动 planned_term
      //  - 未修读：两者都清空
      ...(next.studyStatus === "未修读"
        ? { planned_term: null, actual_term: null, score: null }
        : next.studyStatus === "计划修读" || next.studyStatus === "正在修读"
          ? { planned_term: next.term }
          : { actual_term: next.term, score: next.score }),
    });
  } else {
    // custom 没有 actual_term；term_number 同时承担两种语义
    CustomCourseRepository.update(course.courseCode, {
      study_status: next.studyStatus,
      term_number: next.studyStatus === "未修读" ? null : next.term,
      score: next.studyStatus === "未修读" ? null : next.score,
    });
  }
}

export const StudyRecordService = {
  upsert(code: string, body: unknown): Course {
    const course = resolveCourse(code);
    assertNotInTrash(course);

    const dto = (body ?? {}) as Record<string, unknown>;
    const studyStatus = expectEnum(dto.studyStatus, "studyStatus", STUDY_STATUSES)!;
    let term: number | null;
    if (dto.term === null || dto.term === undefined) {
      term = null;
    } else {
      term = expectNumber(dto.term, "term", { min: 1, max: 8, integer: true })!;
    }
    let score: number | null;
    if (dto.score === null || dto.score === undefined) {
      score = null;
    } else {
      score = expectNumber(dto.score, "score", { min: 0, max: 100 })!;
    }

    assertStudyRecordValid({ studyStatus, term, score });

    applyRecord(course, { studyStatus, term, score });
    return resolveCourse(code);
  },

  clear(code: string, fallback: "none" | "plan" = "none"): Course {
    const course = resolveCourse(code);
    assertNotInTrash(course);

    if (
      course.studyStatus !== "已修读" &&
      course.studyStatus !== "正在修读" &&
      course.studyStatus !== "未通过"
    ) {
      throw fail.conflict(
        `当前状态 ${course.studyStatus} 没有可清空的修读记录`,
        { expected: ["已修读", "正在修读", "未通过"], actual: course.studyStatus }
      );
    }

    if (fallback === "plan" && course.actualTerm !== null) {
      // 保留学期，状态回到计划修读
      const planTerm = course.actualTerm;
      applyRecord(course, { studyStatus: "计划修读", term: planTerm, score: null });
    } else {
      applyRecord(course, { studyStatus: "未修读", term: null, score: null });
    }
    return resolveCourse(code);
  },
};
