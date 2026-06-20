import { CATEGORIES, CATEGORY_NAME_BY_CODE, type CategoryCode } from "../../db";
import { buildCustomCourseCode } from "../../lib/custom-code";
import { fail } from "../../lib/errors";
import { unitOfWork } from "../../lib/unit-of-work";
import {
  expectArray,
  expectEnum,
  expectNumber,
  expectString,
} from "../../lib/validate";
import {
  RawRepository,
  type RawActualMeetingInsertRow,
  type RawCourseSearchRow,
  type RawCourseSearchSource,
} from "../raw/raw.repository";
import { isCustomCode, resolveCourse } from "./course-resolver";
import {
  CustomCourseRepository,
  type CustomCourseFilter,
} from "./custom-course.repository";
import {
  ProgramCourseRepository,
  type ProgramCourseFilter,
} from "./program-course.repository";
import type {
  Course,
  CreditCountTo,
  CourseSource,
  RequirementType,
  StudyStatus,
} from "./course.types";

const CATEGORY_CODES = CATEGORIES.map((c) => c.code) as CategoryCode[];
const REQUIREMENT_TYPES: RequirementType[] = ["必修", "选修", "跨专业", "经法管融通"];
const CREDIT_COUNT_TO_VALUES: CreditCountTo[] = ["通识教育-选修", "大类平台-选修"];

