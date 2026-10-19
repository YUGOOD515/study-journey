import type { Ctx } from "../../context";
import { fail } from "../../lib/errors";
import { CustomCourseRepository } from "./custom-course.repository";
import { ProgramCourseRepository } from "./program-course.repository";
import type { Course } from "./course.types";

/**
 * 共享的 :code 路由分流。先找当前用户“我的计划”里的课程，找不到再回退到官方培养方案（只读）。
 *
 * 默认排除垃圾篓内课程；想看垃圾篓内的，传 includeTrash=true。
 */
export interface ResolveOptions {
  includeTrash?: boolean;
  includePermanentlyDeleted?: boolean;
}

export function isCustomCode(code: string): boolean {
  return code.startsWith("CUSTOM-");
}

export async function resolveCourse(ctx: Ctx, code: string, opts: ResolveOptions = {}): Promise<Course> {
  const course = await resolveCourseOrNull(ctx, code, opts);
  if (!course) throw fail.notFound("course", code);
  return course;
}

export async function resolveCourseOrNull(
  ctx: Ctx,
  code: string,
  opts: ResolveOptions = {}
): Promise<Course | null> {
  const custom = await CustomCourseRepository.findByCode(ctx, code, { includeTrash: opts.includeTrash });
  if (custom) return custom;
  return ProgramCourseRepository.findByCode(ctx, code);
}
