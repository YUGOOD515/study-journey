import { Monitor, Moon, Sun } from "../lib/icons";
import { useTheme, type ThemeMode } from "../hooks/useTheme";
import { IconButton } from "./ui";

const LABEL: Record<ThemeMode, string> = { system: "跟随系统", light: "浅色", dark: "深色" };

export function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <IconButton label={`主题：${LABEL[mode]}（点击切换）`} onClick={cycle}>
      <Icon />
    </IconButton>
  );
}
