/**
 * 解析 offered_term 字段。
 * 可能取值：
 *   "1"     → 仅第 1 学期
 *   "5-7"   → 第 5、6、7 学期可开
 *   "1-8"   → 全部学期都可开
 *   "A"     → 任意学期（Anytime）
 *   null    → 学校未指定开课学期
 *
 * primary 用于决定课程卡片默认放到哪个学期格子里：
 *   - 单学期 → 该学期
 *   - 范围   → 范围起点
 *   - A/null → null（放进侧栏"灵活"区）
 */
export interface ParsedTerm {
  raw: string | null;
  primary: number | null;       // 放到哪个学期；null 表示灵活
  rangeEnd: number | null;      // 若是范围（5-7），rangeEnd = 7
  isFlexible: boolean;          // A 或 null
}

export function parseOfferedTerm(raw: string | null): ParsedTerm {
  if (raw === null || raw === undefined || raw === "") {
    return { raw, primary: null, rangeEnd: null, isFlexible: true };
  }
  const s = String(raw).trim();
  if (s.toUpperCase() === "A") {
    return { raw, primary: null, rangeEnd: null, isFlexible: true };
  }
  const single = /^(\d+)$/.exec(s);
  if (single) {
    const n = parseInt(single[1], 10);
    return { raw, primary: n, rangeEnd: null, isFlexible: false };
  }
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(s);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    // 全学期（1-8）也归到"灵活"
    if (a === 1 && b === 8) {
      return { raw, primary: null, rangeEnd: null, isFlexible: true };
    }
    return { raw, primary: a, rangeEnd: b, isFlexible: false };
  }
  // 兜底：解析不出来当作灵活
  return { raw, primary: null, rangeEnd: null, isFlexible: true };
}

export const TERM_LABEL: Record<number, string> = {
  1: "大一上",
  2: "大一下",
  3: "大二上",
  4: "大二下",
  5: "大三上",
  6: "大三下",
  7: "大四上",
  8: "大四下",
};
