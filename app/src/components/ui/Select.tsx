import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
  hint?: string;
};

// Radix Select 不允许空字符串作为值，内部做一次映射
const EMPTY = "__empty__";
const toInner = (v: string) => (v === "" ? EMPTY : v);
const toOuter = (v: string) => (v === EMPTY ? "" : v);

export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
  disabled = false,
  compact = false,
  ariaLabel,
  placeholder = "请选择",
}: {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}) {
  return (
    <RS.Root
      value={toInner(value)}
      onValueChange={(v) => onChange(toOuter(v) as T)}
      disabled={disabled}
    >
      <RS.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-sub/20 bg-card text-left text-ink outline-none transition-[border-color,box-shadow]",
          "hover:border-sub/40 focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/15 data-[state=open]:border-brand/60 disabled:opacity-60",
          compact ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-xs",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <RS.Value placeholder={placeholder} />
        </span>
        <RS.Icon>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className="z-toast max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-sub/15 bg-card text-xs text-ink shadow-pop animate-pop-in"
        >
          <RS.Viewport className="p-1">
            {options.map((option) => (
              <RS.Item
                key={option.value || EMPTY}
                value={toInner(option.value)}
                disabled={option.disabled}
                className="relative flex h-8 cursor-default select-none items-center gap-2 rounded-md pl-2 pr-7 outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-sub/10 data-[state=checked]:text-brand"
              >
                <RS.ItemText>{option.label}</RS.ItemText>
                {option.hint && (
                  <span className="ml-auto text-[10px] text-faint">{option.hint}</span>
                )}
                <RS.ItemIndicator className="absolute right-2">
                  <Check className="h-3.5 w-3.5" />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
