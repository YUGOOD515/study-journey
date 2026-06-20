export type CategoryCode =
  | "general_education"
  | "major_platform"
  | "professional_education"
  | "quality_education"
  | "practice_education";

export type CourseNature = "必修" | "选修" | "跨专业" | "经法管融通";
export type CreditAssignmentTarget = "interdisciplinary" | "elective";

/** 后端 RequirementType */
export type RequirementType = CourseNature;
/** 后端 StudyStatus */
export type StudyStatus = "未修读" | "计划修读" | "正在修读" | "已修读" | "未通过";
/** 后端 CreditCountTo */
export type CreditCountTo = "通识教育-选修" | "大类平台-选修";
/** 后端 CourseSource */
export type CourseSource = "program" | "custom";

// ══════════════════════════════════════════════════════════════════════
// 新统一类型（camelCase，与后端 DTO 对齐）
// ══════════════════════════════════════════════════════════════════════

/** 课程统一模型，与后端 CourseDto 完全对齐。是前端的主要数据载体。 */
export interface Course {
  source: CourseSource;
  originType?: "official" | "manual" | "raw";
  officialCourseCode?: string | null;
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

// ══════════════════════════════════════════════════════════════════════
// 旧 snake_case 类型已全部迁移到 Course（camelCase），下列类型已删除。
// 若需要旧的 ProgramRequirement，请使用 api.ts 的 RequirementDto。
// ══════════════════════════════════════════════════════════════════════

export interface CourseCardDisplayOptions {
  showNature: boolean;
  showScore: boolean;
  showCredits: boolean;
  showCourseCode: boolean;
}


export interface PlanCoursePatch {
  course_name?: string;
  category_code?: CategoryCode;
  course_nature?: CourseNature;
  is_interdisciplinary?: 0 | 1;
  assigned_to?: CreditAssignmentTarget;
  credits?: number;
  lecture_hours?: number;
  experiment_hours?: number;
  extra_hours?: number;
  planned_term?: number | null;
  prerequisite_course_code?: string | null;
  score?: number | null;
  note?: string | null;
}

export interface CourseEditDraft {
  course_name: string;
  category_code: CategoryCode;
  course_nature: CourseNature;
  is_interdisciplinary: 0 | 1;
  assigned_to: CreditAssignmentTarget;
  credits: string;
  lecture_hours: string;
  experiment_hours: string;
  extra_hours: string;
  planned_term: number | null;
  prerequisite_course_code: string;
  score: string;
  note: string;
}

/** 后端 /api/progress 的响应（唯一真相源，详见 docs/16）。 */
export type RequirementTypeCode = "required" | "elective" | "interdisciplinary";

export interface ProgressBucketCourse {
  courseCode: string;
  courseName: string;
  credits: number;
  studyStatus: string;
  source: "program" | "custom";
  score: number | null;
  categoryCode: CategoryCode;
  term: number | null;
  requirementType: "必修" | "选修" | "跨专业" | "经法管融通";
  creditCountTo: string | null;
}

export interface ProgressBucket {
  categoryCode: CategoryCode;
  categoryName: string;
  requirementTypeCode: RequirementTypeCode;
  requirementName: string;
  required: number;
  earned: number;
  inProgress: number;
  planned: number;
  pending: number;
  courses: ProgressBucketCourse[];
}

export interface ProgressResponse {
  byCategory: ProgressBucket[];
  totals: {
    required: number;
    earned: number;
    inProgress: number;
    planned: number;
    pending: number;
  };
  overflow: {
    interdisciplinary: {
      cap: number;
      totalAttempted: number;
      counted: number;
      overflowCredits: number;
      overflowCourses: Array<{
        courseCode: string;
        courseName: string;
        credits: number;
        studyStatus: string;
      }>;
    };
  };
}

export interface ActualCourseMeeting {
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
  source_sheet: string | null;
  source_row: number;
  academic_year: string;
  semester: string;
  phase: string;
}

export interface RawCourseSearchResult {
  sourceType: "section" | "added";
  batchId: number;
  sourceRow: number;
  termNumber: number;
  academicYear: string;
  semester: "fall" | "spring";
  phase: "final" | "beginning_add" | "actual_schedule";
  courseCode: string;
  sectionCode: string | null;
  courseName: string;
  credits: number | null;
  hours: number | null;
  teacher: string | null;
  classTime: string | null;
  teachingWeeks: string | null;
  campus: string | null;
  classroom: string | null;
  department: string | null;
  courseAttribute: string | null;
  enrollmentRestriction: string | null;
  combinedClassName: string | null;
  groupName: string | null;
  learningPlatform: string | null;
  module2022: string | null;
  module2024: string | null;
  remark1: string | null;
  remark2: string | null;
  existsInProgram: boolean;
  existsInCustom: boolean;
}
