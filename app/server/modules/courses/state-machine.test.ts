import { describe, expect, it } from "vitest";
import type { Course } from "./course.types";
import {
  assertNotInTrash,
  assertPlanWritable,
  assertStudyRecordValid,
} from "./state-machine";

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    source: "program",
    courseCode: "TEST101",
    sectionCode: null,
    courseName: "测试课程",
    categoryCode: "general_education",
    categoryName: "通识教育",
    requirementType: "必修",
    courseSubcategory: null,
    credits: 3,
    totalHours: 48,
    lectureHours: 48,
    experimentHours: 0,
    extraHours: 0,
    plannedTerm: null,
    actualTerm: null,
    officialTerm: null,
    studyStatus: "未修读",
    score: null,
    creditCountTo: null,
    prerequisiteCourseCode: null,
    prerequisiteCourseName: null,
    isDeleted: false,
    isPermanentlyDeleted: false,
    deletedAt: null,
    deletedNote: null,
    preferenceLevel: null,
    note: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("assertNotInTrash", () => {
  it("正常课程不抛错", () => {
    expect(() => assertNotInTrash(makeCourse())).not.toThrow();
  });

  it("垃圾篓中的课程应抛 PRECONDITION_FAILED", () => {
    const course = makeCourse({ isDeleted: true });
    expect(() => assertNotInTrash(course)).toThrow("课程在垃圾篓中");
  });
});

describe("assertPlanWritable", () => {
  it("未修读状态可通过", () => {
    expect(() => assertPlanWritable(makeCourse({ studyStatus: "未修读" }))).not.toThrow();
  });

  it("计划修读状态可通过", () => {
    expect(() =>
      assertPlanWritable(makeCourse({ studyStatus: "计划修读" })),
    ).not.toThrow();
  });

  it("已修读状态应拒绝", () => {
    expect(() =>
      assertPlanWritable(makeCourse({ studyStatus: "已修读" })),
    ).toThrow("不能通过 /plan 修改");
  });

  it("正在修读状态应拒绝", () => {
    expect(() =>
      assertPlanWritable(makeCourse({ studyStatus: "正在修读" })),
    ).toThrow("不能通过 /plan 修改");
  });

  it("未通过状态应拒绝", () => {
    expect(() =>
      assertPlanWritable(makeCourse({ studyStatus: "未通过" })),
    ).toThrow("不能通过 /plan 修改");
  });

  it("垃圾篓中的课程 planWritable 应先检查垃圾篓", () => {
    const course = makeCourse({ studyStatus: "未修读", isDeleted: true });
    expect(() => assertPlanWritable(course)).toThrow("课程在垃圾篓中");
  });
});

describe("assertStudyRecordValid", () => {
  it("计划修读 + term + 无 score → 通过", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "计划修读", term: 3, score: null }),
    ).not.toThrow();
  });

  it("已修读 + term + score → 通过", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "已修读", term: 3, score: 85 }),
    ).not.toThrow();
  });

  it("正在修读 + term + 无 score → 通过", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "正在修读", term: 5, score: null }),
    ).not.toThrow();
  });

  it("未通过 + term + score → 通过", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "未通过", term: 3, score: 55 }),
    ).not.toThrow();
  });

  it("未修读 + 无 term + 无 score → 通过", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "未修读", term: null, score: null }),
    ).not.toThrow();
  });

  it("已修读但缺少 term → 报错", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "已修读", term: null, score: 85 }),
    ).toThrow("必须提供 term");
  });

  it("未修读但有 term → 报错", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "未修读", term: 3, score: null }),
    ).toThrow("term 必须为 null");
  });

  it("计划修读但有 score → 报错", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "计划修读", term: 3, score: 90 }),
    ).toThrow("不允许设置 score");
  });

  it("正在修读但有 score → 报错", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "正在修读", term: 3, score: 80 }),
    ).toThrow("不允许设置 score");
  });

  it("未修读但有 score → 报错", () => {
    expect(() =>
      assertStudyRecordValid({ studyStatus: "未修读", term: null, score: 90 }),
    ).toThrow("不允许设置 score");
  });
});
