/**
 * 数据库连接（v2）。
 *
 * 指向 db/course_planner_v2.sqlite。v2 schema 已定稿，详见
 *   migrations/v2_001_create_tables.sql
 *   db/README_database_v2.md
 *
 * Node 24 自带的 node:sqlite（原生 SQLite，experimental 但稳定），
 * API 与 better-sqlite3 一致；零依赖、零编译。
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 一次性屏蔽 node:sqlite 的 experimental warning（噪音太大）
process.removeAllListeners("warning");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../db/course_planner_v2.sqlite");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

// 进程退出前主动 close
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    try { db.close(); } catch {}
    process.exit(0);
  });
}

console.log(`[db] 已连接 SQLite v2: ${DB_PATH}`);

// ─────────────────────────────────────────────
// 常量：板块编码 ↔ 中文名（与 v2 CHECK 约束保持一致）
// ─────────────────────────────────────────────
export const CATEGORY_CODES = [
  "general_education",
  "major_platform",
  "professional_education",
  "quality_education",
  "practice_education",
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];

export const CATEGORY_NAMES: Record<CategoryCode, string> = {
  general_education: "通识教育",
  major_platform: "大类平台",
  professional_education: "专业教育",
  quality_education: "素质教育",
  practice_education: "实践教育",
};

export const REQUIREMENT_TYPES = ["必修", "选修", "跨专业", "经法管融通"] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const STUDY_STATUSES = [
  "未修读",
  "计划修读",
  "正在修读",
  "已修读",
  "未通过",
] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const CREDIT_COUNT_TO_VALUES = [
  "通识教育-选修",
  "大类平台-选修",
] as const;
export type CreditCountTo = (typeof CREDIT_COUNT_TO_VALUES)[number];
