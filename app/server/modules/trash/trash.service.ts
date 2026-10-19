import type { Ctx } from "../../context";
import { fail } from "../../lib/errors";
import { expectArray, expectString } from "../../lib/validate";
import type { Course } from "../courses/course.types";
import { CourseService } from "../courses/course.service";
import { resolveCourseOrNull } from "../courses/course-resolver";
import { CustomCourseRepository } from "../courses/custom-course.repository";

type Scope = "program" | "custom" | "all";

function assertWritable(course: Course, message: string) {
  if (course.source === "program") {
    throw fail.precondition(message, { courseCode: course.courseCode });
  }
}

async function softDelete(ctx: Ctx, course: Course, note: string | null) {
  assertWritable(course, "官方培养计划是只读的，请在我的计划中删除对应课程");
  await CustomCourseRepository.update(ctx, course.courseCode, {
    is_deleted: 1,
    deleted_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    deleted_note: note,
  });
}

async function restoreOne(ctx: Ctx, course: Course) {
  assertWritable(course, "官方培养计划是只读的，请恢复我的计划中的课程");
  await CustomCourseRepository.update(ctx, course.courseCode, {
    is_deleted: 0,
    deleted_at: null,
    deleted_note: null,
  });
}

async function purgeOne(ctx: Ctx, course: Course) {
  assertWritable(course, "官方培养计划是只读的，请永久删除我的计划中的课程");
  await CustomCourseRepository.delete(ctx, course.courseCode);
}

async function requireExisting(ctx: Ctx, code: string, includeTrash: boolean): Promise<Course> {
  const course = await resolveCourseOrNull(ctx, code, { includeTrash });
  if (!course) throw fail.notFound("course", code);
  return course;
}

async function listAllInTrash(ctx: Ctx): Promise<Course[]> {
  const custom = await CustomCourseRepository.find(ctx, { inTrash: true, limit: 1000 });
  return custom.sort((a, b) => {
    const ad = a.deletedAt ?? "";
    const bd = b.deletedAt ?? "";
    return bd.localeCompare(ad) || a.courseName.localeCompare(b.courseName, "zh-Hans-CN");
  });
}

type BatchItemError = { index: number; courseCode: string; code: string; message: string };

function parseNote(dto: Record<string, unknown>): string | null {
  return dto.note === undefined || dto.note === null
    ? null
    : expectString(dto.note, "note", { allowNull: true });
}

