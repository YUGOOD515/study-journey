import type { Db } from "./db";

/**
 * 每个已登录请求的上下文。所有 repository / service 都显式接收它，
 * 用户数据查询必须带上 ctx.userId，避免跨用户读写。
 */
export interface Ctx {
  db: Db;
  userId: string;
  /** 入学年份：第 1 学期 = enrollmentYear 年秋季学期。 */
  enrollmentYear: number;
}
