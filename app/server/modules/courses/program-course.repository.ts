import type { Ctx } from "../../context";
import { mapProgramRow, type ProgramRow } from "./course.mapper";
import type { Course } from "./course.types";

const SELECT_PROGRAM = `
  SELECT
    pc.category_code,
    pc.category_name,
    pc.requirement_type,
    pc.course_subcategory,
    pc.course_code,
    pc.section_code,
    pc.course_name,
    pc.credits,
    pc.total_hours,
    pc.lecture_hours,
    pc.experiment_hours,
    pc.extra_hours,
    pc.prerequisite_course_code,
    pre.course_name AS prerequisite_course_name,
    pc.official_term,
    pc.planned_term,
    pc.actual_term,
    pc.study_status,
    pc.score,
    pc.credit_count_to,
    pc.preference_level,
    pc.note,
    pc.is_deleted,
    pc.is_permanently_deleted,
    pc.deleted_at,
    pc.deleted_note,
    pc.created_at,
    pc.updated_at
  FROM plan_program_courses pc
  LEFT JOIN plan_program_courses pre ON pre.course_code = pc.prerequisite_course_code
`;

/**
 * 官方培养方案课程（所有用户共享、只读）。用户对官方课程的计划/成绩写在 my_plan_courses。
 */
export interface ProgramCourseFilter {
  category?: string;
  requirementType?: string;
  status?: string[];
  term?: number | "null";
  keyword?: string;
  inTrash?: boolean;
  /** 包含已永久删除（is_permanently_deleted=1）。默认 false。 */
  includePermanentlyDeleted?: boolean;
  limit?: number;
  offset?: number;
}

function whereForFilter(filter: ProgramCourseFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.inTrash) {
    clauses.push("pc.is_deleted = 1");
  }
  if (filter.category) {
    clauses.push("pc.category_code = ?");
    params.push(filter.category);
  }
  if (filter.requirementType) {
    clauses.push("pc.requirement_type = ?");
    params.push(filter.requirementType);
  }
  if (filter.status && filter.status.length > 0) {
    const ph = filter.status.map(() => "?").join(",");
    clauses.push(`pc.study_status IN (${ph})`);
    params.push(...filter.status);
  }
  if (filter.term !== undefined) {
    if (filter.term === "null") {
      clauses.push("pc.planned_term IS NULL");
    } else {
      clauses.push("pc.planned_term = ?");
      params.push(filter.term);
    }
  }
  if (filter.keyword) {
    clauses.push("(pc.course_code LIKE ? OR pc.course_name LIKE ?)");
    const pat = `%${filter.keyword}%`;
    params.push(pat, pat);
  }

  return { sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", params };
}

export const ProgramCourseRepository = {
  async find(ctx: Ctx, filter: ProgramCourseFilter = {}): Promise<Course[]> {
    const { sql: whereSql, params } = whereForFilter(filter);
    const limit = filter.limit ?? 1000;
    const offset = filter.offset ?? 0;
    const rows = await ctx.db.all<ProgramRow>(
      `${SELECT_PROGRAM}${whereSql} ORDER BY pc.course_code LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params as never[]
    );
    return rows.map(mapProgramRow);
  },

  async findByCode(ctx: Ctx, code: string): Promise<Course | null> {
    const row = await ctx.db.first<ProgramRow>(`${SELECT_PROGRAM} WHERE pc.course_code = ?`, [code]);
    return row ? mapProgramRow(row) : null;
  },

  /** 用于先修课校验：检查目标 course_code 是否在官方课程表里。 */
  async exists(ctx: Ctx, code: string): Promise<boolean> {
    return Boolean(await ctx.db.first(`SELECT 1 AS hit FROM plan_program_courses WHERE course_code = ?`, [code]));
  },
};
