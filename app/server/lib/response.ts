import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { BusinessError, ErrorCode } from "./errors";

export interface ApiOk<T> {
  ok: true;
  data: T;
  meta?: { total?: number; [k: string]: unknown };
}

export interface ApiErr {
  ok: false;
  error: {
    code: ErrorCode | "UNAUTHORIZED" | "FORBIDDEN";
    message: string;
    details?: Record<string, unknown>;
  };
}

export function ok<T>(c: Context, data: T, meta?: ApiOk<T>["meta"], status: ContentfulStatusCode = 200) {
  const body: ApiOk<T> = meta !== undefined ? { ok: true, data, meta } : { ok: true, data };
  return c.json(body, status);
}

export function created<T>(c: Context, data: T) {
  return ok(c, data, undefined, 201);
}

export function errorBody(code: ApiErr["error"]["code"], message: string, details?: Record<string, unknown>): ApiErr {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

/** app.onError：BusinessError → 业务错误体；其他异常 → 500，不向客户端泄露内部信息。 */
export function handleError(err: unknown, c: Context) {
  if (err instanceof BusinessError) {
    return c.json(errorBody(err.code, err.message, err.details), err.httpStatus as ContentfulStatusCode);
  }
  console.error("[api] unhandled error:", err);
  return c.json(errorBody(ErrorCode.INTERNAL_ERROR, "服务器内部错误，请稍后再试"), 500);
}

/** 读取 JSON 请求体；空体或非 JSON 时返回 {}。 */
export async function readJson(c: Context): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new BusinessError(ErrorCode.VALIDATION_FAILED, "请求体不是合法 JSON");
  }
}

export function queryObject(c: Context): Record<string, unknown> {
  return c.req.query() as Record<string, unknown>;
}
