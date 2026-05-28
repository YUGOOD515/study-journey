import type { CategoryCode } from "../../db";

export type CourseSource = "program" | "custom";

export type RequirementType = "必修" | "选修" | "跨专业" | "经法管融通";

export type StudyStatus =
  | "未修读"
  | "计划修读"
  | "正在修读"
  | "已修读"
  | "未通过";

export type CreditCountTo = "通识教育-选修" | "大类平台-选修";

/**
 * 对外统一的 Course DTO。
 *
 * 注意 program 与 custom 在 plannedTerm/actualTerm 上的差异：
 *  - program: plannedTerm = plan_program_courses.planned_term,
 *             actualTerm  = plan_program_courses.actual_term（可与 plannedTerm 不同）
 *  - custom : plannedTerm = plan_custom_courses.term_number,
 *             actualTerm  = 同 plannedTerm（用户自定义课没有"官方安排"概念，安排到哪就是哪）
 */
export interface Course {
  source: CourseSource;
  courseCode: string;
  sectionCode: string | null;
  courseName: string;

  categoryCode: CategoryCode;
  categoryName: string;
  requirementType: RequirementType;
  courseSubcategory: string | null;

  credits: number;
  totalHours: number;
  lectureHours: number;
  experimentHours: number;
  extraHours: number;

  plannedTerm: number | null;
  actualTerm: number | null;
  officialTerm: string | null;

  studyStatus: StudyStatus;
  score: number | null;

  creditCountTo: CreditCountTo | null;

  prerequisiteCourseCode: string | null;
  prerequisiteCourseName: string | null;

  isDeleted: boolean;
  isPermanentlyDeleted: boolean;
  deletedAt: string | null;
  deletedNote: string | null;

  preferenceLevel: number | null;
  note: string | null;

  createdAt: string;
  updatedAt: string;
}
