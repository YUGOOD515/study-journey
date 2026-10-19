/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "SF Mono",
          "SFMono-Regular",
          "PingFang SC",
          "Microsoft YaHei",
          "Noto Sans SC",
          "Noto Sans CJK SC",
          "ui-monospace",
          "monospace",
        ],
      },
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        sub: "rgb(var(--sub) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        line: "rgb(var(--hairline) / <alpha-value>)",
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow-rgb) / var(--shadow-soft))",
        pop: "0 14px 36px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 2px 8px rgb(var(--shadow-rgb) / var(--shadow-soft))",
        dock: "0 16px 40px rgb(var(--shadow-rgb) / var(--shadow-soft))",
      },
      zIndex: {
        nav: "30",
        dock: "40",
        overlay: "50",
        popover: "60",
        toast: "70",
      },
      screens: {
        coarse: { raw: "(hover: none) and (pointer: coarse)" },
      },
    },
  },
  plugins: [],
};
