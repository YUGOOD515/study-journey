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
      },
    },
  },
  plugins: [],
};
