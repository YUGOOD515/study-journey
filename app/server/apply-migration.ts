/**
 * 用法：npx tsx server/apply-migration.ts <migration-file-relative-to-project-root>
 * 例：  npx tsx server/apply-migration.ts migrations/009_create_manual_courses.sql
 *
 * 用 node:sqlite 把单个 SQL 迁移应用到 db/course_planner.sqlite。
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.removeAllListeners("warning");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DB_PATH = path.join(PROJECT_ROOT, "db", "course_planner_v2.sqlite");

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

const sql = fs.readFileSync(sqlPath, "utf8");
console.log(`[migrate] DB:  ${DB_PATH}`);
console.log(`[migrate] SQL: ${sqlPath}`);

const db = new DatabaseSync(DB_PATH);
try {
  db.exec(sql);
  console.log("[migrate] ✅ 应用成功");
} catch (e) {
  console.error("[migrate] ❌ 失败:", e);
  process.exit(1);
} finally {
  db.close();
}
