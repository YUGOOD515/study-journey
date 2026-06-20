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

export interface RawActualCourseMeetingRow {
  id: number;
  batch_id: number;
  term: number;
  course_code: string;
  section_code: string;
  meeting_no: number;
  start_week: number;
  end_week: number;
  weekday: number;
  start_period: number;
  end_period: number;
  location_text: string | null;
  course_name: string;
  teacher: string | null;
  class_group: string | null;
  course_nature: string | null;
  course_attribute: string | null;
  class_time_raw: string | null;
  location_raw: string | null;
  academic_year: string;
  semester: string;
  phase: string;
}

export type RawCourseSearchSource = "section" | "added";

export interface RawCourseSearchRow {
  source_type: RawCourseSearchSource;
  batch_id: number;
  source_row: number;
  academic_year: string;
  semester: string;
  phase: string;
  course_code: string;
  section_code: string | null;
  course_name: string;
  credits: number | null;
  hours: number | null;
  teacher: string | null;
  class_time: string | null;
  teaching_weeks: string | null;
  campus: string | null;
  classroom: string | null;
  department: string | null;
  course_attribute: string | null;
  enrollment_restriction: string | null;
  combined_class_name: string | null;
  group_name: string | null;
  learning_platform: string | null;
  module_2022: string | null;
  module_2024: string | null;
  remark1: string | null;
  remark2: string | null;
  exists_in_program: number;
  exists_in_custom: number;
}

export interface RawActualMeetingInsertRow {
  batch_id: number;
  term: number;
  course_code: string;
  section_code: string;
  meeting_no: number;
  start_week: number;
  end_week: number;
  weekday: number;
  start_period: number;
  end_period: number;
  location_text: string | null;
  course_name: string;
  teacher: string | null;
  class_group: string | null;
  course_nature: string | null;
  course_attribute: string | null;
  class_time_raw: string | null;
  location_raw: string | null;
  source_sheet: string | null;
  source_row: number;
}

