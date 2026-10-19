import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/cn";

export const inputClass =
  "h-8 w-full rounded-md border border-sub/20 bg-card px-2.5 text-xs text-ink placeholder:text-faint outline-none transition-[border-color,box-shadow] focus:border-brand/60 focus:ring-2 focus:ring-brand/15 disabled:opacity-60";

export const textareaClass =
  "w-full rounded-md border border-sub/20 bg-card px-2.5 py-2 text-xs leading-relaxed text-ink placeholder:text-faint outline-none transition-[border-color,box-shadow] focus:border-brand/60 focus:ring-2 focus:ring-brand/15 disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] text-sub">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...rest} />;
  },
);

/** 带“显示/隐藏”切换的密码框 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(function PasswordInput({ className, ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn(inputClass, "pr-9", className)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-faint hover:text-ink"
        aria-label={visible ? "隐藏密码" : "显示密码"}
        title={visible ? "隐藏密码" : "显示密码"}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
});
