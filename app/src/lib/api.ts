import type {
  CourseWithCategory,
  ProgramRequirement,
  SemesterCourse,
} from "../types";

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export const api = {
  coursesWithCategory: () =>
    getJSON<CourseWithCategory[]>("/api/courses-with-category"),
  programRequirements: () =>
    getJSON<ProgramRequirement[]>("/api/program-requirements"),
  semesterCourses: () =>
    getJSON<SemesterCourse[]>("/api/semester-courses"),
};
