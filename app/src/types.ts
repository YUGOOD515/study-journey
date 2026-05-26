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

/**
 * 经法管融通课程的学分归属覆盖。
 *   不存在该课程的记录 = 走默认（计入「大类平台·经法管融通」）
 *   assigned_to='elective' = 用户主动切换到该课原属板块的"选修"桶
 */
export interface CreditAssignment {
  course_code: string;
  assigned_to: CreditAssignmentTarget;
}
