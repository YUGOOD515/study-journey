import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "study-journey-theme";

function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode: ThemeMode) {
  const effective = mode === "system" ? (getSystemPrefersDark() ? "dark" : "light") : mode;
  const root = document.documentElement;
  if (effective === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredMode());

  useEffect(() => {
    applyTheme(mode);
    window.localStorage.setItem(KEY, mode);
  }, [mode]);

  // 当用户选 "system" 时，监听系统主题变化
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const cycle = () => {
    setMode((m) => (m === "system" ? "light" : m === "light" ? "dark" : "system"));
  };

  return { mode, setMode, cycle };
}
