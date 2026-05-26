/**
 * 用法：npx tsx server/apply-migration.ts <migration-file-relative-to-project-root>
 * 例：  npx tsx server/apply-migration.ts migrations/001_add_index.sql
 *
 * 默认应用到项目同级 db 目录中的 v2 数据库：../db/course_planner_v2.sqlite
 * 也可以通过 DB_PATH 覆盖。
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.removeAllListeners("warning");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.DB_PATH?.trim()
  ? path.resolve(process.cwd(), process.env.DB_PATH.trim())
  : path.resolve(PROJECT_ROOT, "../db/course_planner_v2.sqlite");

const rel = process.argv[2];
if (!rel) {
  console.error("Usage: tsx server/apply-migration.ts <sql-file>");
  process.exit(1);
}

const sqlPath = path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
if (!fs.existsSync(sqlPath)) {
  console.error(`SQL 文件不存在: ${sqlPath}`);
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.error(`数据库文件不存在: ${DB_PATH}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
console.log(`[migrate] DB:  ${DB_PATH}`);
console.log(`[migrate] SQL: ${sqlPath}`);

const db = new DatabaseSync(DB_PATH);
try {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(sql);
  console.log("[migrate] 应用成功");
} catch (e) {
  console.error("[migrate] 失败:", e);
  process.exit(1);
} finally {
  db.close();
}
