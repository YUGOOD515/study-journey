/**
 * SQLite 连接层。
 *
 * 默认读取项目同级 db 目录中的 v2 数据库：../db/course_planner_v2.sqlite
 * 也可以通过环境变量覆盖：DB_PATH=/absolute/or/relative/path.sqlite npm run dev
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 屏蔽 node:sqlite 的 experimental warning，避免开发终端刷屏。
process.removeAllListeners("warning");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath(): string {
  if (process.env.DB_PATH?.trim()) {
    return path.resolve(process.cwd(), process.env.DB_PATH.trim());
  }

  const candidates = [
    // 用户当前本地结构：app/ 与 db/ 同级，npm run dev 在 app 根目录执行。
    path.resolve(process.cwd(), "../db/course_planner_v2.sqlite"),
    // 兼容从 server/ 文件位置推导的同级结构。
    path.resolve(__dirname, "../../db/course_planner_v2.sqlite"),
    // 兼容把 db/ 放进 app/ 内部的结构。
    path.resolve(process.cwd(), "db/course_planner_v2.sqlite"),
    path.resolve(__dirname, "../db/course_planner_v2.sqlite"),
  ];

  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

export const DB_PATH = resolveDbPath();

if (!fs.existsSync(DB_PATH)) {
  throw new Error(
    `[db] 未找到数据库文件：${DB_PATH}\n` +
      "请确认 course_planner_v2.sqlite 位于 ../db/，或使用 DB_PATH 环境变量指定路径。"
  );
}

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

const REQUIRED_TABLES = [
  "plan_program_courses",
  "plan_custom_courses",
  "plan_program_requirements",
  "raw_import_batches",
  "raw_term_course_sections",
  "raw_term_added_courses",
];

const existingTables = new Set(
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row: any) => String(row.name))
);

const missingTables = REQUIRED_TABLES.filter((name) => !existingTables.has(name));
if (missingTables.length > 0) {
  throw new Error(
    `[db] 数据库不是 v2 结构，缺少表：${missingTables.join(", ")}\n` +
      `当前数据库：${DB_PATH}`
  );
}

function tableColumns(tableName: string): Set<string> {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((row: any) => String(row.name))
  );
}

function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const columns = tableColumns(tableName);
  if (!columns.has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition};`);
  }
}

function ensureTrashColumns() {
  for (const table of ["plan_program_courses", "plan_custom_courses"] as const) {
    addColumnIfMissing(table, "is_deleted", "is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1))");
    addColumnIfMissing(table, "deleted_at", "deleted_at TEXT");
    addColumnIfMissing(table, "deleted_note", "deleted_note TEXT");
  }
  addColumnIfMissing(
    "plan_program_courses",
    "is_permanently_deleted",
    "is_permanently_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_permanently_deleted IN (0, 1))"
  );

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_plan_program_courses_trash
      ON plan_program_courses(is_deleted, is_permanently_deleted, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_plan_custom_courses_trash
      ON plan_custom_courses(is_deleted, deleted_at);
  `);
}

ensureTrashColumns();

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    try {
      db.close();
    } catch {
      // ignore
    }
    process.exit(0);
  });
}

console.log(`[db] 已连接 SQLite v2: ${DB_PATH}`);

export const CATEGORIES = [
  { code: "general_education", name: "通识教育" },
  { code: "major_platform", name: "大类平台" },
  { code: "professional_education", name: "专业教育" },
  { code: "quality_education", name: "素质教育" },
  { code: "practice_education", name: "实践教育" },
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]["code"];

export const CATEGORY_NAME_BY_CODE = Object.fromEntries(
  CATEGORIES.map((c) => [c.code, c.name])
) as Record<CategoryCode, string>;
