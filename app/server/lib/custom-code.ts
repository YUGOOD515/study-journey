/**
 * 生成自定义课程的 course_code，形如 CUSTOM-YYYYMMDD-XXXXXX-XXX。
 * 唯一性由调用方在当前用户范围内检查。
 */
export function buildCustomCourseCode(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  return (
    `CUSTOM-${y}${m}${d}-` +
    `${String(Date.now() % 1_000_000).padStart(6, "0")}-` +
    `${String(rand).padStart(3, "0")}`
  );
}
