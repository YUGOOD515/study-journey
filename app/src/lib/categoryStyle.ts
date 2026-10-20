import type { CategoryCode } from "../types";

/**
 * 每个类别的样式都基于 CSS 变量（在 index.css 的 :root / html.dark 里定义两套），
 * 所以这里返回的字符串在浏览器里会随主题自动切换，无需在组件里判断深浅色。
 */
export interface CategoryStyle {
  name: string;
  color: string;     // 主色（色点 / 边框基底 / 进度条）
  bgSoft: string;    // 必修课片底色
  bgGhost: string;   // 选修课片底色
  border: string;    // 必修卡片描边
  borderGhost: string; // 选修卡片描边（更浅）
  text: string;      // 课程名文字色（与 color 同色相，但深浅经过单独调过）
}

function make(varBase: string, varText: string, name: string): CategoryStyle {
  return {
    name,
    color: `rgb(var(${varBase}) / 1)`,
    bgSoft: `rgb(var(${varBase}) / var(--cat-bg-soft))`,
    bgGhost: `rgb(var(${varBase}) / var(--cat-bg-ghost))`,
    border: `rgb(var(${varBase}) / var(--cat-border))`,
    borderGhost: `rgb(var(${varBase}) / var(--cat-border-ghost))`,
    text: `rgb(var(${varText}) / 1)`,
  };
}

export const CATEGORY_STYLE: Record<CategoryCode, CategoryStyle> = {
  general_education:      make("--cat-ge", "--cat-ge-text", "通识教育"),
  major_platform:         make("--cat-mp", "--cat-mp-text", "大类平台"),
  professional_education: make("--cat-pe", "--cat-pe-text", "专业教育"),
  quality_education:      make("--cat-qe", "--cat-qe-text", "素质教育"),
  practice_education:     make("--cat-pr", "--cat-pr-text", "实践教育"),
};

/**
 * 课程块统一表面（时间轴卡片、课表色块共用）：
 * 必修 = 类别浅底 + 类别描边；选修 = 更浅底 + 更浅描边。四边等宽 1px，不加左侧强调条。
 */
export function categorySurface(code: CategoryCode, isRequired: boolean): { backgroundColor: string; boxShadow: string } {
  const style = CATEGORY_STYLE[code] ?? CATEGORY_STYLE.general_education;
  return {
    backgroundColor: isRequired ? style.bgSoft : style.bgGhost,
    boxShadow: `inset 0 0 0 1px ${isRequired ? style.border : style.borderGhost}`,
  };
}
