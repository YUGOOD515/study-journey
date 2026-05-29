export type CategoryCode =
  | "general_education"
  | "major_platform"
  | "professional_education"
  | "quality_education"
  | "practice_education";

export type CourseNature = "必修" | "选修" | "跨专业";
export type CreditAssignmentTarget = "interdisciplinary" | "elective";

export interface CourseWithCategory {
  course_code: string;
  course_name: string;
  credits: number;
  lecture_hours: number;
  experiment_hours: number;
  extra_hours: number;
  prerequisite_course_code: string | null;
  prerequisite_course_name: string | null;
  category_code: CategoryCode;
  category_name: string;
  course_nature: CourseNature;
  offered_term: string | null;
  course_category: string | null;
  planned_term?: number | null;
  actual_term?: number | null;
  study_status?: string | null;
  score?: number | null;
  note?: string | null;
  credit_count_to?: string | null;
  is_interdisciplinary?: number | null;
  assigned_to?: CreditAssignmentTarget | null;
  is_deleted?: number;
  is_permanently_deleted?: number;
  deleted_at?: string | null;
}

export interface ProgramRequirement {
  category_code: string;
  category_name: string;
  requirement_type: "required" | "elective" | "interdisciplinary";
  requirement_name: string;
  required_credits: number;
  source: string | null;
}

/**
 * 已修记录。两种来源：
 *  - 'official' = 培养方案内课程（course_code 有效；category/nature 从 courses 表反查）
 *  - 'manual'   = 用户手动添加的公选课（id 有效；category/nature 自带）
 */
export interface SemesterCourse {
  source: "official" | "manual";
  id: number | null;
  term_number: number;
  course_code: string | null;
  score: number | null;
  course_name: string;
  credits: number;
  category_code: CategoryCode | null;
  course_nature: CourseNature | null;
  note: string | null;
  /** 仅 source='manual' 有效；0/1 */
  is_interdisciplinary?: number | null;
  /** 仅 source='manual' 有效；is_interdisciplinary=1 时控制学分流向 */
  assigned_to?: CreditAssignmentTarget | null;
  credit_count_to?: string | null;
}

export interface PersonalPlanItem {
  id: number;
  item_type: "official" | "manual";
  course_code: string | null;
  /** null = 显式放进"待安排"抽屉 */
  planned_term: number | null;
  course_name: string;
  credits: number;
  lecture_hours: number;
  experiment_hours: number;
  extra_hours: number;
  prerequisite_course_code: string | null;
  prerequisite_course_name: string | null;
  category_code: CategoryCode;
  category_name: string;
  course_nature: CourseNature;
  offered_term: string | null;
  course_category: string | null;
  score?: number | null;
  note: string | null;
  /** 仅 item_type='manual' 有效 */
  is_interdisciplinary?: number | null;
  assigned_to?: CreditAssignmentTarget | null;
  credit_count_to?: string | null;
}

export interface TrashItem {
  source: "program" | "custom";
  id: number;
  course_code: string | null;
  course_name: string;
  credits: number;
  category_code: CategoryCode;
  category_name: string;
  course_nature: CourseNature;
  course_category: string | null;
  planned_term: number | null;
  actual_term: number | null;
  score: number | null;
  note: string | null;
  lecture_hours?: number | null;
  experiment_hours?: number | null;
  extra_hours?: number | null;
  prerequisite_course_code?: string | null;
  prerequisite_course_name?: string | null;
  offered_term?: string | null;
  deleted_at: string | null;
  deleted_note: string | null;
  is_interdisciplinary?: number | null;
  assigned_to?: CreditAssignmentTarget | null;
  credit_count_to?: string | null;
}

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
