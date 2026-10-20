import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import { popoverPanelClass } from "./Popover";

export type SelectOption<T extends string> = { value: T; label: string; disabled?: boolean; hint?: string };

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
    <RS.Root value={toInner(value)} onValueChange={(v) => onChange(toOuter(v) as T)} disabled={disabled}>
      <RS.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex w-full min-w-0 items-center justify-between gap-1.5 rounded border border-line-strong bg-card text-left text-xs text-ink outline-none transition-colors",
          "hover:border-faint/60 data-[state=open]:border-ink disabled:opacity-50",
          compact ? "h-7 px-2" : "h-8 px-2.5",
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
          className={cn(
            popoverPanelClass,
            "z-toast max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden",
          )}
        >
          <RS.Viewport className="p-1">
            {options.map((option) => (
              <RS.Item
                key={option.value || EMPTY}
                value={toInner(option.value)}
                disabled={option.disabled}
                className="relative flex h-8 cursor-default select-none items-center gap-2 rounded-sm pl-7 pr-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-fill"
              >
                <RS.ItemIndicator className="absolute left-2">
                  <Check className="h-3.5 w-3.5" />
                </RS.ItemIndicator>
                <RS.ItemText>{option.label}</RS.ItemText>
                {option.hint && <span className="ml-auto text-2xs text-faint">{option.hint}</span>}
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
