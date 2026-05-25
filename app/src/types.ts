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

export interface SemesterCourse {
  term_number: number;
  course_code: string;
  score: number | null;
  course_name: string;
  credits: number;
}
