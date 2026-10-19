import type { App } from "../../app-types";
import type { Ctx } from "../../context";
import { fail } from "../../lib/errors";
import { ok, readJson } from "../../lib/response";
import { expectArray, expectEnum, expectNumber } from "../../lib/validate";
import { TrashService } from "../trash/trash.service";
import { resolveCourseOrNull } from "./course-resolver";
import { CourseService } from "./course.service";
import { CustomCourseRepository } from "./custom-course.repository";
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

function assertCustom(course: Course) {
  if (course.source === "program") {
    throw fail.precondition("官方培养计划是只读的，请先把课程加入我的计划", {
      courseCode: course.courseCode,
    });
  }
}

async function writeTerm(ctx: Ctx, course: Course, term: number | null) {
  assertCustom(course);
  await CustomCourseRepository.update(ctx, course.courseCode, {
    term_number: term,
    study_status: term === null ? "未修读" : "计划修读",
  });
}

async function writeStudy(
  ctx: Ctx,
  course: Course,
  next: { studyStatus: StudyStatus; term: number | null; score: number | null }
) {
  assertCustom(course);
  await CustomCourseRepository.update(ctx, course.courseCode, {
    study_status: next.studyStatus,
    term_number: next.studyStatus === "未修读" ? null : next.term,
    score: next.studyStatus === "未修读" ? null : next.score,
  });
}

async function writeAssign(ctx: Ctx, course: Course, value: CreditCountTo) {
  assertCustom(course);
  await CustomCourseRepository.update(ctx, course.courseCode, { credit_count_to: value });
}

function toBatchError(idx: number, courseCode: string, e: unknown, fallback: string): BatchError {
  const err = e as { code?: string; message?: string };
  return {
    index: idx,
    courseCode,
    code: err.code ?? "PRECONDITION_FAILED",
    message: err.message ?? fallback,
  };
}

async function reload(ctx: Ctx, courses: Course[]): Promise<Course[]> {
  const results: Course[] = [];
  for (const c of courses) {
    const latest = await resolveCourseOrNull(ctx, c.courseCode);
    if (latest) results.push(latest);
  }
  return results;
}

export function registerCourseBatchRoutes(app: App) {
  app.post("/courses:batch-plan", async (c) => {
    const ctx = c.var.ctx;
    const items = parsePlanItems(await readJson(c));
    ensureUniqueCodes(items.map((i) => i.courseCode));
    const errors: BatchError[] = [];
    const targets: Array<{ course: Course; term: number | null }> = [];
    for (const [idx, it] of items.entries()) {
      const course = await resolveCourseOrNull(ctx, it.courseCode);
      if (!course) {
        errors.push({ index: idx, courseCode: it.courseCode, code: "NOT_FOUND", message: `课程不存在: ${it.courseCode}` });
        continue;
      }
      try {
        assertPlanWritable(course);
        assertCustom(course);
        targets.push({ course, term: it.term });
      } catch (e) {
        errors.push(toBatchError(idx, it.courseCode, e, "状态机校验失败"));
      }
    }
    if (errors.length) throw fail.precondition("批量加入计划失败", { items: errors });
    await ctx.db.atomic(async () => {
      for (const { course, term } of targets) await writeTerm(ctx, course, term);
    });
    const results = await reload(ctx, targets.map((t) => t.course));
    return ok(c, { affected: results.length, results });
  });

  app.post("/courses:batch-study-record", async (c) => {
    const ctx = c.var.ctx;
    const items = parseStudyItems(await readJson(c));
    ensureUniqueCodes(items.map((i) => i.courseCode));
    const errors: BatchError[] = [];
    const targets: Array<{ course: Course; next: BatchStudyItem }> = [];
    for (const [idx, it] of items.entries()) {
      const course = await resolveCourseOrNull(ctx, it.courseCode);
      if (!course) {
        errors.push({ index: idx, courseCode: it.courseCode, code: "NOT_FOUND", message: `课程不存在: ${it.courseCode}` });
        continue;
      }
      try {
        assertNotInTrash(course);
        assertStudyRecordValid(it);
        assertCustom(course);
        targets.push({ course, next: it });
      } catch (e) {
        errors.push(toBatchError(idx, it.courseCode, e, "状态机校验失败"));
      }
    }
    if (errors.length) throw fail.precondition("批量录入修读失败", { items: errors });
    await ctx.db.atomic(async () => {
      for (const { course, next } of targets) await writeStudy(ctx, course, next);
    });
    const results = await reload(ctx, targets.map((t) => t.course));
    return ok(c, { affected: results.length, results });
  });

  app.post("/courses:batch-trash", async (c) => ok(c, await TrashService.batchSoftDelete(c.var.ctx, await readJson(c))));

  app.post("/courses:batch-credit-assignment", async (c) => {
    const ctx = c.var.ctx;
    const items = parseAssignItems(await readJson(c));
    ensureUniqueCodes(items.map((i) => i.courseCode));
    const errors: BatchError[] = [];
    const targets: Array<{ course: Course; value: CreditCountTo }> = [];
    for (const [idx, it] of items.entries()) {
      const course = await resolveCourseOrNull(ctx, it.courseCode);
      if (!course) {
        errors.push({ index: idx, courseCode: it.courseCode, code: "NOT_FOUND", message: `课程不存在: ${it.courseCode}` });
        continue;
      }
      if (course.requirementType !== "经法管融通") {
        errors.push({
          index: idx,
          courseCode: it.courseCode,
          code: "PRECONDITION_FAILED",
          message: `课程性质为 ${course.requirementType}，不允许设置 creditCountTo`,
        });
        continue;
      }
      if (course.isDeleted) {
        errors.push({ index: idx, courseCode: it.courseCode, code: "PRECONDITION_FAILED", message: "课程在垃圾篓中" });
        continue;
      }
      try {
        assertCustom(course);
        targets.push({ course, value: it.creditCountTo });
      } catch (e) {
        errors.push(toBatchError(idx, it.courseCode, e, "官方课程只读"));
      }
    }
    if (errors.length) throw fail.precondition("批量学分归属失败", { items: errors });

    // 6 学分上限校验：模拟提交后所有经法管融通的有效学分。
    const counted = await simulatePostAssignCounted(
      ctx,
      targets.map((t) => ({ courseCode: t.course.courseCode, creditCountTo: t.value }))
    );
    if (counted > INTERDISCIPLINARY_CAP) {
      throw fail.precondition(`经法管融通学分合计 ${counted} 超过上限 ${INTERDISCIPLINARY_CAP}`, {
        cap: INTERDISCIPLINARY_CAP,
        counted,
      });
    }

    await ctx.db.atomic(async () => {
      for (const { course, value } of targets) await writeAssign(ctx, course, value);
    });
    const results = await reload(ctx, targets.map((t) => t.course));
    return ok(c, { affected: results.length, results });
  });
}

/**
 * 用本次批量提交后的状态，重新统计经法管融通课程的有效学分（不超过 6）。
 * 仅作上限拦截使用；正式的进度计算见 ProgressService.compute()。
 */
async function simulatePostAssignCounted(
  ctx: Ctx,
  overrides: Array<{ courseCode: string; creditCountTo: CreditCountTo }>
): Promise<number> {
  const overrideMap = new Map(overrides.map((o) => [o.courseCode, o.creditCountTo]));
  const allInterdisciplinary = (await CourseService.list(ctx, { requirementType: "经法管融通", limit: 1000 })).data;
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
