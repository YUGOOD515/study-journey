interface Props {
  earned: number;
  required: number;
  color: string;
  trackColor?: string;
}

export function ProgressBar({ earned, required, color, trackColor }: Props) {
  const pct =
    required <= 0
      ? earned > 0
        ? 100
        : 0
      : Math.min(100, (earned / required) * 100);
  const overflow = required > 0 && earned > required;

  return (
    <div
      className="relative h-2 rounded-full overflow-hidden"
      style={{
        backgroundColor: trackColor ?? "rgb(var(--sub) / 0.15)",
      }}
    >
      <div
        className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
        style={{
          width: `${pct}%`,
          backgroundColor: color,
        }}
      />
      {overflow && (
        <div
          className="absolute inset-y-0 right-0 w-1"
          style={{ backgroundColor: "#d97757" }}
          title="已超出培养方案要求"
        />
      )}
    </div>
  );
}