export const TrashService = {
  async list(ctx: Ctx, query: Record<string, unknown> = {}): Promise<Course[]> {
    if (query.source === "program") return [];
    if (query.source === "custom") return CustomCourseRepository.find(ctx, { inTrash: true, limit: 1000 });
    return listAllInTrash(ctx);
  },

  async softDelete(ctx: Ctx, code: string, body: unknown): Promise<Course> {
    const note = parseNote((body ?? {}) as Record<string, unknown>);
    const course = await requireExisting(ctx, code, false);
    if (course.isDeleted) throw fail.conflict("课程已在垃圾篓中", { courseCode: code });
    await softDelete(ctx, course, note);
    return requireExisting(ctx, code, true);
  },

  async restore(ctx: Ctx, code: string): Promise<Course> {
    const course = await requireExisting(ctx, code, true);
    if (!course.isDeleted) throw fail.conflict("课程不在垃圾篓中", { courseCode: code });
    await restoreOne(ctx, course);
    return requireExisting(ctx, code, false);
  },

  async purge(ctx: Ctx, code: string): Promise<{ courseCode: string; source: string; status: "permanently_deleted" }> {
    const course = await requireExisting(ctx, code, true);
    if (!course.isDeleted) {
      throw fail.precondition("课程不在垃圾篓中，无法永久删除", { courseCode: code });
    }
    await purgeOne(ctx, course);
    return { courseCode: code, source: course.source, status: "permanently_deleted" };
  },

  async restoreAll(ctx: Ctx, scope: Scope = "all"): Promise<{ restored: number }> {
    const items = (await listAllInTrash(ctx)).filter((c) => scope === "all" || c.source === scope);
    await ctx.db.atomic(async () => {
      for (const c of items) await restoreOne(ctx, c);
    });
    return { restored: items.length };
  },

  async empty(ctx: Ctx, scope: Scope = "all"): Promise<{ purged: number }> {
    const items = (await listAllInTrash(ctx)).filter((c) => scope === "all" || c.source === scope);
    await ctx.db.atomic(async () => {
      for (const c of items) await purgeOne(ctx, c);
    });
    return { purged: items.length };
  },

  /** 批量软删除（原子）。所有 codes 必须存在且不在垃圾篓。 */
  async batchSoftDelete(ctx: Ctx, body: unknown): Promise<{ affected: number; results: Course[] }> {
    const dto = (body ?? {}) as Record<string, unknown>;
    const codes = expectArray<string>(dto.codes, "codes", { min: 1, max: 200 });
    CourseService.validateBatchCodesUnique(codes);
    const note = parseNote(dto);

    const errors: BatchItemError[] = [];
    const courses: Course[] = [];
    for (const [i, c] of codes.entries()) {
      const course = await resolveCourseOrNull(ctx, c, { includeTrash: false });
      if (!course) errors.push({ index: i, courseCode: c, code: "NOT_FOUND", message: `课程不存在: ${c}` });
      else if (course.isDeleted) errors.push({ index: i, courseCode: c, code: "CONFLICT", message: `课程已在垃圾篓: ${c}` });
      else courses.push(course);
    }
    if (errors.length) throw fail.precondition("批量软删除失败", { items: errors });

    await ctx.db.atomic(async () => {
      for (const c of courses) await softDelete(ctx, c, note);
    });
    const results: Course[] = [];
    for (const c of courses) results.push(await requireExisting(ctx, c.courseCode, true));
    return { affected: results.length, results };
  },

  async batchRestore(ctx: Ctx, body: unknown): Promise<{ affected: number; results: Course[] }> {
    const dto = (body ?? {}) as Record<string, unknown>;
    const codes = expectArray<string>(dto.codes, "codes", { min: 1, max: 200 });
    CourseService.validateBatchCodesUnique(codes);

    const errors: BatchItemError[] = [];
    const courses: Course[] = [];
    for (const [i, c] of codes.entries()) {
      const course = await resolveCourseOrNull(ctx, c, { includeTrash: true });
      if (!course) errors.push({ index: i, courseCode: c, code: "NOT_FOUND", message: `课程不存在: ${c}` });
      else if (!course.isDeleted) errors.push({ index: i, courseCode: c, code: "CONFLICT", message: `课程不在垃圾篓: ${c}` });
      else courses.push(course);
    }
    if (errors.length) throw fail.precondition("批量恢复失败", { items: errors });

    await ctx.db.atomic(async () => {
      for (const c of courses) await restoreOne(ctx, c);
    });
    const results: Course[] = [];
    for (const c of courses) results.push(await requireExisting(ctx, c.courseCode, false));
    return { affected: results.length, results };
  },

  async batchPurge(
    ctx: Ctx,
    body: unknown
  ): Promise<{
    affected: number;
    results: Array<{ courseCode: string; source: string; status: "permanently_deleted" }>;
  }> {
    const dto = (body ?? {}) as Record<string, unknown>;
    const codes = expectArray<string>(dto.codes, "codes", { min: 1, max: 200 });
    CourseService.validateBatchCodesUnique(codes);

    const errors: BatchItemError[] = [];
    const courses: Course[] = [];
    for (const [i, c] of codes.entries()) {
      const course = await resolveCourseOrNull(ctx, c, { includeTrash: true });
      if (!course) errors.push({ index: i, courseCode: c, code: "NOT_FOUND", message: `课程不存在: ${c}` });
      else if (!course.isDeleted) {
        errors.push({ index: i, courseCode: c, code: "PRECONDITION_FAILED", message: `课程不在垃圾篓: ${c}` });
      } else courses.push(course);
    }
    if (errors.length) throw fail.precondition("批量永久删除失败", { items: errors });

    await ctx.db.atomic(async () => {
      for (const c of courses) await purgeOne(ctx, c);
    });
    return {
      affected: courses.length,
      results: courses.map((c) => ({
        courseCode: c.courseCode,
        source: c.source,
        status: "permanently_deleted" as const,
      })),
    };
  },
};