function whereClause(parts: string[]): string {
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

export const RawRepository = {
  baseEnrollmentYear(): number {
    const row = db.prepare(
      `SELECT MIN(CAST(substr(academic_year, 1, 4) AS INTEGER)) AS year
         FROM raw_import_batches`
    ).get() as unknown as { year: number | null } | undefined;
    return row?.year ?? 2024;
  },

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

  listActualCourseMeetings(filter: {
    term?: number;
    week?: number;
    weekday?: number;
    courseCode?: string;
    onlyMyPlan?: boolean;
    limit?: number;
    offset?: number;
  }): RawActualCourseMeetingRow[] {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (filter.term !== undefined) { parts.push("m.term = ?"); params.push(filter.term); }
    if (filter.week !== undefined) {
      parts.push("m.start_week <= ? AND m.end_week >= ?");
      params.push(filter.week, filter.week);
    }
    if (filter.weekday !== undefined) { parts.push("m.weekday = ?"); params.push(filter.weekday); }
    if (filter.courseCode) { parts.push("m.course_code = ?"); params.push(filter.courseCode); }
    if (filter.onlyMyPlan !== false) {
      parts.push(`EXISTS (
        SELECT 1
          FROM my_plan_courses p
         WHERE p.is_deleted = 0
           AND p.course_code = m.course_code
           AND (p.section_code IS NULL OR p.section_code = m.section_code)
           AND (p.actual_term = m.term OR p.planned_term = m.term)
      )`);
    }
    const stmt = db.prepare(
      `SELECT m.*, b.academic_year, b.semester, b.phase
         FROM raw_actual_course_meetings m
         JOIN raw_import_batches b ON b.id = m.batch_id
       ${whereClause(parts)}
       ORDER BY m.term, m.weekday, m.start_period, m.end_period, m.course_code, m.section_code, m.meeting_no
       LIMIT ${Number(filter.limit ?? 500)} OFFSET ${Number(filter.offset ?? 0)}`
    );
    return stmt.all(...(params as never[])) as unknown as RawActualCourseMeetingRow[];
  },

  searchCourses(filter: {
    keyword?: string;
    term?: number;
    source?: "all" | RawCourseSearchSource;
    limit?: number;
    offset?: number;
  }): RawCourseSearchRow[] {
    const baseYear = this.baseEnrollmentYear();
    const limit = Math.max(1, Math.min(Number(filter.limit ?? 40), 200));
    const offset = Math.max(0, Number(filter.offset ?? 0));
    const source = filter.source ?? "all";
    const rawTermExpr = `((CAST(substr(b.academic_year, 1, 4) AS INTEGER) - ${baseYear}) * 2 + CASE b.semester WHEN 'fall' THEN 1 ELSE 2 END)`;
    const sectionParams: unknown[] = [];
    const addedParams: unknown[] = [];
    const sectionWhere: string[] = [];
    const addedWhere: string[] = [];

    if (filter.term !== undefined) {
      const termExpr = `((CAST(substr(b.academic_year, 1, 4) AS INTEGER) - ?) * 2 + CASE b.semester WHEN 'fall' THEN 1 ELSE 2 END) = ?`;
      sectionWhere.push(termExpr);
      addedWhere.push(termExpr);
      sectionParams.push(baseYear, filter.term);
      addedParams.push(baseYear, filter.term);
    }

    if (filter.keyword) {
      const k = `%${filter.keyword}%`;
      sectionWhere.push(`(
        s.course_name LIKE ? OR s.course_code LIKE ? OR s.section_code LIKE ? OR
        IFNULL(s.teacher, '') LIKE ? OR IFNULL(s.department, '') LIKE ? OR
        IFNULL(s.course_attribute, '') LIKE ? OR IFNULL(s.enrollment_restriction, '') LIKE ? OR
        IFNULL(s.class_time, '') LIKE ? OR IFNULL(s.teaching_weeks, '') LIKE ? OR
        IFNULL(s.campus, '') LIKE ? OR IFNULL(s.classroom, '') LIKE ? OR
        IFNULL(s.group_name, '') LIKE ? OR IFNULL(s.combined_class_name, '') LIKE ?
      )`);
      sectionParams.push(k, k, k, k, k, k, k, k, k, k, k, k, k);
      addedWhere.push(`(
        a.course_name LIKE ? OR a.course_code LIKE ? OR IFNULL(a.department, '') LIKE ? OR
        IFNULL(a.learning_platform, '') LIKE ? OR IFNULL(a.class_time, '') LIKE ? OR
        IFNULL(a.enrollment_restriction, '') LIKE ? OR IFNULL(a.module_2022, '') LIKE ? OR
        IFNULL(a.module_2024, '') LIKE ? OR IFNULL(a.remark1, '') LIKE ? OR IFNULL(a.remark2, '') LIKE ?
      )`);
      addedParams.push(k, k, k, k, k, k, k, k, k, k);
    }

    const sectionSql = `
      SELECT
        'section' AS source_type,
        s.batch_id,
        s.source_row,
        b.academic_year,
        b.semester,
        b.phase,
        s.course_code,
        s.section_code,
        s.course_name,
        s.credits,
        s.hours,
        s.teacher,
        s.class_time,
        s.teaching_weeks,
        s.campus,
        s.classroom,
        s.department,
        s.course_attribute,
        s.enrollment_restriction,
        s.combined_class_name,
        s.group_name,
        NULL AS learning_platform,
        NULL AS module_2022,
        NULL AS module_2024,
        NULL AS remark1,
        NULL AS remark2,
        EXISTS(SELECT 1 FROM plan_program_courses p WHERE p.course_code = s.course_code OR TRIM(p.course_name) = TRIM(s.course_name)) AS exists_in_program,
        EXISTS(SELECT 1 FROM my_plan_courses c WHERE c.is_deleted = 0 AND (c.course_code = s.course_code OR TRIM(c.course_name) = TRIM(s.course_name)) AND (c.planned_term = ${rawTermExpr} OR c.actual_term = ${rawTermExpr})) AS exists_in_custom
      FROM raw_term_course_sections s
      JOIN raw_import_batches b ON b.id = s.batch_id
      ${whereClause(sectionWhere)}
    `;

    const addedSql = `
      SELECT
        'added' AS source_type,
        a.batch_id,
        a.source_row,
        b.academic_year,
        b.semester,
        b.phase,
        a.course_code,
        NULL AS section_code,
        a.course_name,
        a.credits,
        NULL AS hours,
        NULL AS teacher,
        a.class_time,
        NULL AS teaching_weeks,
        NULL AS campus,
        NULL AS classroom,
        a.department,
        NULL AS course_attribute,
        a.enrollment_restriction,
        NULL AS combined_class_name,
        NULL AS group_name,
        a.learning_platform,
        a.module_2022,
        a.module_2024,
        a.remark1,
        a.remark2,
        EXISTS(SELECT 1 FROM plan_program_courses p WHERE p.course_code = a.course_code OR TRIM(p.course_name) = TRIM(a.course_name)) AS exists_in_program,
        EXISTS(SELECT 1 FROM my_plan_courses c WHERE c.is_deleted = 0 AND (c.course_code = a.course_code OR TRIM(c.course_name) = TRIM(a.course_name)) AND (c.planned_term = ${rawTermExpr} OR c.actual_term = ${rawTermExpr})) AS exists_in_custom
      FROM raw_term_added_courses a
      JOIN raw_import_batches b ON b.id = a.batch_id
      ${whereClause(addedWhere)}
    `;

    let sql: string;
    let params: unknown[];
    if (source === "section") {
      sql = sectionSql;
      params = sectionParams;
    } else if (source === "added") {
      sql = addedSql;
      params = addedParams;
    } else {
      sql = `${sectionSql} UNION ALL ${addedSql}`;
      params = [...sectionParams, ...addedParams];
    }

    const stmt = db.prepare(
      `WITH searched AS (${sql})
       SELECT * FROM searched
       ORDER BY
         CASE source_type WHEN 'section' THEN 0 ELSE 1 END,
         CASE phase WHEN 'final' THEN 0 WHEN 'beginning_add' THEN 1 ELSE 2 END,
         course_code,
         CAST(IFNULL(section_code, '1') AS INTEGER),
         batch_id DESC,
         source_row
       LIMIT ${limit} OFFSET ${offset}`
    );
    return stmt.all(...(params as never[])) as unknown as RawCourseSearchRow[];
  },

  findSearchRowForAdd(input: {
    sourceType: RawCourseSearchSource;
    batchId: number;
    sourceRow: number;
    courseCode: string;
    sectionCode?: string | null;
  }): RawCourseSearchRow | null {
    const source = input.sourceType;
    const stmt = db.prepare(
      source === "section"
        ? `WITH row AS (
             SELECT s.*, b.academic_year, b.semester, b.phase
               FROM raw_term_course_sections s
               JOIN raw_import_batches b ON b.id = s.batch_id
              WHERE s.batch_id = ? AND s.source_row = ? AND s.course_code = ? AND s.section_code = ?
           )
           SELECT
             'section' AS source_type,
             batch_id, source_row, academic_year, semester, phase, course_code, section_code,
             course_name, credits, hours, teacher, class_time, teaching_weeks, campus, classroom,
             department, course_attribute, enrollment_restriction, combined_class_name, group_name,
             NULL AS learning_platform, NULL AS module_2022, NULL AS module_2024, NULL AS remark1, NULL AS remark2,
             EXISTS(SELECT 1 FROM plan_program_courses p WHERE p.course_code = r.course_code) AS exists_in_program,
             EXISTS(SELECT 1 FROM my_plan_courses c WHERE c.course_code = r.course_code) AS exists_in_custom
            FROM row r`
        : `WITH row AS (
             SELECT a.*, b.academic_year, b.semester, b.phase
               FROM raw_term_added_courses a
               JOIN raw_import_batches b ON b.id = a.batch_id
              WHERE a.batch_id = ? AND a.source_row = ? AND a.course_code = ?
           )
           SELECT
             'added' AS source_type,
             batch_id, source_row, academic_year, semester, phase, course_code, NULL AS section_code,
             course_name, credits, NULL AS hours, NULL AS teacher, class_time, NULL AS teaching_weeks,
             NULL AS campus, NULL AS classroom, department, NULL AS course_attribute,
             enrollment_restriction, NULL AS combined_class_name, NULL AS group_name,
             learning_platform, module_2022, module_2024, remark1, remark2,
             EXISTS(SELECT 1 FROM plan_program_courses p WHERE p.course_code = r.course_code) AS exists_in_program,
             EXISTS(SELECT 1 FROM my_plan_courses c WHERE c.course_code = r.course_code) AS exists_in_custom
            FROM row r`
    );
    const params = source === "section"
      ? [input.batchId, input.sourceRow, input.courseCode, input.sectionCode]
      : [input.batchId, input.sourceRow, input.courseCode];
    const row = stmt.get(...(params as never[])) as unknown as RawCourseSearchRow | undefined;
    return row ?? null;
  },

  insertActualCourseMeetings(rows: RawActualMeetingInsertRow[]): number {
    if (rows.length === 0) return 0;
    const stmt = db.prepare(
      `INSERT INTO raw_actual_course_meetings(
          batch_id, term, course_code, section_code, meeting_no,
          start_week, end_week, weekday, start_period, end_period, location_text,
          course_name, teacher, class_group, course_nature, course_attribute,
          class_time_raw, location_raw, source_sheet, source_row
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let inserted = 0;
    for (const row of rows) {
      const result = stmt.run(
        row.batch_id,
        row.term,
        row.course_code,
        row.section_code,
        row.meeting_no,
        row.start_week,
        row.end_week,
        row.weekday,
        row.start_period,
        row.end_period,
        row.location_text,
        row.course_name,
        row.teacher,
        row.class_group,
        row.course_nature,
        row.course_attribute,
        row.class_time_raw,
        row.location_raw,
        row.source_sheet,
        row.source_row
      ) as unknown as { changes?: number };
      inserted += Number(result.changes ?? 0);
    }
    return inserted;
  },

  actualMeetingsExist(filter: { term: number; courseCode: string; sectionCode: string }): boolean {
    const row = db.prepare(
      `SELECT 1
         FROM raw_actual_course_meetings
        WHERE term = ? AND course_code = ? AND section_code = ?
        LIMIT 1`
    ).get(filter.term, filter.courseCode, filter.sectionCode);
    return Boolean(row);
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