export interface CourseListFilter {
  source?: CourseSource | "all";
  category?: CategoryCode;
  requirementType?: RequirementType;
  status?: StudyStatus[];
  term?: number | "null";
  keyword?: string;
  inTrash?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateCustomCourseDto {
  courseCode?: string | null;
  courseName: string;
  categoryCode: CategoryCode;
  requirementType: RequirementType;
  courseSubcategory: string | null;
  credits: number;
  totalHours: number;
  lectureHours: number;
  experimentHours: number;
  extraHours: number;
  plannedTerm: number | null;
  creditCountTo: CreditCountTo | null;
  prerequisiteCourseCode: string | null;
  note: string | null;
}

export interface CreateCustomCourseFromRawDto {
  sourceType: RawCourseSearchSource;
  batchId: number;
  sourceRow: number;
  courseCode: string;
  sectionCode: string | null;
  termNumber: number;
  categoryCode: CategoryCode;
  courseNature: "必修" | "选修" | "跨专业";
  isInterdisciplinary: boolean;
  assignedTo: "interdisciplinary" | "elective";
  credits: number;
  totalHours: number;
  lectureHours: number;
  experimentHours: number;
  extraHours: number;
  studyStatus: StudyStatus;
  score: number | null;
  note: string | null;
}

export interface UpdateCourseFieldsDto {
  courseName?: string;
  categoryCode?: CategoryCode;
  requirementType?: RequirementType;
  courseSubcategory?: string | null;
  credits?: number;
  totalHours?: number;
  lectureHours?: number;
  experimentHours?: number;
  extraHours?: number;
  prerequisiteCourseCode?: string | null;
  preferenceLevel?: number | null;
  note?: string | null;
  /**
   * 仅当 requirementType 同时变更时才允许出现：
   * 进入"经法管融通" 必须给 creditCountTo；离开"经法管融通" 必须为 null。
   */
  creditCountTo?: CreditCountTo | null;
}

function parseListFilter(q: Record<string, unknown>): CourseListFilter {
  const filter: CourseListFilter = {};
  if (q.source !== undefined) {
    filter.source = expectEnum(q.source, "source", ["program", "custom", "all"] as const)!;
  }
  if (q.category !== undefined) {
    filter.category = expectEnum(q.category, "category", CATEGORY_CODES as readonly CategoryCode[])!;
  }
  if (q.requirementType !== undefined) {
    filter.requirementType = expectEnum(q.requirementType, "requirementType", REQUIREMENT_TYPES)!;
  }
  if (q.status !== undefined) {
    const raw = String(q.status).split(",").map((s) => s.trim()).filter(Boolean);
    const allowed: StudyStatus[] = ["未修读", "计划修读", "正在修读", "已修读", "未通过"];
    for (const s of raw) {
      if (!allowed.includes(s as StudyStatus)) {
        throw fail.validation(`status 包含非法值: ${s}`, { status: "枚举值不合法" });
      }
    }
    filter.status = raw as StudyStatus[];
  }
  if (q.term !== undefined) {
    const v = q.term;
    if (v === "null" || v === null) {
      filter.term = "null";
    } else {
      filter.term = expectNumber(Number(v), "term", { min: 1, max: 8, integer: true })!;
    }
  }
  if (q.keyword !== undefined) {
    filter.keyword = expectString(q.keyword, "keyword")!;
  }
  if (q.inTrash !== undefined) {
    filter.inTrash = q.inTrash === "true" || q.inTrash === true;
  }
  if (q.limit !== undefined) {
    filter.limit = expectNumber(Number(q.limit), "limit", { min: 1, max: 1000, integer: true })!;
  }
  if (q.offset !== undefined) {
    filter.offset = expectNumber(Number(q.offset), "offset", { min: 0, integer: true })!;
  }
  return filter;
}

function assertCategoryCode(value: string): CategoryCode {
  if (!CATEGORY_CODES.includes(value as CategoryCode)) {
    throw fail.validation(`categoryCode 无效: ${value}`, { categoryCode: "枚举值不合法" });
  }
  return value as CategoryCode;
}

function categoryName(code: CategoryCode): string {
  return CATEGORY_NAME_BY_CODE[code];
}

function validateHours(
  fields: { totalHours: number; lectureHours: number; experimentHours: number; extraHours: number }
) {
  const sum = fields.lectureHours + fields.experimentHours + fields.extraHours;
  if (Math.abs(sum - fields.totalHours) > 1e-6) {
    throw fail.precondition(
      `学时之和必须等于 totalHours：${fields.lectureHours}+${fields.experimentHours}+${fields.extraHours} = ${sum} ≠ ${fields.totalHours}`,
      { fields: { totalHours: "与三项学时之和不一致" } }
    );
  }
}

function validateCreditCountToWithType(
  requirementType: RequirementType,
  creditCountTo: CreditCountTo | null
) {
  const isInterd = requirementType === "经法管融通";
  if (isInterd && creditCountTo === null) {
    throw fail.precondition(
      "requirementType=经法管融通 时 creditCountTo 必填",
      { fields: { creditCountTo: "经法管融通必须指定计入方向" } }
    );
  }
  if (!isInterd && creditCountTo !== null) {
    throw fail.precondition(
      "非经法管融通课程不允许设置 creditCountTo",
      { fields: { creditCountTo: "仅经法管融通可设置" } }
    );
  }
}

function assertPrerequisiteExists(prereqCode: string) {
  if (!ProgramCourseRepository.exists(prereqCode)) {
    throw fail.precondition(
      `prerequisiteCourseCode 无效：在 program 表中找不到 ${prereqCode}`,
      { fields: { prerequisiteCourseCode: "必须指向已存在的 program 课程" } }
    );
  }
}

function courseCodeExists(code: string): boolean {
  return Boolean(
    ProgramCourseRepository.findByCode(code, {
      includeTrash: true,
      includePermanentlyDeleted: true,
    }) || CustomCourseRepository.findByCode(code, { includeTrash: true })
  );
}

function validateCustomCourseCode(code: string): string {
  const normalized = code.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(normalized)) {
    throw fail.validation("courseCode 只能包含英文字母、数字、下划线、短横线和点号，且长度不超过 64", {
      courseCode: "格式不合法",
    });
  }
  if (courseCodeExists(normalized)) {
    throw fail.conflict(`课程号已存在：${normalized}`, { courseCode: normalized });
  }
  return normalized;
}

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

