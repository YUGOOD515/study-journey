import { db } from "../../db";
import { mapCustomRow, type CustomRow } from "./course.mapper";
import type { Course } from "./course.types";

const SELECT_CUSTOM = `
  SELECT
    pc.origin_type,
    pc.official_course_code,
    COALESCE(off.category_code, pc.category_code) AS category_code,
    COALESCE(off.category_name, pc.category_name) AS category_name,
    COALESCE(off.requirement_type, pc.requirement_type) AS requirement_type,
    CASE WHEN off.course_code IS NOT NULL THEN off.course_subcategory ELSE pc.course_subcategory END AS course_subcategory,
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
    pc.planned_term,
    pc.actual_term,
    COALESCE(pc.official_term, off.official_term) AS official_term,
    pc.study_status,
    pc.score,
    CASE
      WHEN off.course_code IS NOT NULL AND off.requirement_type <> '经法管融通' THEN NULL
      WHEN off.course_code IS NOT NULL THEN COALESCE(off.credit_count_to, pc.credit_count_to)
      ELSE pc.credit_count_to
    END AS credit_count_to,
    pc.preference_level,
    pc.note,
    pc.is_deleted,
    pc.deleted_at,
    pc.deleted_note,
    pc.created_at,
    pc.updated_at
  FROM my_plan_courses pc
  LEFT JOIN plan_program_courses off ON pc.origin_type = 'official' AND off.course_code = COALESCE(pc.official_course_code, pc.course_code)
  LEFT JOIN plan_program_courses pre ON pre.course_code = pc.prerequisite_course_code
`;

export interface CustomCourseFilter {
  category?: string;
  requirementType?: string;
  status?: string[];
  term?: number | "null";
  keyword?: string;
  inTrash?: boolean;
  limit?: number;
  offset?: number;
}

function whereForFilter(filter: CustomCourseFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  clauses.push(filter.inTrash ? "pc.is_deleted = 1" : "pc.is_deleted = 0");

  if (filter.category) {
    clauses.push("COALESCE(off.category_code, pc.category_code) = ?");
    params.push(filter.category);
  }
  if (filter.requirementType) {
    clauses.push("COALESCE(off.requirement_type, pc.requirement_type) = ?");
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

export const CustomCourseRepository = {
  find(filter: CustomCourseFilter = {}): Course[] {
    const { sql: whereSql, params } = whereForFilter(filter);
    const limit = filter.limit ?? 1000;
    const offset = filter.offset ?? 0;
    const stmt = db.prepare(
      `${SELECT_CUSTOM}${whereSql} ORDER BY pc.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    );
    const rows = stmt.all(...(params as never[])) as unknown as CustomRow[];
    return rows.map(mapCustomRow);
  },

  findByCode(code: string, opts?: { includeTrash?: boolean }): Course | null {
    const clauses: string[] = ["pc.course_code = ?"];
    if (!opts?.includeTrash) clauses.push("pc.is_deleted = 0");
    const stmt = db.prepare(`${SELECT_CUSTOM} WHERE ${clauses.join(" AND ")}`);
    const row = stmt.get(code) as unknown as CustomRow | undefined;
    return row ? mapCustomRow(row) : null;
  },

  findByCodeOrNameInTerm(input: {
    courseCode: string;
    courseName: string;
    term: number;
    includeTrash?: boolean;
  }): Course | null {
    const clauses = [
      "(pc.course_code = ? OR TRIM(pc.course_name) = TRIM(?))",
      "(pc.planned_term = ? OR pc.actual_term = ?)",
    ];
    if (!input.includeTrash) clauses.push("pc.is_deleted = 0");
    const stmt = db.prepare(
      `${SELECT_CUSTOM} WHERE ${clauses.join(" AND ")} ORDER BY CASE WHEN pc.course_code = ? THEN 0 ELSE 1 END LIMIT 1`
    );
    const row = stmt.get(
      input.courseCode,
      input.courseName,
      input.term,
      input.term,
      input.courseCode
    ) as unknown as CustomRow | undefined;
    return row ? mapCustomRow(row) : null;
  },

  insert(row: {
    origin_type?: "official" | "manual" | "raw";
    official_course_code?: string | null;
    course_code: string;
    category_code: string;
    category_name: string;
    requirement_type: string;
    course_subcategory: string | null;
    course_name: string;
    section_code: string | null;
    credits: number;
    total_hours: number;
    lecture_hours: number;
    experiment_hours: number;
    extra_hours: number;
    term_number: number | null;
    actual_term?: number | null;
    official_term?: string | null;
    prerequisite_course_code: string | null;
    study_status: string;
    score: number | null;
    credit_count_to: string | null;
    note: string | null;
  }): void {
    db.prepare(
      `INSERT OR REPLACE INTO my_plan_courses
        (origin_type, official_course_code,
         category_code, category_name, requirement_type, course_subcategory,
         course_code, section_code, course_name,
         planned_term, actual_term, official_term,
         credits, total_hours, lecture_hours, experiment_hours, extra_hours,
         prerequisite_course_code, study_status, score, credit_count_to, note)
       VALUES
        (?, ?,
         ?, ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?)`
    ).run(
      row.origin_type ?? "manual",
      row.official_course_code ?? null,
      row.category_code,
      row.category_name,
      row.requirement_type,
      row.course_subcategory,
      row.course_code,
      row.section_code,
      row.course_name,
      row.term_number,
      row.actual_term ?? row.term_number,
      row.official_term ?? null,
      row.credits,
      row.total_hours,
      row.lecture_hours,
      row.experiment_hours,
      row.extra_hours,
      row.prerequisite_course_code,
      row.study_status,
      row.score,
      row.credit_count_to,
      row.note
    );
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
      "term_number",
      "planned_term",
      "actual_term",
      "official_term",
      "study_status",
      "score",
      "credit_count_to",
      "note",
      "is_deleted",
      "deleted_at",
      "deleted_note",
    ]);
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowedColumns.has(key)) continue;
      const column = key === "term_number" ? "planned_term" : key;
      sets.push(`${column} = ?`);
      params.push(value);
    }
    if (sets.length === 0) return;
    params.push(code);
    db.prepare(
      `UPDATE my_plan_courses SET ${sets.join(", ")}, updated_at = datetime('now') WHERE course_code = ?`
    ).run(...(params as never[]));
  },

  delete(code: string): void {
    db.prepare(`DELETE FROM my_plan_courses WHERE course_code = ?`).run(code);
  },
};
