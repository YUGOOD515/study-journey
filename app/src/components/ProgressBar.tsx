interface Props {
  earned: number;
  required: number;
  color: string;
  trackColor?: string;
  inProgress?: number;
  planned?: number;
  height?: number;
}

/** 预计（在修 + 计划）段的透明度：只区分「已拿到」和「在路上」两档，示意即可。 */
export const PREVIEW_OPACITY = 0.3;

/** 两段式胶囊进度条：已修（实色）→ 在修与计划（浅色）。累计不超过 100%。 */
export function ProgressBar({ earned, required, color, trackColor, inProgress = 0, planned = 0, height = 8 }: Props) {
  const denom = required > 0 ? required : Math.max(earned + inProgress + planned, 1);
  const done = Math.min(100, (Math.max(0, earned) / denom) * 100);
  const preview = Math.min(100 - done, (Math.max(0, inProgress + planned) / denom) * 100);

  return (
    <div
      className="relative w-full overflow-hidden rounded-full"
      style={{ height, backgroundColor: trackColor ?? "rgb(var(--fill-strong))" }}
    >
      {preview > 0 && (
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${done + preview}%`, backgroundColor: color, opacity: PREVIEW_OPACITY }}
        />
      )}
      {done > 0 && (
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${done}%`, backgroundColor: color }} />
      )}
    </div>
  );
}

/** 图例色点：0 = 已修（实色），1 = 在修与计划（浅色），3 = 未安排（底槽色） */
export function ProgressLegendSwatch({ level, color = "rgb(var(--brand))" }: { level: 0 | 1 | 3; color?: string }) {
  if (level === 3) return <span className="inline-block h-2 w-2 rounded-full bg-fill-strong" aria-hidden />;
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color, opacity: level === 0 ? 1 : PREVIEW_OPACITY }}
      aria-hidden
    />
  );
}