const ACTUAL_CLASS_TIME_RE = /(?:(?<weeks>[0-9,，、-]+)周\s*)?星期(?<weekday>[一二三四五六日天])\s*(?<periods>\d+)节/g;

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function splitRawSlots(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/[,，;；]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseWeekIntervals(text: string): Array<{ startWeek: number; endWeek: number }> {
  const intervals: Array<{ startWeek: number; endWeek: number }> = [];
  for (const part of text.split(/[,，、]/)) {
    const token = part.trim();
    if (!token) continue;
    const [startRaw, endRaw] = token.includes("-") ? token.split("-", 2) : [token, token];
    let startWeek = Number(startRaw);
    let endWeek = Number(endRaw);
    if (!Number.isInteger(startWeek) || !Number.isInteger(endWeek) || startWeek <= 0 || endWeek <= 0) {
      throw fail.precondition(`无法解析周次：${text}`, { classTime: text });
    }
    if (endWeek < startWeek) [startWeek, endWeek] = [endWeek, startWeek];
    intervals.push({ startWeek, endWeek });
  }
  return intervals;
}

function parsePeriodRange(text: string): { startPeriod: number; endPeriod: number } {
  if (text.length % 2 !== 0) {
    throw fail.precondition(`无法解析节次：${text}`, { classTime: text });
  }
  const periods: number[] = [];
  for (let i = 0; i < text.length; i += 2) {
    const period = Number(text.slice(i, i + 2));
    if (!Number.isInteger(period) || period <= 0) {
      throw fail.precondition(`无法解析节次：${text}`, { classTime: text });
    }
    periods.push(period);
  }
  return { startPeriod: periods[0], endPeriod: periods[periods.length - 1] };
}

function joinLocation(row: RawCourseSearchRow): string | null {
  const location = [row.campus, row.classroom]
    .map(nullableText)
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return nullableText(location) ?? nullableText(row.learning_platform);
}

function parseActualMeetingsFromText(
  classTime: string | null,
  locationRaw: string | null
): Array<Omit<RawActualMeetingInsertRow, "batch_id" | "term" | "course_code" | "section_code" | "meeting_no" | "course_name" | "teacher" | "class_group" | "course_nature" | "course_attribute" | "class_time_raw" | "location_raw" | "source_sheet" | "source_row">> {
  const source = nullableText(classTime);
  if (!source) return [];
  const locations = splitRawSlots(locationRaw);
  const meetings: Array<Omit<RawActualMeetingInsertRow, "batch_id" | "term" | "course_code" | "section_code" | "meeting_no" | "course_name" | "teacher" | "class_group" | "course_nature" | "course_attribute" | "class_time_raw" | "location_raw" | "source_sheet" | "source_row">> = [];
  const matches = [...source.matchAll(ACTUAL_CLASS_TIME_RE)];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const weeks = match.groups?.weeks;
    const weekdayRaw = match.groups?.weekday;
    const periods = match.groups?.periods;
    if (!weeks || !weekdayRaw || !periods) continue;
    const weekday = WEEKDAY_MAP[weekdayRaw];
    const { startPeriod, endPeriod } = parsePeriodRange(periods);
    const locationText = locations[i] ?? locations[locations.length - 1] ?? null;
    for (const interval of parseWeekIntervals(weeks)) {
      meetings.push({
        start_week: interval.startWeek,
        end_week: interval.endWeek,
        weekday,
        start_period: startPeriod,
        end_period: endPeriod,
        location_text: locationText,
      });
    }
  }
  return meetings;
}

function buildSectionClassTime(row: RawCourseSearchRow): string | null {
  const classSlots = splitRawSlots(row.class_time);
  if (classSlots.length === 0) return null;
  const weekSlots = splitRawSlots(row.teaching_weeks);
  return classSlots
    .map((slot, index) => {
      if (/\d+周\s*星期/.test(slot)) return slot;
      const week = weekSlots[index] ?? weekSlots[weekSlots.length - 1];
      return week ? `${week} ${slot}` : slot;
    })
    .join(",");
}

function buildActualMeetingRows(
  row: RawCourseSearchRow,
  input: CreateCustomCourseFromRawDto,
  requirementType: RequirementType
): RawActualMeetingInsertRow[] {
  const sectionCode = row.source_type === "added" ? "1" : nullableText(row.section_code);
  if (!sectionCode) {
    throw fail.precondition("正式开课记录缺少课序号，不能写入学期课表", {
      fields: { sectionCode: "缺失" },
    });
  }

  const classTimeRaw = row.source_type === "section" ? buildSectionClassTime(row) : row.class_time;
  const locationRaw = joinLocation(row);
  const parsed = parseActualMeetingsFromText(classTimeRaw, locationRaw);
  if (parsed.length === 0) {
    throw fail.precondition(
      `无法从「${row.course_name}」的上课时间解析出课程片段`,
      { courseCode: row.course_code, classTime: row.class_time, teachingWeeks: row.teaching_weeks }
    );
  }

  const courseAttribute = nullableText(row.course_attribute)
    ?? nullableText(row.module_2024)
    ?? nullableText(row.module_2022)
    ?? nullableText(row.enrollment_restriction);

  return parsed.map((meeting, index) => ({
    batch_id: row.batch_id,
    term: input.termNumber,
    course_code: row.course_code,
    section_code: sectionCode,
    meeting_no: index + 1,
    start_week: meeting.start_week,
    end_week: meeting.end_week,
    weekday: meeting.weekday,
    start_period: meeting.start_period,
    end_period: meeting.end_period,
    location_text: meeting.location_text,
    course_name: row.course_name,
    teacher: nullableText(row.teacher),
    class_group: nullableText(row.combined_class_name) ?? nullableText(row.group_name),
    course_nature: requirementType,
    course_attribute: courseAttribute,
    class_time_raw: classTimeRaw,
    location_raw: locationRaw,
    source_sheet: `search-add:${row.source_type}`,
    source_row: row.source_row,
  }));
}

