import { db } from "../../db";
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
  } else {
    clauses.push("pc.is_deleted = 0");
  }
  if (!filter.includePermanentlyDeleted) {
    clauses.push("pc.is_permanently_deleted = 0");
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
  find(filter: ProgramCourseFilter = {}): Course[] {
    const { sql: whereSql, params } = whereForFilter(filter);
    const limit = filter.limit ?? 1000;
    const offset = filter.offset ?? 0;
    const stmt = db.prepare(
      `${SELECT_PROGRAM}${whereSql} ORDER BY pc.course_code LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    );
    const rows = stmt.all(...(params as never[])) as unknown as ProgramRow[];
    return rows.map(mapProgramRow);
  },

  countActive(filter: ProgramCourseFilter = {}): number {
    const { sql: whereSql, params } = whereForFilter(filter);
    const stmt = db.prepare(`SELECT COUNT(*) AS n FROM plan_program_courses pc${whereSql}`);
    const row = stmt.get(...(params as never[])) as unknown as { n: number };
    return row?.n ?? 0;
  },

  findByCode(code: string, opts?: { includeTrash?: boolean; includePermanentlyDeleted?: boolean }): Course | null {
    const clauses: string[] = ["pc.course_code = ?"];
    if (!opts?.includeTrash) clauses.push("pc.is_deleted = 0");
    if (!opts?.includePermanentlyDeleted) clauses.push("pc.is_permanently_deleted = 0");
    const stmt = db.prepare(`${SELECT_PROGRAM} WHERE ${clauses.join(" AND ")}`);
    const row = stmt.get(code) as unknown as ProgramRow | undefined;
    return row ? mapProgramRow(row) : null;
  },

  /** 用于先修课校验：检查目标 course_code 是否在 program 表里且未永久删除。 */
  exists(code: string): boolean {
    const stmt = db.prepare(
      `SELECT 1 FROM plan_program_courses WHERE course_code = ? AND is_permanently_deleted = 0`
    );
    return !!stmt.get(code);
  },

  update(code: string, patch: Record<string, unknown>): void {
    const allowedColumns = new Set([
      "course_name",
      "section_code",
      "category_code",
      "category_name",
      "requirement_type",
      "course_subcategory",
      "credits",
      "total_hours",
      "lecture_hours",
      "experiment_hours",
      "extra_hours",
      "prerequisite_course_code",
      "official_term",
      "planned_term",
      "actual_term",
      "study_status",
      "score",
      "credit_count_to",
      "preference_level",
      "note",
      "is_deleted",
      "is_permanently_deleted",
      "deleted_at",
      "deleted_note",
    ]);
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowedColumns.has(key)) continue;
      sets.push(`${key} = ?`);
      params.push(value);
    }
    if (sets.length === 0) return;
    params.push(code);
    db.prepare(
      `UPDATE plan_program_courses SET ${sets.join(", ")}, updated_at = datetime('now') WHERE course_code = ?`
    ).run(...(params as never[]));
  },
};
