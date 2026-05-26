import type { ThemeMode } from "../hooks/useTheme";
import { useTheme } from "../hooks/useTheme";

export function ThemeToggle() {
  const { mode, cycle } = useTheme();
  return (
    <button
      onClick={cycle}
      title={`主题：${labelOf(mode)}（点击切换）`}
      className="w-7 h-7 flex items-center justify-center rounded-md text-sub hover:text-ink hover:bg-sub/10 transition-colors"
    >
      {iconOf(mode)}
    </button>
  );
}

function labelOf(mode: ThemeMode) {
  return mode === "system" ? "跟随系统" : mode === "light" ? "浅色" : "深色";
}

function iconOf(mode: ThemeMode) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (mode === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  // system
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}
