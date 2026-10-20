import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-ink bg-ink text-bg hover:bg-ink/85",
  secondary: "border-line-strong bg-card text-ink hover:bg-fill",
  ghost: "border-transparent text-sub hover:bg-fill hover:text-ink",
  danger: "border-line-strong bg-card text-danger hover:border-danger/50 hover:bg-danger/5",
  "danger-solid": "border-danger bg-danger text-white hover:bg-danger/90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2 text-xs",
  md: "h-8 gap-1.5 px-3 text-xs",
  lg: "h-9 gap-2 px-4 text-sm",
};

const ICON_SIZE: Record<ButtonSize, string> = { sm: "h-7 w-7", md: "h-8 w-8", lg: "h-9 w-9" };

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded border font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, block, className, children, disabled, type = "button", ...rest },
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
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
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
  { label, variant = "ghost", size = "sm", active, className, children, type = "button", title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cn(BASE, "font-normal", VARIANT[variant], ICON_SIZE[size], active && "bg-fill text-ink", className)}
      {...rest}
    >
      {children}
    </button>
  );
});
