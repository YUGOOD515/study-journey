interface Props {
  earned: number;
  required: number;
  color: string;
  trackColor?: string;
  inProgress?: number;
  planned?: number;
  height?: number;
}

/** 三段式学分进度条：已修（实色）→ 在修（50%）→ 计划（25%）。累计不超过 100%。 */
export function ProgressBar({ earned, required, color, trackColor, inProgress = 0, planned = 0, height = 6 }: Props) {
  const denom = required > 0 ? required : Math.max(earned + inProgress + planned, 1);
  let acc = 0;
  const cut = (raw: number) => {
    const pct = (Math.max(0, raw) / denom) * 100;
    const width = Math.min(pct, Math.max(0, 100 - acc));
    acc += width;
    return width;
  };
  const segs = [
    { w: cut(earned), o: 1 },
    { w: cut(inProgress), o: 0.5 },
    { w: cut(planned), o: 0.25 },
  ];
  const overflow = required > 0 && earned > required;

  return (
    <div
      className="relative flex w-full overflow-hidden rounded-sm"
      style={{ height, backgroundColor: trackColor ?? "rgb(var(--fill-strong))" }}
    >
      {segs.map((s, i) =>
        s.w > 0 ? <div key={i} className="h-full" style={{ width: `${s.w}%`, backgroundColor: color, opacity: s.o }} /> : null,
      )}
      {overflow && (
        <div className="absolute inset-y-0 right-0 w-0.5 bg-warn" title="已超出培养方案要求" />
      )}
    </div>
  );
}

/** 进度条图例：已修 / 在修 / 计划 / 待修 */
export function ProgressLegendSwatch({ level, color = "rgb(var(--ink))" }: { level: 0 | 1 | 2 | 3; color?: string }) {
  if (level === 3) return <span className="inline-block h-2 w-2 rounded-sm bg-fill-strong" aria-hidden />;
  return (
    <span
      className="inline-block h-2 w-2 rounded-sm"
      style={{ backgroundColor: color, opacity: [1, 0.5, 0.25][level] }}
      aria-hidden
    />
  );
}
