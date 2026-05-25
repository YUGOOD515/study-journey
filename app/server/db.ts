import sqlite from "node-sqlite3-wasm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Database } = sqlite;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../db/course_planner.sqlite");

export const db = new Database(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

console.log(`[db] 已连接 SQLite: ${DB_PATH}`);

export const CATEGORY_TABLES = {
  general_education: {
    table: "general_education_courses",
    name: "通识教育",
    extra: "course_category",
  },
  major_platform: {
    table: "major_platform_courses",
    name: "大类平台",
    extra: null,
  },
  professional_education: {
    table: "professional_direction_courses",
    name: "专业教育",
    extra: "preference_level",
  },
  quality_education: {
    table: "quality_education_courses",
    name: "素质教育",
    extra: null,
  },
  practice_education: {
    table: "practice_education_courses",
    name: "实践教育",
    extra: null,
  },
} as const;

export type CategoryCode = keyof typeof CATEGORY_TABLES;
