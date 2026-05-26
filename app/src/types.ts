// ─────────────────────────────────────────────
// v2 数据模型对应的前端类型
// （对齐 course_planner_v2.sqlite / plan_program_courses / plan_custom_courses）
// ─────────────────────────────────────────────

export type CategoryCode =
  | "general_education"
  | "major_platform"
  | "professional_education"
  | "quality_education"
  | "practice_education";

export type RequirementType = "必修" | "选修" | "跨专业" | "经法管融通";

export type StudyStatus =
  | "未修读"
  | "计划修读"
  | "正在修读"
  | "已修读"
  | "未通过";

export type CreditCountTo = "通识教育-选修" | "大类平台-选修";

/** 培养方案中的课程（plan_program_courses 单行） */
export interface PlanProgramCourse {
  category_code: CategoryCode;
  category_name: string;
  requirement_type: RequirementType;
  course_subcategory: string | null;

  course_code: string;
  section_code: string | null;
  course_name: string;

  official_term: string | null;
  planned_term: number | null;

  credits: number;
  total_hours: number;
  lecture_hours: number;
  experiment_hours: number;
  extra_hours: number;

  prerequisite_course_code: string | null;

  actual_term: number | null;
  study_status: StudyStatus;
  score: number | null;

  credit_count_to: CreditCountTo | null;

  source_sheet: string | null;
  source_row: number | null;
  preference_level: number | null;
  note: string | null;

  created_at: string;
  updated_at: string;
}

/** 用户自加课程（plan_custom_courses 单行） */
export interface PlanCustomCourse {
  category_code: CategoryCode;
  category_name: string;
  requirement_type: RequirementType;
  course_subcategory: string | null;

  course_code: string;
  section_code: string | null;
  course_name: string;

  term_number: number | null;

  credits: number;
  total_hours: number;
  lecture_hours: number;
  experiment_hours: number;
  extra_hours: number;

  prerequisite_course_code: string | null;

  study_status: StudyStatus;
  score: number | null;

  credit_count_to: CreditCountTo | null;

  note: string | null;

  created_at: string;
  updated_at: string;
}

/** 毕业学分要求（plan_program_requirements 单行） */
export interface ProgramRequirement {
  category_code: CategoryCode;
  category_name: string;
  requirement_type_code: "required" | "elective" | "interdisciplinary";
  requirement_name: string;
  required_credits: number;
  source: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 课程卡显示选项（前端本地状态） */
export interface CourseCardDisplayOptions {
  showNature: boolean;
  showScore: boolean;
  showCredits: boolean;
  showCourseCode: boolean;
}
