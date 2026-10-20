import { cn } from "../../lib/cn";

/** 统一页面容器：所有页面共用同一宽度与左右边距 */
export function Page({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1440px] px-4 pb-24 sm:px-6 sm:pb-12", className)}>{children}</div>;
}

/**
 * 统一页头：左侧标题 + 元信息，右侧指标（与标题基线对齐），下方可选工具栏。
 * 高度、字号、分隔线在所有页面一致。
 */
export function PageHeader({
  title,
  meta,
  metrics,
  toolbar,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  metrics?: React.ReactNode;
  toolbar?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("border-b border-line pb-3 pt-6 sm:pt-8", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
          {meta && <div className="mt-1 text-xs text-sub">{meta}</div>}
        </div>
        {metrics && <dl className="flex shrink-0 items-end gap-6 sm:gap-8">{metrics}</dl>}
      </div>
      {toolbar && <div className="mt-4 flex flex-wrap items-center gap-2">{toolbar}</div>}
    </header>
  );
}

/** 页头指标：标签 11px 在上，数字等宽在下；右对齐 */
export function Metric({
  label,
  value,
  unit,
  className,
  align = "right",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0", align === "right" ? "text-left sm:text-right" : "text-left", className)}>
      <dt className="text-2xs text-sub">{label}</dt>
      <dd className="mt-0.5 whitespace-nowrap">
        <span className="num text-base font-medium text-ink">{value}</span>
        {unit && <span className="ml-1 text-2xs text-sub">{unit}</span>}
      </dd>
    </div>
  );
}

/** 区块标题：15/600 标题 + 右侧附加内容 */
export function SectionHeader({
  title,
  aside,
  description,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-2xs text-sub">{description}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2 text-2xs text-sub">{aside}</div>}
    </div>
  );
}

/** 细进度条：轨道 fill-strong，填充色由调用方指定 */
export function Bar({
  segments,
  className,
  label,
}: {
  segments: Array<{ value: number; color: string; pattern?: "solid" | "soft" }>;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex h-1.5 w-full overflow-hidden rounded-sm bg-fill-strong", className)}
    >
      {segments.map((s, i) =>
        s.value > 0 ? (
          <div
            key={i}
            className="h-full"
            style={{
              width: `${Math.min(100, s.value * 100)}%`,
              backgroundColor: s.color,
              opacity: s.pattern === "soft" ? 0.4 : 1,
            }}
          />
        ) : null,
      )}
    </div>
  );
}
