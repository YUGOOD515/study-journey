import { fail } from "../../lib/errors";
import { expectNumber, expectString } from "../../lib/validate";
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

  findOpeningsByCode(code: string) {
    const c = expectString(code, "courseCode")!;
    return RawRepository.findOpeningsByCode(c);
  },
};
