import { useEffect, useRef, useState } from "react";

type SelectOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type Props<T extends string> = {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel?: string;
};

export function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  compact = false,
  ariaLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={[
          className,
          "group flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60",
        ].join(" ")}
      >
        <span className="truncate">{selected?.label ?? "请选择"}</span>
        <span
          aria-hidden="true"
          className={[
            "shrink-0 text-[10px] text-sub/70 transition-transform duration-150 group-hover:text-sub",
            open ? "rotate-180" : "rotate-0",
          ].join(" ")}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className={[
            "absolute left-0 right-0 z-[80] mt-1 overflow-hidden rounded-xl border border-sub/15 bg-card/95 text-ink",
            "shadow-[0_14px_36px_rgb(var(--shadow-rgb)/var(--shadow-strong)),0_2px_8px_rgb(var(--shadow-rgb)/var(--shadow-soft))] backdrop-blur-xl",
            "origin-top animate-[selectMenuIn_140ms_cubic-bezier(0.22,1,0.36,1)]",
          ].join(" ")}
        >
          <div className="max-h-52 overflow-y-auto p-1">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left transition-colors",
                    compact ? "h-7 text-[11px]" : "h-8 text-sm",
                    active ? "bg-brand/10 text-ink" : "text-ink hover:bg-sub/10",
                    option.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                  ].join(" ")}
                >
                  <span className="truncate">{option.label}</span>
                  {active && <span className="text-[10px] text-brand">●</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
