import sqlite from "node-sqlite3-wasm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Database } = sqlite;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../db/course_planner.sqlite");

export const db = new Database(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS personal_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type TEXT NOT NULL CHECK (item_type IN ('official', 'manual')),
    course_code TEXT,
    planned_term INTEGER NOT NULL CHECK (planned_term BETWEEN 1 AND 8),
    manual_course_name TEXT,
    manual_credits REAL CHECK (manual_credits IS NULL OR manual_credits >= 0),
    manual_category_code TEXT CHECK (
        manual_category_code IS NULL OR manual_category_code IN (
            'general_education',
            'major_platform',
            'professional_education',
            'quality_education',
            'practice_education'
        )
    ),
    manual_course_nature TEXT CHECK (
        manual_course_nature IS NULL OR manual_course_nature IN ('必修', '选修')
    ),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (
            item_type = 'official'
            AND course_code IS NOT NULL
            AND manual_course_name IS NULL
            AND manual_credits IS NULL
            AND manual_category_code IS NULL
            AND manual_course_nature IS NULL
        )
        OR
        (
            item_type = 'manual'
            AND course_code IS NULL
            AND manual_course_name IS NOT NULL
            AND manual_credits IS NOT NULL
            AND manual_category_code IS NOT NULL
            AND manual_course_nature IS NOT NULL
        )
    ),
    FOREIGN KEY (course_code)
        REFERENCES courses(course_code)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_personal_plan_official_course
    ON personal_plan(course_code)
    WHERE item_type = 'official' AND course_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_plan_term
    ON personal_plan(planned_term);

CREATE INDEX IF NOT EXISTS idx_personal_plan_manual_category
    ON personal_plan(manual_category_code);
`);

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
