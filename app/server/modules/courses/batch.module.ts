import type { Router } from "express";
import { fail } from "../../lib/errors";
import { handle, ok } from "../../lib/response";
import { unitOfWork } from "../../lib/unit-of-work";
import { expectArray, expectEnum, expectNumber } from "../../lib/validate";
import { TrashService } from "../trash/trash.service";
import { resolveCourseOrNull } from "./course-resolver";
import { CourseService } from "./course.service";
import { CustomCourseRepository } from "./custom-course.repository";
import { ProgramCourseRepository } from "./program-course.repository";
import {
  assertNotInTrash,
  assertPlanWritable,
  assertStudyRecordValid,
} from "./state-machine";
import type { Course, CreditCountTo, StudyStatus } from "./course.types";

const STUDY_STATUSES: StudyStatus[] = [
  "未修读",
  "计划修读",
  "正在修读",
  "已修读",
  "未通过",
];
const CREDIT_COUNT_TO_VALUES: CreditCountTo[] = ["通识教育-选修", "大类平台-选修"];
const INTERDISCIPLINARY_CAP = 6;

interface BatchPlanItem {
  courseCode: string;
  term: number | null;
}

interface BatchStudyItem {
  courseCode: string;
  studyStatus: StudyStatus;
  term: number | null;
  score: number | null;
}

interface BatchAssignItem {
  courseCode: string;
  creditCountTo: CreditCountTo;
}

interface BatchError {
  index: number;
  courseCode: string;
  code: string;
  message: string;
}

function parsePlanItems(body: unknown): BatchPlanItem[] {
  const dto = (body ?? {}) as Record<string, unknown>;
  const items = expectArray<Record<string, unknown>>(dto.items, "items", { min: 1, max: 200 });
  return items.map((raw, idx) => {
    const courseCode = String(raw.courseCode ?? "");
    if (!courseCode) {
      throw fail.validation(`items[${idx}].courseCode 必填`, { [`items[${idx}].courseCode`]: "必填" });
    }
    let term: number | null;
    if (raw.term === null || raw.term === undefined) term = null;
    else term = expectNumber(raw.term, `items[${idx}].term`, { min: 1, max: 8, integer: true })!;
    return { courseCode, term };
  });
}

function parseStudyItems(body: unknown): BatchStudyItem[] {
  const dto = (body ?? {}) as Record<string, unknown>;
  const items = expectArray<Record<string, unknown>>(dto.items, "items", { min: 1, max: 200 });
  return items.map((raw, idx) => {
    const courseCode = String(raw.courseCode ?? "");
    if (!courseCode) throw fail.validation(`items[${idx}].courseCode 必填`);
    const studyStatus = expectEnum(raw.studyStatus, `items[${idx}].studyStatus`, STUDY_STATUSES)!;
    let term: number | null;
    if (raw.term === null || raw.term === undefined) term = null;
    else term = expectNumber(raw.term, `items[${idx}].term`, { min: 1, max: 8, integer: true })!;
    let score: number | null;
    if (raw.score === null || raw.score === undefined) score = null;
    else score = expectNumber(raw.score, `items[${idx}].score`, { min: 0, max: 100 })!;
    return { courseCode, studyStatus, term, score };
  });
}

function parseAssignItems(body: unknown): BatchAssignItem[] {
  const dto = (body ?? {}) as Record<string, unknown>;
  const items = expectArray<Record<string, unknown>>(dto.items, "items", { min: 1, max: 200 });
  return items.map((raw, idx) => {
    const courseCode = String(raw.courseCode ?? "");
    if (!courseCode) throw fail.validation(`items[${idx}].courseCode 必填`);
    const creditCountTo = expectEnum(
      raw.creditCountTo,
      `items[${idx}].creditCountTo`,
      CREDIT_COUNT_TO_VALUES
    )!;
    return { courseCode, creditCountTo };
  });
}

function ensureUniqueCodes(codes: string[]) {
  const seen = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) throw fail.validation(`items 中包含重复 courseCode：${c}`);
    seen.add(c);
  }
}