function parseCreateFromRawDto(body: unknown): CreateCustomCourseFromRawDto {
  const dto = (body ?? {}) as Record<string, unknown>;
  const sourceType = expectEnum(dto.sourceType, "sourceType", ["section", "added"] as const)!;
  const batchId = expectNumber(Number(dto.batchId), "batchId", { min: 1, integer: true })!;
  const sourceRow = expectNumber(Number(dto.sourceRow), "sourceRow", { min: 1, integer: true })!;
  const courseCode = expectString(dto.courseCode, "courseCode")!;
  const sectionCode = dto.sectionCode === undefined || dto.sectionCode === null
    ? null
    : expectString(dto.sectionCode, "sectionCode", { allowNull: true });
  const termNumber = expectNumber(Number(dto.termNumber), "termNumber", { min: 1, max: 8, integer: true })!;
  const categoryCode = assertCategoryCode(expectString(dto.categoryCode, "categoryCode")!);
  const courseNature = expectEnum(dto.courseNature, "courseNature", ["必修", "选修", "跨专业"] as const)!;
  const isInterdisciplinary = dto.isInterdisciplinary === true || dto.isInterdisciplinary === 1;
  const assignedTo = expectEnum(dto.assignedTo ?? "interdisciplinary", "assignedTo", ["interdisciplinary", "elective"] as const)!;
  const credits = expectNumber(Number(dto.credits), "credits", { min: 0 })!;
  const totalHours = expectNumber(Number(dto.totalHours ?? 0), "totalHours", { min: 0, integer: true })!;
  const lectureHours = expectNumber(Number(dto.lectureHours ?? totalHours), "lectureHours", { min: 0, integer: true })!;
  const experimentHours = expectNumber(Number(dto.experimentHours ?? 0), "experimentHours", { min: 0, integer: true })!;
  const extraHours = expectNumber(Number(dto.extraHours ?? 0), "extraHours", { min: 0, integer: true })!;
  validateHours({ totalHours, lectureHours, experimentHours, extraHours });
  const studyStatus = expectEnum(
    dto.studyStatus ?? "计划修读",
    "studyStatus",
    ["未修读", "计划修读", "正在修读", "已修读", "未通过"] as const
  )!;
  const score = dto.score === undefined || dto.score === null || String(dto.score).trim() === ""
    ? null
    : expectNumber(Number(dto.score), "score", { min: 0, max: 100 })!;
  const note = dto.note === undefined || dto.note === null
    ? null
    : expectString(dto.note, "note", { allowNull: true });
  return {
    sourceType,
    batchId,
    sourceRow,
    courseCode,
    sectionCode,
    termNumber,
    categoryCode,
    courseNature,
    isInterdisciplinary,
    assignedTo,
    credits,
    totalHours,
    lectureHours,
    experimentHours,
    extraHours,
    studyStatus,
    score,
    note,
  };
}

function creditCountToFromAssignedTo(assignedTo: "interdisciplinary" | "elective"): CreditCountTo {
  return assignedTo === "elective" ? "通识教育-选修" : "大类平台-选修";
}

function nextAvailableCustomCourseCode(): string {
  for (let i = 0; i < 20; i += 1) {
    const candidate = buildCustomCourseCode();
    if (!courseCodeExists(candidate)) return candidate;
  }
  throw fail.conflict("自动生成课程号失败：连续多次与已有课程冲突");
}

