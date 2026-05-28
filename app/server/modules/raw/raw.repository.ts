import { db } from "../../db";

export interface RawBatchRow {
  id: number;
  academic_year: string;
  semester: string;
  phase: string;
  source_file: string;
  source_format: string | null;
  imported_at: string;
  note: string | null;
}

export interface RawSectionRow {
  batch_id: number;
  course_code: string;
  section_code: string;
  course_name: string;
  hours: number | null;
  credits: number | null;
  teacher: string | null;
  class_time: string | null;
  teaching_weeks: string | null;
  enrollment_restriction: string | null;
  combined_class_name: string | null;
  campus: string | null;
  department: string | null;
  course_attribute: string | null;
  gender_requirement: string | null;
  enrollment_open: string | null;
  classroom: string | null;
  group_name: string | null;
  academic_year: string;
  semester: string;
  phase: string;
}

export interface RawAddedRow {
  batch_id: number;
  course_code: string;
  course_name: string;
  department: string | null;
  learning_platform: string | null;
  credits: number | null;
  class_time: string | null;
  enrollment_restriction: string | null;
  module_2022: string | null;
  module_2024: string | null;
  remark1: string | null;
  remark2: string | null;
  academic_year: string;
  semester: string;
  phase: string;
}

export interface RawCatalogPreviewRow {
  id: number;
  academic_year: string;
  semester: string;
  ordinal: number | null;
  department: string | null;
  course_code: string;
  course_name: string;
  module_2022: string | null;
  module_2024: string | null;
  course_category: string | null;
  course_attribute: string | null;
  hours: number | null;
  credits: number | null;
}

function whereClause(parts: string[]): string {
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

export const RawRepository = {
  listBatches(filter: { academicYear?: string; semester?: string; phase?: string; limit?: number; offset?: number }): RawBatchRow[] {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (filter.academicYear) { parts.push("academic_year = ?"); params.push(filter.academicYear); }
    if (filter.semester)     { parts.push("semester = ?");      params.push(filter.semester); }
    if (filter.phase)        { parts.push("phase = ?");         params.push(filter.phase); }
    const stmt = db.prepare(
      `SELECT * FROM raw_import_batches${whereClause(parts)} ORDER BY id DESC LIMIT ${Number(filter.limit ?? 200)} OFFSET ${Number(filter.offset ?? 0)}`
    );
    return stmt.all(...(params as never[])) as unknown as RawBatchRow[];
  },

  listSections(filter: { batchId?: number; courseCode?: string; keyword?: string; teacher?: string; campus?: string; limit?: number; offset?: number }): RawSectionRow[] {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (filter.batchId !== undefined) { parts.push("s.batch_id = ?"); params.push(filter.batchId); }
    if (filter.courseCode) { parts.push("s.course_code = ?"); params.push(filter.courseCode); }
    if (filter.keyword) {
      parts.push("(s.course_name LIKE ? OR s.course_code LIKE ?)");
      const k = `%${filter.keyword}%`;
      params.push(k, k);
    }
    if (filter.teacher) { parts.push("s.teacher LIKE ?"); params.push(`%${filter.teacher}%`); }
    if (filter.campus)  { parts.push("s.campus = ?");      params.push(filter.campus); }
    const stmt = db.prepare(
      `SELECT s.*, b.academic_year, b.semester, b.phase
         FROM raw_term_course_sections s
         JOIN raw_import_batches b ON b.id = s.batch_id
       ${whereClause(parts)}
       ORDER BY s.batch_id DESC, s.course_code, s.section_code
       LIMIT ${Number(filter.limit ?? 200)} OFFSET ${Number(filter.offset ?? 0)}`
    );
    return stmt.all(...(params as never[])) as unknown as RawSectionRow[];
  },

  listAddedCourses(filter: { batchId?: number; courseCode?: string; keyword?: string; limit?: number; offset?: number }): RawAddedRow[] {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (filter.batchId !== undefined) { parts.push("a.batch_id = ?"); params.push(filter.batchId); }
    if (filter.courseCode) { parts.push("a.course_code = ?"); params.push(filter.courseCode); }
    if (filter.keyword) {
      parts.push("(a.course_name LIKE ? OR a.course_code LIKE ?)");
      const k = `%${filter.keyword}%`;
      params.push(k, k);
    }
    const stmt = db.prepare(
      `SELECT a.*, b.academic_year, b.semester, b.phase
         FROM raw_term_added_courses a
         JOIN raw_import_batches b ON b.id = a.batch_id
       ${whereClause(parts)}
       ORDER BY a.batch_id DESC, a.course_code
       LIMIT ${Number(filter.limit ?? 200)} OFFSET ${Number(filter.offset ?? 0)}`
    );
    return stmt.all(...(params as never[])) as unknown as RawAddedRow[];
  },

  listCatalogPreviews(filter: { academicYear?: string; semester?: string; courseCode?: string; module?: string; limit?: number; offset?: number }): RawCatalogPreviewRow[] {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (filter.academicYear) { parts.push("academic_year = ?"); params.push(filter.academicYear); }
    if (filter.semester)     { parts.push("semester = ?");      params.push(filter.semester); }
    if (filter.courseCode)   { parts.push("course_code = ?");   params.push(filter.courseCode); }
    if (filter.module)       { parts.push("(module_2024 = ? OR module_2022 = ?)"); params.push(filter.module, filter.module); }
    const stmt = db.prepare(
      `SELECT * FROM raw_course_catalog_previews
       ${whereClause(parts)}
       ORDER BY academic_year DESC, semester, course_code
       LIMIT ${Number(filter.limit ?? 200)} OFFSET ${Number(filter.offset ?? 0)}`
    );
    return stmt.all(...(params as never[])) as unknown as RawCatalogPreviewRow[];
  },

  findOpeningsByCode(code: string): {
    sections: RawSectionRow[];
    addedCourses: RawAddedRow[];
    catalogPreviews: RawCatalogPreviewRow[];
  } {
    const sections = this.listSections({ courseCode: code, limit: 1000 });
    const addedCourses = this.listAddedCourses({ courseCode: code, limit: 1000 });
    const catalogPreviews = this.listCatalogPreviews({ courseCode: code, limit: 1000 });
    return { sections, addedCourses, catalogPreviews };
  },
};
