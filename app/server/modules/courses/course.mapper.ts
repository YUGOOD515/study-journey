import type { CategoryCode } from "../../db";
import type { Course, CreditCountTo, RequirementType, StudyStatus } from "./course.types";

interface BaseRow {
  origin_type?: string;
  official_course_code?: string | null;
  category_code: string;
  category_name: string;
  requirement_type: string;
  course_subcategory: string | null;
  course_code: string;
  section_code: string | null;
  course_name: string;
  credits: number;
  total_hours: number;
  lecture_hours: number;
  experiment_hours: number;
  extra_hours: number;
  prerequisite_course_code: string | null;
  prerequisite_course_name: string | null;
  study_status: string;
  score: number | null;
  credit_count_to: string | null;
  note: string | null;
  is_deleted: number;
  deleted_at: string | null;
  deleted_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramRow extends BaseRow {
  official_term: string | null;
  planned_term: number | null;
  actual_term: number | null;
  preference_level: number | null;
  is_permanently_deleted: number;
}

export interface CustomRow extends BaseRow {
  planned_term: number | null;
  actual_term: number | null;
  official_term: string | null;
  preference_level: number | null;
}

export function mapProgramRow(row: ProgramRow): Course {
  return {
    source: "program",
    originType: "official",
    officialCourseCode: row.course_code,
    courseCode: row.course_code,
    sectionCode: row.section_code,
    courseName: row.course_name,

    categoryCode: row.category_code as CategoryCode,
    categoryName: row.category_name,
    requirementType: row.requirement_type as RequirementType,
    courseSubcategory: row.course_subcategory,

    credits: row.credits,
    totalHours: row.total_hours,
    lectureHours: row.lecture_hours,
    experimentHours: row.experiment_hours,
    extraHours: row.extra_hours,

    plannedTerm: row.planned_term,
    actualTerm: row.actual_term,
    officialTerm: row.official_term,

    studyStatus: row.study_status as StudyStatus,
    score: row.score,

    creditCountTo: (row.credit_count_to as CreditCountTo | null) ?? null,

    prerequisiteCourseCode: row.prerequisite_course_code,
    prerequisiteCourseName: row.prerequisite_course_name,

    isDeleted: row.is_deleted === 1,
    isPermanentlyDeleted: row.is_permanently_deleted === 1,
    deletedAt: row.deleted_at,
    deletedNote: row.deleted_note,

    preferenceLevel: row.preference_level,
    note: row.note,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCustomRow(row: CustomRow): Course {
  return {
    source: "custom",
    originType: row.origin_type as Course["originType"],
    officialCourseCode: row.official_course_code ?? null,
    courseCode: row.course_code,
    sectionCode: row.section_code,
    courseName: row.course_name,

    categoryCode: row.category_code as CategoryCode,
    categoryName: row.category_name,
    requirementType: row.requirement_type as RequirementType,
    courseSubcategory: row.course_subcategory,

    credits: row.credits,
    totalHours: row.total_hours,
    lectureHours: row.lecture_hours,
    experimentHours: row.experiment_hours,
    extraHours: row.extra_hours,

    plannedTerm: row.planned_term,
    actualTerm: row.actual_term,
    officialTerm: row.official_term,

    studyStatus: row.study_status as StudyStatus,
    score: row.score,

    creditCountTo: (row.credit_count_to as CreditCountTo | null) ?? null,

    prerequisiteCourseCode: row.prerequisite_course_code,
    prerequisiteCourseName: row.prerequisite_course_name,

    isDeleted: row.is_deleted === 1,
    isPermanentlyDeleted: false,
    deletedAt: row.deleted_at,
    deletedNote: row.deleted_note,

    preferenceLevel: row.preference_level,
    note: row.note,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
