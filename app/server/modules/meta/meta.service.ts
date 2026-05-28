import { CATEGORIES } from "../../db";

const REQUIREMENT_TYPES = ["必修", "选修", "跨专业", "经法管融通"] as const;
const CREDIT_COUNT_TO = ["通识教育-选修", "大类平台-选修"] as const;
const STUDY_STATUSES = [
  "未修读",
  "计划修读",
  "正在修读",
  "已修读",
  "未通过",
] as const;

export const MetaService = {
  enums() {
    return {
      categories: CATEGORIES.map((c) => ({ code: c.code, name: c.name })),
      requirementTypes: [...REQUIREMENT_TYPES],
      creditCountTo: [...CREDIT_COUNT_TO],
      studyStatuses: [...STUDY_STATUSES],
    };
  },
};

export type MetaEnums = ReturnType<typeof MetaService.enums>;
