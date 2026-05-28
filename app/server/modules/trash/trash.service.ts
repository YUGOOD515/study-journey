import { fail } from "../../lib/errors";
import { expectArray, expectString } from "../../lib/validate";
import { unitOfWork } from "../../lib/unit-of-work";
import type { Course } from "../courses/course.types";
import { CourseService } from "../courses/course.service";
import { isCustomCode, resolveCourseOrNull } from "../courses/course-resolver";
import {
  CustomCourseRepository,
  type CustomCourseFilter,
} from "../courses/custom-course.repository";
import {
  ProgramCourseRepository,
  type ProgramCourseFilter,
} from "../courses/program-course.repository";

function softDelete(course: Course, note: string | null): void {
  const patch = {
    is_deleted: 1,
    deleted_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    deleted_note: note,
  };
  if (course.source === "program") ProgramCourseRepository.update(course.courseCode, patch);
  else CustomCourseRepository.update(course.courseCode, patch);
}

function restoreOne(course: Course): void {
  if (course.source === "program") {
    ProgramCourseRepository.update(course.courseCode, {
      is_deleted: 0,
      is_permanently_deleted: 0,
      deleted_at: null,
      deleted_note: null,
    });
  } else {
    CustomCourseRepository.update(course.courseCode, {
      is_deleted: 0,
      deleted_at: null,
      deleted_note: null,
    });
  }
}

function purgeOne(course: Course): void {
  if (course.source === "program") {
    ProgramCourseRepository.update(course.courseCode, { is_permanently_deleted: 1 });
  } else {
    CustomCourseRepository.delete(course.courseCode);
  }
}

function requireExisting(code: string, includeTrash: boolean): Course {
  const course = resolveCourseOrNull(code, { includeTrash });
  if (!course) throw fail.notFound("course", code);
  return course;
}

function listAllInTrash(): Course[] {
  const trashFilter = { inTrash: true, limit: 1000 };
  const program = ProgramCourseRepository.find(trashFilter as ProgramCourseFilter);
  const custom = CustomCourseRepository.find(trashFilter as CustomCourseFilter);
  return [...program, ...custom].sort((a, b) => {
    const ad = a.deletedAt ?? "";
    const bd = b.deletedAt ?? "";
    return bd.localeCompare(ad) || a.courseName.localeCompare(b.courseName, "zh-Hans-CN");
  });
}

