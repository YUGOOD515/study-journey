interface Props {
  earned: number;
  required: number;
  color: string;
  trackColor?: string;
  /** 正在修读（中等不透明度段）。 */
  inProgress?: number;
  /** 计划修读（最浅段）。 */
  planned?: number;
  /** 轨道高度（px），默认 8。 */
  height?: number;
}

/**
 * 三段式学分进度条：已修（实色）→ 正在修读（半透明）→ 计划修读（更浅）。
 * 段宽按 required 归一并依次裁剪，累计不超过 100%。required<=0 时按已有学分铺满。
 */
export function ProgressBar({
  earned,
  required,
  color,
  trackColor,
  inProgress = 0,
  planned = 0,
  height = 8,
}: Props) {
  const denom = required > 0 ? required : Math.max(earned + inProgress + planned, 1);

  let acc = 0;
  const cut = (raw: number) => {
    const pct = (Math.max(0, raw) / denom) * 100;
    const left = acc;
    const width = Math.min(pct, Math.max(0, 100 - acc));
    acc += width;
    return { left, width };
  };
  const segEarned = cut(earned);
  const segInProgress = cut(inProgress);
  const segPlanned = cut(planned);

  const overflow = required > 0 && earned > required;

  const seg = (s: { left: number; width: number }, opacity: number, z: number) =>
    s.width > 0 ? (
      <div
        className="absolute inset-y-0 transition-all duration-700 ease-out"
        style={{ left: `${s.left}%`, width: `${s.width}%`, backgroundColor: color, opacity, zIndex: z }}
      />
    ) : null;

  return (
    <div
      className="relative rounded-full overflow-hidden"
      style={{ height, backgroundColor: trackColor ?? "rgb(var(--sub) / 0.13)" }}
    >
      {seg(segPlanned, 0.26, 1)}
      {seg(segInProgress, 0.55, 2)}
      {seg(segEarned, 1, 3)}
      {overflow && (
        <div
          className="absolute inset-y-0 right-0 w-1"
          style={{ backgroundColor: "rgb(var(--brand) / 1)", zIndex: 4 }}
          title="已超出培养方案要求"
        />
      )}
    </div>
  );
}
