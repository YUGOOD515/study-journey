import type { Request, Response, NextFunction } from "express";
import { BusinessError, ErrorCode } from "./errors";

export interface ApiOk<T> {
  ok: true;
  data: T;
  meta?: { total?: number; [k: string]: unknown };
}

export interface ApiErr {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function ok<T>(res: Response, data: T, meta?: ApiOk<T>["meta"], status = 200) {
  const body: ApiOk<T> = meta !== undefined ? { ok: true, data, meta } : { ok: true, data };
  res.status(status).json(body);
}

export function created<T>(res: Response, data: T) {
  ok(res, data, undefined, 201);
}

/** 包装 async controller，把 BusinessError / 普通 Error 都转成统一错误体。 */
export function handle<TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => unknown | Promise<unknown>
) {
  return async (req: TReq, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (e) {
      next(e);
    }
  };
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof BusinessError) {
    const body: ApiErr = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.httpStatus).json(body);
    return;
  }
  // 兜底
  const message = err instanceof Error ? err.message : String(err);
  console.error("[api] unhandled error:", err);
  const body: ApiErr = {
    ok: false,
    error: { code: ErrorCode.INTERNAL_ERROR, message },
  };
  res.status(500).json(body);
}
