import { PREVIEW_OPACITY } from "./ProgressBar";

interface Props {
  earned: number;
  /** 在修 + 计划 */
  preview?: number;
  required: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * 圆环进度（示意用，不追求精确）：已修 = 实色弧，在修与计划 = 同色浅弧，其余为底槽。
 * 从 12 点方向顺时针，圆头线帽；children 放在圆心。
 */
export function ProgressRing({
  earned,
  preview = 0,
  required,
  color,
  size = 96,
  stroke,
  children,
  className,
}: Props) {
  const sw = stroke ?? Math.max(4, Math.round(size / 10));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const denom = required > 0 ? required : Math.max(earned + preview, 1);
  const done = Math.min(1, Math.max(0, earned) / denom);
  const ahead = Math.min(1 - done, Math.max(0, preview) / denom);
  const arc = (frac: number) => `${Math.max(0, frac * c)} ${c}`;

  return (
    <div className={className} style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--fill-strong))"
          strokeWidth={sw}
        />
        {done + ahead > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeOpacity={PREVIEW_OPACITY}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={arc(done + ahead)}
          />
        )}
        {done > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={arc(done)}
          />
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  );
}
