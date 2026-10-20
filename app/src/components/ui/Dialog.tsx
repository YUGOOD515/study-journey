import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { IconButton } from "./Button";

const WIDTH = {
  sm: "sm:max-w-[400px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[760px]",
  xl: "sm:max-w-[960px]",
} as const;

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof WIDTH;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  bare?: boolean;
  className?: string;
  dismissible?: boolean;
}

/** 弹窗：桌面居中，手机为底部抽屉。标题栏 / 内容 / 底栏三段，以 1px 分隔线区隔。 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  footer,
  children,
  bare,
  className,
  dismissible = true,
}: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="animate-fade fixed inset-0 z-overlay bg-black/30 dark:bg-black/50" />
        <div className="pointer-events-none fixed inset-0 z-overlay flex items-end justify-center sm:items-center sm:p-6">
          <RD.Content
            onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
            onInteractOutside={(e) => !dismissible && e.preventDefault()}
            className={cn(
              "animate-sheet pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-md border border-line bg-card text-ink shadow-pop outline-none",
              "sm:max-h-[min(860px,calc(100dvh-48px))] sm:rounded-md",
              WIDTH[size],
              className,
            )}
          >
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line pl-4 pr-2 sm:pl-5">
              <div className="min-w-0">
                <RD.Title className="truncate text-sm font-semibold text-ink">{title}</RD.Title>
                {description ? (
                  <RD.Description className="truncate text-2xs text-sub">{description}</RD.Description>
                ) : (
                  <RD.Description className="sr-only">{typeof title === "string" ? title : "对话框"}</RD.Description>
                )}
              </div>
              <RD.Close asChild>
                <IconButton label="关闭" size="md">
                  <X className="!h-4 !w-4" />
                </IconButton>
              </RD.Close>
            </div>
            <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", !bare && "p-4 sm:p-5")}>
              {children}
            </div>
            {footer && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
                {footer}
              </div>
            )}
          </RD.Content>
        </div>
      </RD.Portal>
    </RD.Root>
  );
}
