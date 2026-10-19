import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** 小于 640px：手机布局。 */
export const useIsMobile = () => useMediaQuery("(max-width: 639px)");
/** 触屏为主（没有悬停能力）。 */
export const useCoarsePointer = () => useMediaQuery("(hover: none) and (pointer: coarse)");
