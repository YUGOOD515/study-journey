/**
 * D1 访问层。
 *
 * D1 是 SQLite，但只提供异步 API，且不支持交互式 BEGIN/COMMIT。
 * 需要原子性的多条写入用 `db.atomic(fn)`：fn 内的写语句先排队，fn 结束后用 `D1Database.batch()`
 * 一次性提交（同成功同失败）。注意：atomic 内的读取看不到同一批次里尚未提交的写入，
 * 所以“写完再读回”的逻辑要放在 atomic 之后。
 */

type Param = string | number | null | boolean | undefined;

function normalize(value: Param): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

export class Db {
  private queue: D1PreparedStatement[] | null = null;

  constructor(readonly d1: D1Database) {}

  prepare(sql: string, params: readonly Param[] = []): D1PreparedStatement {
    return this.d1.prepare(sql).bind(...params.map(normalize));
  }

  async all<T>(sql: string, params: readonly Param[] = []): Promise<T[]> {
    const result = await this.prepare(sql, params).all<T>();
    return result.results ?? [];
  }

  async first<T>(sql: string, params: readonly Param[] = []): Promise<T | null> {
    return (await this.prepare(sql, params).first<T>()) ?? null;
  }

  /** 执行写语句；在 atomic 内时只排队，返回 0。 */
  async run(sql: string, params: readonly Param[] = []): Promise<number> {
    const stmt = this.prepare(sql, params);
    if (this.queue) {
      this.queue.push(stmt);
      return 0;
    }
    const result = await stmt.run();
    return Number(result.meta?.changes ?? 0);
  }

  get inAtomic(): boolean {
    return this.queue !== null;
  }

  async atomic<T>(fn: () => Promise<T>): Promise<T> {
    if (this.queue) return fn(); // 嵌套：并入外层批次
    this.queue = [];
    try {
      const result = await fn();
      const statements = this.queue;
      this.queue = null;
      if (statements.length > 0) await this.d1.batch(statements);
      return result;
    } finally {
      this.queue = null;
    }
  }
}

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
