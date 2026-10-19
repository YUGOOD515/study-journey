import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sub/10", className)} aria-hidden />;
}

/** 面板卡片 */
export function Panel({
  className,
  children,
  as: As = "section",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <As className={cn("rounded-xl border border-sub/15 bg-card shadow-card", className)} {...rest}>
      {children}
    </As>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-8 text-center",
        className,
      )}
    >
      {icon && <div className="text-faint">{icon}</div>}
      <div className="text-xs text-ink">{title}</div>
      {description && (
        <div className="max-w-[320px] text-[11px] leading-relaxed text-sub">{description}</div>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand" | "danger" | "outline";
  className?: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    neutral: "bg-sub/10 text-sub",
    brand: "bg-brand/10 text-brand",
    danger: "bg-danger/10 text-danger",
    outline: "border border-sub/20 text-sub",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[10px]",
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 统计数字（页面右上角） */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 text-right", className)}>
      <div className="truncate text-[10px] text-sub">{label}</div>
      <div className="num mt-0.5 text-base leading-tight text-ink sm:text-lg">{value}</div>
    </div>
  );
}

/** 页面级错误 */
export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-xs text-danger">加载失败</div>
      <div className="max-w-md text-[11px] text-sub">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md border border-sub/20 px-3 py-1 text-xs text-ink hover:border-sub/40"
        >
          重试
        </button>
      )}
    </div>
  );
}
