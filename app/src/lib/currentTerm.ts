/**
 * 根据入学年份和日期推算“当前学期”（1–8）。
 * 秋季学期：8 月–次年 1 月；春季学期：2–7 月。超出范围时夹到 1–8。
 */
export function currentTermNumber(enrollmentYear: number, now = new Date()): number {
  const month = now.getMonth() + 1;
  const academicStart = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const isFall = month >= 8 || month <= 1;
  const term = (academicStart - enrollmentYear) * 2 + (isFall ? 1 : 2);
  return Math.min(8, Math.max(1, term));
}
