import { fail } from "../../lib/errors";
import { CustomCourseRepository } from "./custom-course.repository";
import { ProgramCourseRepository } from "./program-course.repository";
import type { Course } from "./course.types";

/**
 * 共享的 :code 路由分流。所有 service 用它把 course_code 解析成 (source, Course)。
 *
 * 默认排除垃圾篓内课程和 program 永久删除的课程；想看垃圾篓内的，传 includeTrash=true。
 */
export interface ResolveOptions {
  includeTrash?: boolean;
  includePermanentlyDeleted?: boolean;
}

export function isCustomCode(code: string): boolean {
  return code.startsWith("CUSTOM-");
}

export function resolveCourse(code: string, opts: ResolveOptions = {}): Course {
  const course = resolveCourseOrNull(code, opts);
  if (!course) throw fail.notFound("course", code);
  return course;
}

export function resolveCourseOrNull(code: string, opts: ResolveOptions = {}): Course | null {
  if (isCustomCode(code)) {
    return CustomCourseRepository.findByCode(code, { includeTrash: opts.includeTrash });
  }
  const program = ProgramCourseRepository.findByCode(code, {
    includeTrash: opts.includeTrash,
    includePermanentlyDeleted: opts.includePermanentlyDeleted,
  });
  if (program) return program;

  // 历史数据里存在“培养方案外课程但仍使用学校 course_code”的记录，
  // 例如用户手动录入的通选课 B0480240。不能只靠 CUSTOM-* 前缀分流。
  return CustomCourseRepository.findByCode(code, { includeTrash: opts.includeTrash });
}
