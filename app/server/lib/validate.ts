import { fail } from "./errors";

/**
 * 校验工具，全部抛 BusinessError(VALIDATION_FAILED)。
 * 字段名带进消息体，便于前端定位。
 */

export function expectString(value: unknown, field: string, opts?: { allowNull?: boolean; trim?: boolean }): string | null {
  if (value === null || value === undefined) {
    if (opts?.allowNull) return null;
    throw fail.validation(`${field} 必填`, { [field]: "必填" });
  }
  if (typeof value !== "string") {
    throw fail.validation(`${field} 必须为字符串`, { [field]: "必须为字符串" });
  }
  const v = opts?.trim === false ? value : value.trim();
  if (!v) {
    throw fail.validation(`${field} 不能为空`, { [field]: "不能为空" });
  }
  return v;
}

export function expectNumber(value: unknown, field: string, opts?: { min?: number; max?: number; integer?: boolean; allowNull?: boolean }): number | null {
  if (value === null || value === undefined) {
    if (opts?.allowNull) return null;
    throw fail.validation(`${field} 必填`, { [field]: "必填" });
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw fail.validation(`${field} 必须为数字`, { [field]: "必须为数字" });
  }
  if (opts?.integer && !Number.isInteger(value)) {
    throw fail.validation(`${field} 必须为整数`, { [field]: "必须为整数" });
  }
  if (opts?.min !== undefined && value < opts.min) {
    throw fail.validation(`${field} 必须 >= ${opts.min}`, { [field]: `必须 >= ${opts.min}` });
  }
  if (opts?.max !== undefined && value > opts.max) {
    throw fail.validation(`${field} 必须 <= ${opts.max}`, { [field]: `必须 <= ${opts.max}` });
  }
  return value;
}

export function expectEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  opts?: { allowNull?: boolean }
): T | null {
  if (value === null || value === undefined) {
    if (opts?.allowNull) return null;
    throw fail.validation(`${field} 必填`, { [field]: "必填" });
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw fail.validation(`${field} 必须是 ${allowed.join(" / ")} 之一`, { [field]: "枚举值不合法" });
  }
  return value as T;
}

export function expectBoolean(value: unknown, field: string, opts?: { allowNull?: boolean }): boolean | null {
  if (value === null || value === undefined) {
    if (opts?.allowNull) return null;
    throw fail.validation(`${field} 必填`, { [field]: "必填" });
  }
  if (typeof value !== "boolean") {
    throw fail.validation(`${field} 必须为 boolean`, { [field]: "必须为 boolean" });
  }
  return value;
}

export function expectArray<T>(value: unknown, field: string, opts?: { min?: number; max?: number }): T[] {
  if (!Array.isArray(value)) {
    throw fail.validation(`${field} 必须为数组`, { [field]: "必须为数组" });
  }
  if (opts?.min !== undefined && value.length < opts.min) {
    throw fail.validation(`${field} 至少 ${opts.min} 项`, { [field]: `至少 ${opts.min} 项` });
  }
  if (opts?.max !== undefined && value.length > opts.max) {
    throw fail.validation(`${field} 最多 ${opts.max} 项`, { [field]: `最多 ${opts.max} 项` });
  }
  return value as T[];
}
