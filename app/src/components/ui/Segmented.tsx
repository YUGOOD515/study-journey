import { cn } from "../../lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}

/** 分段切换（单选按钮组） */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "sm",
  className,
  ariaLabel,
  block,
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  size?: "xs" | "sm" | "md";
  className?: string;
  ariaLabel?: string;
  block?: boolean;
}) {
  const h = size === "xs" ? "h-6 text-[11px]" : size === "sm" ? "h-7 text-[11px]" : "h-8 text-xs";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 rounded-lg border border-sub/15 bg-card p-0.5",
        block && "flex w-full",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 transition-colors",
              h,
              block && "flex-1",
              active ? "bg-sub/10 text-ink" : "text-sub hover:text-ink",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
