import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "soft"
  | "dashed"
  | "danger"
  | "danger-solid";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-brand text-white hover:bg-brand/90 active:bg-brand/80",
  secondary: "border-sub/20 bg-card text-ink hover:border-sub/40 hover:bg-sub/5",
  ghost: "border-transparent text-sub hover:text-ink hover:bg-sub/10",
  soft: "border-transparent bg-sub/10 text-ink hover:bg-sub/15",
  dashed: "border-dashed border-sub/25 text-sub hover:text-ink hover:border-sub/45 hover:bg-sub/5",
  danger: "border-danger/30 bg-card text-danger hover:border-danger/50 hover:bg-danger/10",
  "danger-solid": "border-transparent bg-danger text-white hover:bg-danger/90",
};

const SIZE: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-[11px] gap-1 rounded",
  sm: "h-7 px-2.5 text-[11px] gap-1.5 rounded-md",
  md: "h-8 px-3 text-xs gap-1.5 rounded-md",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
};

const ICON_SIZE: Record<ButtonSize, string> = {
  xs: "h-6 w-6 rounded",
  sm: "h-7 w-7 rounded-md",
  md: "h-8 w-8 rounded-md",
  lg: "h-10 w-10 rounded-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** 左侧图标（lucide 组件实例） */
  icon?: React.ReactNode;
  block?: boolean;
}

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap border transition-colors disabled:pointer-events-none disabled:opacity-50";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading,
    icon,
    block,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(BASE, VARIANT[variant], SIZE[size], block && "w-full", className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 无障碍名称，同时作为悬停提示 */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    variant = "ghost",
    size = "sm",
    active,
    className,
    children,
    type = "button",
    title,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cn(
        BASE,
        VARIANT[variant],
        ICON_SIZE[size],
        active && "bg-sub/10 text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
