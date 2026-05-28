import { randomUUID } from "node:crypto";
import { db } from "../db";

/**
 * 生成自定义课程的 course_code，形如 CUSTOM-YYYYMMDD-XXXXXX-XXX。
 * 与现有 buildCustomCode 行为一致，集中到 lib 后供仓储调用。
 */
export function buildCustomCourseCode(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const stmt = db.prepare("SELECT 1 FROM plan_custom_courses WHERE course_code = ?");
  for (let i = 0; i < 20; i += 1) {
    const code =
      `CUSTOM-${y}${m}${d}-` +
      `${String(Date.now() % 1_000_000).padStart(6, "0")}-` +
      `${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
    if (!stmt.get(code)) return code;
  }
  return `CUSTOM-${randomUUID()}`;
}