function writeTerm(course: Course, term: number | null) {
  if (course.source === "program") {
    ProgramCourseRepository.update(course.courseCode, {
      planned_term: term,
      study_status: term === null ? "未修读" : "计划修读",
    });
  } else {
    CustomCourseRepository.update(course.courseCode, {
      term_number: term,
      study_status: term === null ? "未修读" : "计划修读",
    });
  }
}

function writeStudy(course: Course, next: { studyStatus: StudyStatus; term: number | null; score: number | null }) {
  if (course.source === "program") {
    ProgramCourseRepository.update(course.courseCode, {
      study_status: next.studyStatus,
      ...(next.studyStatus === "未修读"
        ? { planned_term: null, actual_term: null, score: null }
        : next.studyStatus === "计划修读" || next.studyStatus === "正在修读"
          ? { planned_term: next.term }
          : { actual_term: next.term, score: next.score }),
    });
  } else {
    CustomCourseRepository.update(course.courseCode, {
      study_status: next.studyStatus,
      term_number: next.studyStatus === "未修读" ? null : next.term,
      score: next.studyStatus === "未修读" ? null : next.score,
    });
  }
}

function writeAssign(course: Course, value: CreditCountTo) {
  if (course.source === "program") {
    ProgramCourseRepository.update(course.courseCode, { credit_count_to: value });
  } else {
    CustomCourseRepository.update(course.courseCode, { credit_count_to: value });
  }
}

export function registerCourseBatchRoutes(apiRouter: Router) {
  apiRouter.post(
    /^\/courses:batch-plan$/,
    handle((req, res) => {
      const items = parsePlanItems(req.body);
      ensureUniqueCodes(items.map((i) => i.courseCode));
      ok(
        res,
        unitOfWork(() => {
          const errors: BatchError[] = [];
          const courses: Array<{ course: Course; term: number | null }> = [];
          items.forEach((it, idx) => {
            const c = resolveCourseOrNull(it.courseCode);
            if (!c) {
              errors.push({ index: idx, courseCode: it.courseCode, code: "NOT_FOUND", message: `课程不存在: ${it.courseCode}` });
              return;
            }
            try {
              assertPlanWritable(c);
              courses.push({ course: c, term: it.term });
            } catch (e: unknown) {
              const err = e as { code?: string; message?: string };
              errors.push({
                index: idx,
                courseCode: it.courseCode,
                code: err.code ?? "PRECONDITION_FAILED",
                message: err.message ?? "状态机校验失败",
              });
            }
          });
          if (errors.length) throw fail.precondition("批量加入计划失败", { items: errors });
          for (const { course, term } of courses) writeTerm(course, term);
          const results = courses.map(({ course }) => resolveCourseOrNull(course.courseCode)!);
          return { affected: results.length, results };
        })
      );
    })
  );

  apiRouter.post(
    /^\/courses:batch-study-record$/,
    handle((req, res) => {
      const items = parseStudyItems(req.body);
      ensureUniqueCodes(items.map((i) => i.courseCode));
      ok(
        res,
        unitOfWork(() => {
          const errors: BatchError[] = [];
          const courses: Array<{ course: Course; next: BatchStudyItem }> = [];
          items.forEach((it, idx) => {
            const c = resolveCourseOrNull(it.courseCode);
            if (!c) {
              errors.push({ index: idx, courseCode: it.courseCode, code: "NOT_FOUND", message: `课程不存在: ${it.courseCode}` });
              return;
            }
            try {
              assertNotInTrash(c);
              assertStudyRecordValid(it);
              courses.push({ course: c, next: it });
            } catch (e: unknown) {
              const err = e as { code?: string; message?: string };
              errors.push({
                index: idx,
                courseCode: it.courseCode,
                code: err.code ?? "PRECONDITION_FAILED",
                message: err.message ?? "状态机校验失败",
              });
            }
          });
          if (errors.length) throw fail.precondition("批量录入修读失败", { items: errors });
          for (const { course, next } of courses) writeStudy(course, next);
          const results = courses.map(({ course }) => resolveCourseOrNull(course.courseCode)!);
          return { affected: results.length, results };
        })
      );
    })
  );

  apiRouter.post(
    /^\/courses:batch-trash$/,
    handle((req, res) => {
      ok(res, TrashService.batchSoftDelete(req.body));
    })
  );

  apiRouter.post(
    /^\/courses:batch-credit-assignment$/,
    handle((req, res) => {
      const items = parseAssignItems(req.body);
      ensureUniqueCodes(items.map((i) => i.courseCode));
      ok(
        res,
        unitOfWork(() => {
          const errors: BatchError[] = [];
          const targets: Array<{ course: Course; value: CreditCountTo }> = [];
          items.forEach((it, idx) => {
            const c = resolveCourseOrNull(it.courseCode);
            if (!c) {
              errors.push({ index: idx, courseCode: it.courseCode, code: "NOT_FOUND", message: `课程不存在: ${it.courseCode}` });
              return;
            }
            if (c.requirementType !== "经法管融通") {
              errors.push({
                index: idx,
                courseCode: it.courseCode,
                code: "PRECONDITION_FAILED",
                message: `课程性质为 ${c.requirementType}，不允许设置 creditCountTo`,
              });
              return;
            }
            if (c.isDeleted) {
              errors.push({
                index: idx,
                courseCode: it.courseCode,
                code: "PRECONDITION_FAILED",
                message: "课程在垃圾篓中",
              });
              return;
            }
            targets.push({ course: c, value: it.creditCountTo });
          });
          if (errors.length) throw fail.precondition("批量学分归属失败", { items: errors });

          // 6 学分上限校验：模拟提交后所有经法管融通的有效学分。
          const counted = simulatePostAssignCounted(
            targets.map((t) => ({ courseCode: t.course.courseCode, creditCountTo: t.value }))
          );
          if (counted > INTERDISCIPLINARY_CAP) {
            throw fail.precondition(
              `经法管融通学分合计 ${counted} 超过上限 ${INTERDISCIPLINARY_CAP}`,
              { cap: INTERDISCIPLINARY_CAP, counted }
            );
          }

          for (const { course, value } of targets) writeAssign(course, value);
          const results = targets.map(({ course }) => resolveCourseOrNull(course.courseCode)!);
          return { affected: results.length, results };
        })
      );
    })
  );
}

