import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs", "xs", "sm", "base", "lg", "xl"] }],
      "text-color": [{ text: ["faint", "danger", "ink", "sub", "brand", "warn", "bg", "card"] }],
      z: [{ z: ["nav", "dock", "overlay", "popover", "toast"] }],
      shadow: [{ shadow: ["pop"] }],
    },
  },
});

/** 拼接 className，并合并冲突的 Tailwind 类（后者优先）。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
