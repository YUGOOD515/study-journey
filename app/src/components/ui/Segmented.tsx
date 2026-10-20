import { cn } from "../../lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}

/** 分段切换：外框 1px 描边，选中项为实色白底 + 描边 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
  block,
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
  block?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex h-8 shrink-0 rounded bg-fill-strong p-0.5", block && "flex w-full", className)}
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
              "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-xs transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
              block && "flex-1",
              active ? "bg-card font-medium text-ink shadow-[0_0_0_1px_rgb(var(--line-strong))]" : "text-sub hover:text-ink",
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