/**
 * 用本次批量提交后的状态，重新统计经法管融通课程的有效学分（不超过 6）。
 * 仅作上限拦截使用；正式的进度计算见 ProgressService.compute()。
 */
function simulatePostAssignCounted(
  overrides: Array<{ courseCode: string; creditCountTo: CreditCountTo }>
): number {
  const overrideMap = new Map(overrides.map((o) => [o.courseCode, o.creditCountTo]));
  const allInterdisciplinary = CourseService.list({ requirementType: "经法管融通", limit: 1000 }).data;
  const visible = allInterdisciplinary.filter((c) => !c.isDeleted && !c.isPermanentlyDeleted);
  // 状态优先级与 ProgressService 一致
  const priority: Record<StudyStatus, number> = {
    已修读: 0,
    正在修读: 1,
    计划修读: 2,
    未修读: 3,
    未通过: 4,
  };
  visible.sort((a, b) => {
    const sp = priority[a.studyStatus] - priority[b.studyStatus];
    if (sp !== 0) return sp;
    return b.credits - a.credits;
  });
  let remaining = INTERDISCIPLINARY_CAP;
  let counted = 0;
  for (const c of visible) {
    if (c.studyStatus === "未修读" || c.studyStatus === "未通过") continue;
    const target = overrideMap.get(c.courseCode) ?? c.creditCountTo;
    if (!target) continue;
    if (c.credits <= remaining + 1e-9) {
      counted += c.credits;
      remaining -= c.credits;
    }
  }
  return counted;
}

