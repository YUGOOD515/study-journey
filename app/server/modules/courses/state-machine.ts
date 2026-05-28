import { fail } from "../../lib/errors";
import type { Course, StudyStatus } from "./course.types";

/**
 * 状态机相关的纯函数。完整规则见 docs/10-api-redesign.md §7.1。
 *
 * 不做 IO；调用方负责取 Course、计算变更后调 repository。
 */

const NEEDS_TERM: ReadonlySet<StudyStatus> = new Set([
  "计划修读",
  "正在修读",
  "已修读",
  "未通过",
]);

const NEEDS_NO_SCORE: ReadonlySet<StudyStatus> = new Set([
  "未修读",
  "计划修读",
  "正在修读",
]);

export function assertNotInTrash(course: Course): void {
  if (course.isDeleted) {
    throw fail.precondition("课程在垃圾篓中，不允许操作；请先恢复", {
      course: { courseCode: course.courseCode, isDeleted: true },
    });
  }
}

export function assertPlanWritable(course: Course): void {
  assertNotInTrash(course);
  // /plan 仅允许在 未修读/计划修读 状态下使用
  if (course.studyStatus !== "未修读" && course.studyStatus !== "计划修读") {
    throw fail.conflict(
      `课程当前状态为 ${course.studyStatus}，不能通过 /plan 修改；请改用 /study-record`,
      { expected: ["未修读", "计划修读"], actual: course.studyStatus }
    );
  }
}

export function assertStudyRecordValid(input: {
  studyStatus: StudyStatus;
  term: number | null;
  score: number | null;
}): void {
  const { studyStatus, term, score } = input;
  if (NEEDS_TERM.has(studyStatus) && term === null) {
    throw fail.precondition(
      `状态 ${studyStatus} 必须提供 term`,
      { fields: { term: "必填" } }
    );
  }
  if (studyStatus === "未修读" && term !== null) {
    throw fail.precondition(
      `状态 未修读 时 term 必须为 null`,
      { fields: { term: "状态不匹配" } }
    );
  }
  if (NEEDS_NO_SCORE.has(studyStatus) && score !== null) {
    throw fail.precondition(
      `状态 ${studyStatus} 不允许设置 score`,
      { fields: { score: "状态不匹配" } }
    );
  }
}
