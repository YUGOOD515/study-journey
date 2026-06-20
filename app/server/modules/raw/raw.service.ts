import { fail } from "../../lib/errors";
import { expectEnum, expectNumber, expectString } from "../../lib/validate";
import { RawRepository } from "./raw.repository";

function parseLimitOffset(q: Record<string, unknown>): { limit?: number; offset?: number } {
  const out: { limit?: number; offset?: number } = {};
  if (q.limit !== undefined) {
    out.limit = expectNumber(Number(q.limit), "limit", { min: 1, max: 1000, integer: true })!;
  }
  if (q.offset !== undefined) {
    out.offset = expectNumber(Number(q.offset), "offset", { min: 0, integer: true })!;
  }
  return out;
}

export const RawService = {
  listBatches(q: Record<string, unknown>) {
    return RawRepository.listBatches({
      academicYear: q.academicYear ? expectString(q.academicYear, "academicYear")! : undefined,
      semester: q.semester ? expectString(q.semester, "semester")! : undefined,
      phase: q.phase ? expectString(q.phase, "phase")! : undefined,
      ...parseLimitOffset(q),
    });
  },

  listSections(q: Record<string, unknown>) {
    const filter = {
      batchId: q.batchId !== undefined ? expectNumber(Number(q.batchId), "batchId", { min: 1, integer: true })! : undefined,
      courseCode: q.courseCode ? expectString(q.courseCode, "courseCode")! : undefined,
      keyword: q.keyword ? expectString(q.keyword, "keyword")! : undefined,
      teacher: q.teacher ? expectString(q.teacher, "teacher")! : undefined,
      campus: q.campus ? expectString(q.campus, "campus")! : undefined,
      ...parseLimitOffset(q),
    };
    if (!filter.batchId && !filter.courseCode && !filter.keyword && !filter.teacher && !filter.campus) {
      throw fail.validation(
        "GET /api/raw/sections 必须至少传入一个过滤参数",
        { hint: "可用：batchId / courseCode / keyword / teacher / campus" }
      );
    }
    return RawRepository.listSections(filter);
  },

  listAddedCourses(q: Record<string, unknown>) {
    return RawRepository.listAddedCourses({
      batchId: q.batchId !== undefined ? expectNumber(Number(q.batchId), "batchId", { min: 1, integer: true })! : undefined,
      courseCode: q.courseCode ? expectString(q.courseCode, "courseCode")! : undefined,
      keyword: q.keyword ? expectString(q.keyword, "keyword")! : undefined,
      ...parseLimitOffset(q),
    });
  },

  listCatalogPreviews(q: Record<string, unknown>) {
    const filter = {
      academicYear: q.academicYear ? expectString(q.academicYear, "academicYear")! : undefined,
      semester: q.semester ? expectString(q.semester, "semester")! : undefined,
      courseCode: q.courseCode ? expectString(q.courseCode, "courseCode")! : undefined,
      module: q.module ? expectString(q.module, "module")! : undefined,
      ...parseLimitOffset(q),
    };
    if (!filter.academicYear && !filter.semester && !filter.courseCode && !filter.module) {
      throw fail.validation(
        "GET /api/raw/catalog-previews 必须至少传入一个过滤参数",
        { hint: "可用：academicYear / semester / courseCode / module" }
      );
    }
    return RawRepository.listCatalogPreviews(filter);
  },

  listActualCourseMeetings(q: Record<string, unknown>) {
    return RawRepository.listActualCourseMeetings({
      term: q.term !== undefined ? expectNumber(Number(q.term), "term", { min: 1, max: 8, integer: true })! : undefined,
      week: q.week !== undefined ? expectNumber(Number(q.week), "week", { min: 1, integer: true })! : undefined,
      weekday: q.weekday !== undefined ? expectNumber(Number(q.weekday), "weekday", { min: 1, max: 7, integer: true })! : undefined,
      courseCode: q.courseCode ? expectString(q.courseCode, "courseCode")! : undefined,
      onlyMyPlan: q.onlyMyPlan === undefined ? true : q.onlyMyPlan !== "false" && q.onlyMyPlan !== false,
      ...parseLimitOffset(q),
    });
  },

  searchCourses(q: Record<string, unknown>) {
    const keyword = q.q ?? q.keyword;
    const filter = {
      keyword: keyword !== undefined && String(keyword).trim() !== ""
        ? expectString(keyword, "q")!
        : undefined,
      term: q.term !== undefined
        ? expectNumber(Number(q.term), "term", { min: 1, max: 8, integer: true })!
        : undefined,
      source: q.source !== undefined
        ? expectEnum(q.source, "source", ["all", "section", "added"] as const)!
        : "all" as const,
      ...parseLimitOffset(q),
    };
    if (!filter.keyword && filter.term === undefined) {
      throw fail.validation(
        "GET /api/raw/course-search 必须至少传入 q 或 term",
        { hint: "建议传入当前学期 term，并可附加 q 做实时搜索" }
      );
    }

    const baseYear = RawRepository.baseEnrollmentYear();
    return RawRepository.searchCourses(filter).map((row) => {
      const startYear = Number(row.academic_year.slice(0, 4));
      const termNumber = (startYear - baseYear) * 2 + (row.semester === "fall" ? 1 : 2);
      return {
        sourceType: row.source_type,
        batchId: row.batch_id,
        sourceRow: row.source_row,
        termNumber,
        academicYear: row.academic_year,
        semester: row.semester,
        phase: row.phase,
        courseCode: row.course_code,
        sectionCode: row.section_code,
        courseName: row.course_name,
        credits: row.credits,
        hours: row.hours,
        teacher: row.teacher,
        classTime: row.class_time,
        teachingWeeks: row.teaching_weeks,
        campus: row.campus,
        classroom: row.classroom,
        department: row.department,
        courseAttribute: row.course_attribute,
        enrollmentRestriction: row.enrollment_restriction,
        combinedClassName: row.combined_class_name,
        groupName: row.group_name,
        learningPlatform: row.learning_platform,
        module2022: row.module_2022,
        module2024: row.module_2024,
        remark1: row.remark1,
        remark2: row.remark2,
        existsInProgram: row.exists_in_program === 1,
        existsInCustom: row.exists_in_custom === 1,
      };
    });
  },

  findOpeningsByCode(code: string) {
    const c = expectString(code, "courseCode")!;
    return RawRepository.findOpeningsByCode(c);
  },
};
