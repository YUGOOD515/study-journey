import { db } from "../db";

/**
 * 简单事务包装。node:sqlite DatabaseSync 是同步的，所以这里 callback 也是同步。
 * 嵌套通过深度计数实现：内层不发额外 BEGIN/COMMIT；只在最外层提交或回滚。
 *
 * 抛出 BusinessError 与普通 Error 都会触发回滚。
 */

let depth = 0;

export function unitOfWork<T>(fn: () => T): T {
  if (depth === 0) {
    db.exec("BEGIN");
  }
  depth += 1;
  try {
    const result = fn();
    depth -= 1;
    if (depth === 0) db.exec("COMMIT");
    return result;
  } catch (e) {
    depth -= 1;
    if (depth === 0) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // 已经无事务可回滚，忽略
      }
    }
    throw e;
  }
}
