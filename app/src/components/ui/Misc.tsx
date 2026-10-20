import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-fill", className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink", className)}
      aria-label="加载中"
    />
  );
}

/** 面板：1px 实色描边 + 6px 圆角，不加阴影 */
export function Panel({
  className,
  children,
  as: As = "section",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <As className={cn("rounded-md border border-line bg-card", className)} {...rest}>
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
    <div className={cn("flex flex-col items-center justify-center px-4 py-8 text-center", className)}>
      {icon && <div className="mb-2 text-faint [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <div className="text-xs font-medium text-ink">{title}</div>
      {description && <div className="mt-1 max-w-[320px] text-2xs text-sub">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export type BadgeTone = "neutral" | "brand" | "danger" | "warn" | "outline" | "solid";

export function Badge({
  tone = "neutral",
  className,
  children,
  title,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const toneClass = {
    neutral: "bg-fill-strong text-sub",
    brand: "bg-brand/10 text-brand",
    danger: "bg-danger/10 text-danger",
    warn: "bg-warn/10 text-warn",
    outline: "border border-line-strong text-sub",
    solid: "bg-brand text-white",
  }[tone];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-2xs leading-none [&_svg]:h-3 [&_svg]:w-3",
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <div className="text-sm font-medium text-danger">加载失败</div>
      <div className="mt-1 max-w-md text-2xs text-sub">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 h-8 rounded border border-line-strong bg-card px-3 text-xs font-medium hover:bg-fill"
        >
          重试
        </button>
      )}
    </div>
  );
}

/** 键值对一行：左标签、右数值（右对齐、等宽） */
export function KeyValue({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-xs", className)}>
      <span className="shrink-0 text-sub">{label}</span>
      <span className="min-w-0 truncate text-right text-ink">{value}</span>
    </div>
  );
}