export const TrashService = {
  list(query: Record<string, unknown> = {}): Course[] {
    const source = query.source;
    if (source === "program") {
      return ProgramCourseRepository.find({ inTrash: true, limit: 1000 });
    }
    if (source === "custom") {
      return CustomCourseRepository.find({ inTrash: true, limit: 1000 });
    }
    return listAllInTrash();
  },

  softDelete(code: string, body: unknown): Course {
    const dto = (body ?? {}) as Record<string, unknown>;
    const note =
      dto.note === undefined || dto.note === null
        ? null
        : expectString(dto.note, "note", { allowNull: true });
    const course = requireExisting(code, /* includeTrash */ false);
    if (course.isDeleted) {
      throw fail.conflict("课程已在垃圾篓中", { courseCode: code });
    }
    softDelete(course, note);
    return requireExisting(code, true);
  },

  restore(code: string): Course {
    const course = requireExisting(code, /* includeTrash */ true);
    if (!course.isDeleted) {
      throw fail.conflict("课程不在垃圾篓中", { courseCode: code });
    }
    restoreOne(course);
    return requireExisting(code, false);
  },

  purge(code: string): { courseCode: string; source: string; status: "permanently_deleted" } {
    const course = requireExisting(code, /* includeTrash */ true);
    if (!course.isDeleted) {
      throw fail.precondition("课程不在垃圾篓中，无法永久删除", { courseCode: code });
    }
    purgeOne(course);
    return { courseCode: code, source: course.source, status: "permanently_deleted" };
  },

  restoreAll(scope: "program" | "custom" | "all" = "all"): { restored: number } {
    return unitOfWork(() => {
      const items = listAllInTrash().filter((c) => scope === "all" || c.source === scope);
      for (const c of items) restoreOne(c);
      return { restored: items.length };
    });
  },

  empty(scope: "program" | "custom" | "all" = "all"): { purged: number } {
    return unitOfWork(() => {
      const items = listAllInTrash().filter((c) => scope === "all" || c.source === scope);
      for (const c of items) purgeOne(c);
      return { purged: items.length };
    });
  },

  /** 批量软删除（事务）。所有 codes 必须存在且不在垃圾篓。 */
  batchSoftDelete(body: unknown): { affected: number; results: Course[] } {
    const dto = (body ?? {}) as Record<string, unknown>;
    const codes = expectArray<string>(dto.codes, "codes", { min: 1, max: 200 });
    CourseService.validateBatchCodesUnique(codes);
    const note =
      dto.note === undefined || dto.note === null
        ? null
        : expectString(dto.note, "note", { allowNull: true });
    return unitOfWork(() => {
      const errors: Array<{ index: number; courseCode: string; code: string; message: string }> = [];
      const courses: Course[] = [];
      codes.forEach((c, i) => {
        const course = resolveCourseOrNull(c, { includeTrash: false });
        if (!course) {
          errors.push({ index: i, courseCode: c, code: "NOT_FOUND", message: `课程不存在: ${c}` });
        } else if (course.isDeleted) {
          errors.push({ index: i, courseCode: c, code: "CONFLICT", message: `课程已在垃圾篓: ${c}` });
        } else {
          courses.push(course);
        }
      });
      if (errors.length) throw fail.precondition("批量软删除失败", { items: errors });
      for (const c of courses) softDelete(c, note);
      const results = courses.map((c) => requireExisting(c.courseCode, true));
      return { affected: results.length, results };
    });
  },

  batchRestore(body: unknown): { affected: number; results: Course[] } {
    const dto = (body ?? {}) as Record<string, unknown>;
    const codes = expectArray<string>(dto.codes, "codes", { min: 1, max: 200 });
    CourseService.validateBatchCodesUnique(codes);
    return unitOfWork(() => {
      const errors: Array<{ index: number; courseCode: string; code: string; message: string }> = [];
      const courses: Course[] = [];
      codes.forEach((c, i) => {
        const course = resolveCourseOrNull(c, { includeTrash: true });
        if (!course) {
          errors.push({ index: i, courseCode: c, code: "NOT_FOUND", message: `课程不存在: ${c}` });
        } else if (!course.isDeleted) {
          errors.push({ index: i, courseCode: c, code: "CONFLICT", message: `课程不在垃圾篓: ${c}` });
        } else {
          courses.push(course);
        }
      });
      if (errors.length) throw fail.precondition("批量恢复失败", { items: errors });
      for (const c of courses) restoreOne(c);
      const results = courses.map((c) => requireExisting(c.courseCode, false));
      return { affected: results.length, results };
    });
  },

  batchPurge(body: unknown): {
    affected: number;
    results: Array<{ courseCode: string; source: string; status: "permanently_deleted" }>;
  } {
    const dto = (body ?? {}) as Record<string, unknown>;
    const codes = expectArray<string>(dto.codes, "codes", { min: 1, max: 200 });
    CourseService.validateBatchCodesUnique(codes);
    return unitOfWork(() => {
      const errors: Array<{ index: number; courseCode: string; code: string; message: string }> = [];
      const courses: Course[] = [];
      codes.forEach((c, i) => {
        const course = resolveCourseOrNull(c, { includeTrash: true });
        if (!course) {
          errors.push({ index: i, courseCode: c, code: "NOT_FOUND", message: `课程不存在: ${c}` });
        } else if (!course.isDeleted) {
          errors.push({
            index: i,
            courseCode: c,
            code: "PRECONDITION_FAILED",
            message: `课程不在垃圾篓: ${c}`,
          });
        } else {
          courses.push(course);
        }
      });
      if (errors.length) throw fail.precondition("批量永久删除失败", { items: errors });
      for (const c of courses) purgeOne(c);
      return {
        affected: courses.length,
        results: courses.map((c) => ({
          courseCode: c.courseCode,
          source: c.source,
          status: "permanently_deleted" as const,
        })),
      };
    });
  },
};

// 让 isCustomCode 这个 helper 也能 tree-shake；目前仅在 service 内部使用
void isCustomCode;
