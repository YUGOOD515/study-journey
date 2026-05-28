/**
 * 统一业务错误模型。
 *
 * Controller 不要 throw 原始 Error；Service 抛 BusinessError 由路由层翻成响应。
 * 普通 Error 落到 errorMiddleware 时会被记成 INTERNAL_ERROR。
 */

export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PRECONDITION_FAILED: "PRECONDITION_FAILED",
  IMMUTABLE_FIELD: "IMMUTABLE_FIELD",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const HTTP_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 422,
  IMMUTABLE_FIELD: 422,
  INTERNAL_ERROR: 500,
};

export class BusinessError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BusinessError";
    this.code = code;
    this.httpStatus = HTTP_BY_CODE[code];
    this.details = details;
  }
}

export const fail = {
  validation: (message: string, fields?: Record<string, string>) =>
    new BusinessError(ErrorCode.VALIDATION_FAILED, message, fields ? { fields } : undefined),
  notFound: (resource: string, key: string) =>
    new BusinessError(ErrorCode.NOT_FOUND, `${resource} 不存在: ${key}`),
  conflict: (message: string, details?: Record<string, unknown>) =>
    new BusinessError(ErrorCode.CONFLICT, message, details),
  precondition: (message: string, details?: Record<string, unknown>) =>
    new BusinessError(ErrorCode.PRECONDITION_FAILED, message, details),
  immutable: (field: string) =>
    new BusinessError(ErrorCode.IMMUTABLE_FIELD, `字段 ${field} 不允许修改`, { field }),
};
