export type CategoryCode =
  | "general_education"
  | "major_platform"
  | "professional_education"
  | "quality_education"
  | "practice_education";

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
  course_nature: "必修" | "选修" | "跨专业";
  offered_term: string | null;
  course_category: string | null;
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
  course_nature: "必修" | "选修" | null;
  note: string | null;
  /** 仅 source='manual' 有效；0/1 */
  is_interdisciplinary?: number | null;
  /** 仅 source='manual' 有效；is_interdisciplinary=1 时控制学分流向 */
  assigned_to?: "interdisciplinary" | "elective" | null;
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
  course_nature: "必修" | "选修" | "跨专业";
  offered_term: string | null;
  course_category: string | null;
  note: string | null;
  /** 仅 item_type='manual' 有效 */
  is_interdisciplinary?: number | null;
  assigned_to?: "interdisciplinary" | "elective" | null;
}

export interface CourseCardDisplayOptions {
  showNature: boolean;
  showScore: boolean;
  showCredits: boolean;
  showCourseCode: boolean;
}

/**
 * 经法管融通课程的学分归属覆盖。
 *   不存在该课程的记录 = 走默认（计入「大类平台·经法管融通」）
 *   assigned_to='elective' = 用户主动切换到该课原属板块的"选修"桶
 */
export interface CreditAssignment {
  course_code: string;
  assigned_to: "interdisciplinary" | "elective";
}