export const CourseService = {
  list(query: Record<string, unknown>): { data: Course[]; total: number } {
    const filter = parseListFilter(query);
    const source = filter.source ?? "all";

    const sharedFilter = {
      category: filter.category,
      requirementType: filter.requirementType,
      status: filter.status,
      term: filter.term,
      keyword: filter.keyword,
      inTrash: filter.inTrash,
      limit: filter.limit,
      offset: filter.offset,
    };

    const programs =
      source === "program" ? ProgramCourseRepository.find(sharedFilter as ProgramCourseFilter) : [];
    const customs =
      source === "program" ? [] : CustomCourseRepository.find(sharedFilter as CustomCourseFilter);

    const merged = [...programs, ...customs];
    return { data: merged, total: merged.length };
  },

  getByCode(code: string, opts?: { includeTrash?: boolean }): Course {
    return resolveCourse(code, opts);
  },

  createCustom(body: unknown): Course {
    const dto = (body ?? {}) as Record<string, unknown>;

    const courseName = expectString(dto.courseName, "courseName")!;
    const categoryCodeRaw = expectString(dto.categoryCode, "categoryCode")!;
    const categoryCode = assertCategoryCode(categoryCodeRaw);
    const requirementType = expectEnum(dto.requirementType, "requirementType", REQUIREMENT_TYPES)!;
    const courseSubcategory =
      dto.courseSubcategory === undefined || dto.courseSubcategory === null
        ? null
        : expectString(dto.courseSubcategory, "courseSubcategory", { allowNull: true });
    const credits = expectNumber(dto.credits, "credits", { min: 0 })!;
    const totalHours = expectNumber(dto.totalHours, "totalHours", { min: 0, integer: true })!;
    const lectureHours = expectNumber(dto.lectureHours, "lectureHours", { min: 0, integer: true })!;
    const experimentHours = expectNumber(dto.experimentHours, "experimentHours", { min: 0, integer: true })!;
    const extraHours = expectNumber(dto.extraHours, "extraHours", { min: 0, integer: true })!;
    validateHours({ totalHours, lectureHours, experimentHours, extraHours });

    const plannedTerm =
      dto.plannedTerm === undefined || dto.plannedTerm === null
        ? null
        : expectNumber(dto.plannedTerm, "plannedTerm", { min: 1, max: 8, integer: true });

    const creditCountTo =
      dto.creditCountTo === undefined || dto.creditCountTo === null
        ? null
        : expectEnum(dto.creditCountTo, "creditCountTo", CREDIT_COUNT_TO_VALUES);
    validateCreditCountToWithType(requirementType, creditCountTo);

    const prerequisiteCourseCode =
      dto.prerequisiteCourseCode === undefined || dto.prerequisiteCourseCode === null
        ? null
        : expectString(dto.prerequisiteCourseCode, "prerequisiteCourseCode", { allowNull: true });
    if (prerequisiteCourseCode) assertPrerequisiteExists(prerequisiteCourseCode);

    const note =
      dto.note === undefined || dto.note === null
        ? null
        : expectString(dto.note, "note", { allowNull: true });

    const courseCode =
      dto.courseCode === undefined || dto.courseCode === null || String(dto.courseCode).trim() === ""
        ? nextAvailableCustomCourseCode()
        : validateCustomCourseCode(expectString(dto.courseCode, "courseCode")!);

    CustomCourseRepository.insert({
      course_code: courseCode,
      category_code: categoryCode,
      category_name: categoryName(categoryCode),
      requirement_type: requirementType,
      course_subcategory: courseSubcategory ?? null,
      course_name: courseName,
      section_code: null,
      credits,
      total_hours: totalHours,
      lecture_hours: lectureHours,
      experiment_hours: experimentHours,
      extra_hours: extraHours,
      term_number: plannedTerm,
      prerequisite_course_code: prerequisiteCourseCode ?? null,
      study_status: plannedTerm !== null ? "计划修读" : "未修读",
      score: null,
      credit_count_to: creditCountTo ?? null,
      note: note ?? null,
    });

    const created = CustomCourseRepository.findByCode(courseCode);
    if (!created) throw fail.notFound("custom course", courseCode);
    return created;
  },

  createCustomFromRaw(body: unknown): Course {
    const input = parseCreateFromRawDto(body);
    const raw = RawRepository.findSearchRowForAdd({
      sourceType: input.sourceType,
      batchId: input.batchId,
      sourceRow: input.sourceRow,
      courseCode: input.courseCode,
      sectionCode: input.sectionCode,
    });
    if (!raw) {
      throw fail.notFound("raw course", `${input.sourceType}:${input.batchId}:${input.sourceRow}`);
    }
    if (raw.course_code !== input.courseCode) {
      throw fail.validation("courseCode 与 raw 记录不一致", { courseCode: "与来源不一致" });
    }
    if (raw.source_type === "section" && raw.section_code !== input.sectionCode) {
      throw fail.validation("sectionCode 与 raw 记录不一致", { sectionCode: "与来源不一致" });
    }

    const existingProgram = ProgramCourseRepository.findByCode(raw.course_code, {
      includeTrash: true,
      includePermanentlyDeleted: true,
    });
    const existingPlanCourse = CustomCourseRepository.findByCodeOrNameInTerm({
      courseCode: raw.course_code,
      courseName: raw.course_name,
      term: input.termNumber,
      includeTrash: true,
    });

    const categoryCode = existingProgram?.categoryCode ?? input.categoryCode;
    const categoryNameValue = existingProgram?.categoryName ?? categoryName(categoryCode);
    const requirementType: RequirementType = existingProgram?.requirementType ?? (
      input.isInterdisciplinary ? "经法管融通" : input.courseNature
    );
    const creditCountTo = requirementType === "经法管融通"
      ? existingProgram?.creditCountTo ?? creditCountToFromAssignedTo(input.assignedTo)
      : null;
    validateCreditCountToWithType(requirementType, creditCountTo);

    const courseSubcategory = existingProgram
      ? existingProgram.courseSubcategory
      : input.isInterdisciplinary
        ? `${categoryName(categoryCode)}（经法管融通）`
        : nullableText(raw.module_2024) ?? nullableText(raw.module_2022) ?? nullableText(raw.course_attribute);
    const sourceNote = [
      `来源：${raw.source_type === "section" ? "正式开课表" : "补选新增课"}`,
      `batch=${raw.batch_id}`,
      `sourceRow=${raw.source_row}`,
      raw.section_code ? `课序号=${raw.section_code}` : null,
      input.note,
    ].filter(Boolean).join("；");

    const actualRows = buildActualMeetingRows(raw, input, requirementType);
    const targetSectionCode = raw.source_type === "added" ? "1" : raw.section_code;
    const shouldInsertActualRows = targetSectionCode
      ? !RawRepository.actualMeetingsExist({
          term: input.termNumber,
          courseCode: raw.course_code,
          sectionCode: targetSectionCode,
        })
      : true;

    return unitOfWork(() => {
      if (existingPlanCourse && existingPlanCourse.courseCode !== raw.course_code) {
        CustomCourseRepository.delete(existingPlanCourse.courseCode);
      }
      CustomCourseRepository.insert({
        origin_type: existingProgram
          ? "official"
          : existingPlanCourse?.originType === "official"
            ? "official"
            : "raw",
        official_course_code: existingProgram?.courseCode ?? existingPlanCourse?.officialCourseCode ?? null,
        course_code: raw.course_code,
        category_code: categoryCode,
        category_name: categoryNameValue,
        requirement_type: requirementType,
        course_subcategory: courseSubcategory,
        course_name: raw.course_name,
        section_code: raw.source_type === "added" ? "1" : raw.section_code,
        credits: input.credits,
        total_hours: input.totalHours,
        lecture_hours: input.lectureHours,
        experiment_hours: input.experimentHours,
        extra_hours: input.extraHours,
        term_number: input.termNumber,
        actual_term: input.studyStatus === "计划修读" ? null : input.termNumber,
        official_term: existingProgram?.officialTerm ?? existingPlanCourse?.officialTerm ?? null,
        prerequisite_course_code: null,
        study_status: input.studyStatus,
        score: input.score,
        credit_count_to: creditCountTo,
        note: sourceNote,
      });
      if (shouldInsertActualRows) {
        RawRepository.insertActualCourseMeetings(actualRows);
      }
      const created = CustomCourseRepository.findByCode(raw.course_code);
      if (!created) throw fail.notFound("custom course", raw.course_code);
      return created;
    });
  },

  updateFields(code: string, body: unknown): Course {
    const existing = resolveCourse(code);
    const dto = (body ?? {}) as Record<string, unknown>;

    if (existing.source === "program") {
      throw fail.precondition("官方培养计划是只读的，请在我的计划中修改课程", { courseCode: code });
    }

    const patch: Record<string, unknown> = {};

    if (dto.courseName !== undefined) {
      patch.course_name = expectString(dto.courseName, "courseName");
    }
    if (dto.categoryCode !== undefined) {
      const code = assertCategoryCode(String(dto.categoryCode));
      patch.category_code = code;
      patch.category_name = categoryName(code);
    }
    if (dto.requirementType !== undefined) {
      const rt = expectEnum(dto.requirementType, "requirementType", REQUIREMENT_TYPES)!;
      patch.requirement_type = rt;
    }
    if (dto.courseSubcategory !== undefined) {
      patch.course_subcategory =
        dto.courseSubcategory === null
          ? null
          : expectString(dto.courseSubcategory, "courseSubcategory", { allowNull: true });
    }
    if (dto.credits !== undefined) {
      patch.credits = expectNumber(dto.credits, "credits", { min: 0 });
    }
    for (const field of ["totalHours", "lectureHours", "experimentHours", "extraHours"] as const) {
      if (dto[field] !== undefined) {
        const colMap: Record<string, string> = {
          totalHours: "total_hours",
          lectureHours: "lecture_hours",
          experimentHours: "experiment_hours",
          extraHours: "extra_hours",
        };
        patch[colMap[field]] = expectNumber(dto[field], field, { min: 0, integer: true });
      }
    }
    if (dto.prerequisiteCourseCode !== undefined) {
      if (dto.prerequisiteCourseCode === null) {
        patch.prerequisite_course_code = null;
      } else {
        const v = expectString(dto.prerequisiteCourseCode, "prerequisiteCourseCode")!;
        assertPrerequisiteExists(v);
        patch.prerequisite_course_code = v;
      }
    }
    if (dto.preferenceLevel !== undefined) {
      patch.preference_level =
        dto.preferenceLevel === null
          ? null
          : expectNumber(dto.preferenceLevel, "preferenceLevel", { min: 1, max: 5, integer: true });
    }
    if (dto.note !== undefined) {
      patch.note =
        dto.note === null ? null : expectString(dto.note, "note", { allowNull: true });
    }

    // 学时一致性校验：用 patch 中提供的值 + existing 的剩余值合并后校验
    const totalHours = (patch.total_hours as number | undefined) ?? existing.totalHours;
    const lectureHours = (patch.lecture_hours as number | undefined) ?? existing.lectureHours;
    const experimentHours = (patch.experiment_hours as number | undefined) ?? existing.experimentHours;
    const extraHours = (patch.extra_hours as number | undefined) ?? existing.extraHours;
    if (
      patch.total_hours !== undefined ||
      patch.lecture_hours !== undefined ||
      patch.experiment_hours !== undefined ||
      patch.extra_hours !== undefined
    ) {
      validateHours({ totalHours, lectureHours, experimentHours, extraHours });
    }

    // requirementType ↔ creditCountTo 一致性
    if (patch.requirement_type !== undefined || dto.creditCountTo !== undefined) {
      const nextType = (patch.requirement_type as RequirementType | undefined) ?? existing.requirementType;
      let nextCountTo: CreditCountTo | null;
      if (dto.creditCountTo !== undefined) {
        nextCountTo =
          dto.creditCountTo === null
            ? null
            : expectEnum(dto.creditCountTo, "creditCountTo", CREDIT_COUNT_TO_VALUES);
        patch.credit_count_to = nextCountTo;
      } else {
        nextCountTo = existing.creditCountTo;
        // 若 type 切换离开经法管融通，自动清空 creditCountTo
        if (existing.requirementType === "经法管融通" && nextType !== "经法管融通") {
          patch.credit_count_to = null;
          nextCountTo = null;
        }
      }
      validateCreditCountToWithType(nextType, nextCountTo);
    }

    CustomCourseRepository.update(code, patch);
    return resolveCourse(code);
  },

  /** 批量校验工具：可被批量动作复用。 */
  validateBatchCodesUnique(codes: string[], field = "codes") {
    expectArray(codes, field);
    const seen = new Set<string>();
    for (const c of codes) {
      if (seen.has(c)) {
        throw fail.validation(`${field} 中包含重复的 courseCode：${c}`, {
          [field]: `重复项 ${c}`,
        });
      }
      seen.add(c);
    }
  },

  isCustomCode,
};
