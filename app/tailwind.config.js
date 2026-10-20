/**
 * 学旅设计系统（docs/05-frontend-design.md）
 * - 字号：6 档（11 / 12 / 13 / 15 / 20 / 28），默认 UI 12px；不使用 Tailwind 默认字号
 * - 圆角：8 / 10 / 16 / 20 + 胶囊（sm 小控件、DEFAULT 按钮/输入/课程卡、md 面板/弹层、lg 大卡片、full 标签）
 * - 间距：Tailwind 默认 4px 栅格
 * - 颜色：全部来自 CSS 变量，深浅色自动切换
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    fontFamily: {
      sans: [
        "-apple-system",
        "BlinkMacSystemFont",
        '"Segoe UI"',
        '"PingFang SC"',
        '"Hiragino Sans GB"',
        '"Microsoft YaHei"',
        '"Noto Sans SC"',
        "sans-serif",
      ],
      mono: ["ui-monospace", '"SF Mono"', '"JetBrains Mono"', "Menlo", "Consolas", "monospace"],
    },
    fontSize: {
      "2xs": ["11px", { lineHeight: "16px" }], // 元信息、说明
      xs: ["12px", { lineHeight: "18px" }], // UI 默认
      sm: ["13px", { lineHeight: "20px" }], // 正文
      base: ["15px", { lineHeight: "22px" }], // 区块标题
      lg: ["20px", { lineHeight: "28px" }], // 页面标题
      xl: ["28px", { lineHeight: "32px" }], // 展示数字
    },
    fontWeight: { normal: "400", medium: "500", semibold: "600" },
    borderRadius: {
      none: "0",
      sm: "8px",
      DEFAULT: "10px",
      md: "16px",
      lg: "20px",
      full: "9999px",
    },
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        sub: "rgb(var(--sub) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong) / <alpha-value>)",
        fill: "rgb(var(--fill) / <alpha-value>)",
        "fill-strong": "rgb(var(--fill-strong) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
      },
      boxShadow: {
        pop: "var(--shadow-pop)",
      },
      zIndex: { nav: "30", dock: "40", overlay: "50", popover: "60", toast: "70" },
      screens: { coarse: { raw: "(hover: none) and (pointer: coarse)" } },
    },
  },
  plugins: [],
};
