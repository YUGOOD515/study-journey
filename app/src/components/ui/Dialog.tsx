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
  /** 底部操作区；不传则不显示 */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /** 内容区不加内边距（自行布局） */
  bare?: boolean;
  className?: string;
  /** 阻止点击遮罩关闭（例如表单有未保存内容时） */
  dismissible?: boolean;
}

/**
 * 统一弹窗：桌面居中卡片，手机为底部抽屉（sheet）。
 * 基于 Radix Dialog：焦点陷阱、Esc 关闭、aria-modal、滚动锁定。
 */
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
        <RD.Overlay className="motion-overlay-in fixed inset-0 z-overlay bg-black/35" />
        <div className="pointer-events-none fixed inset-0 z-overlay flex items-end justify-center sm:items-center sm:p-4">
          <RD.Content
            onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
            onInteractOutside={(e) => !dismissible && e.preventDefault()}
            className={cn(
              "pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden border border-sub/15 bg-card text-ink shadow-pop outline-none",
              "rounded-t-2xl animate-sheet-in sm:max-h-[min(860px,calc(100dvh-32px))] sm:rounded-xl sm:animate-pop-in",
              WIDTH[size],
              className,
            )}
          >
            <div
              className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-sub/20 sm:hidden"
              aria-hidden
            />
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sub/10 px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
              <div className="min-w-0">
                <RD.Title className="text-sm font-medium text-ink">{title}</RD.Title>
                {description ? (
                  <RD.Description className="mt-0.5 text-[11px] leading-relaxed text-sub">
                    {description}
                  </RD.Description>
                ) : (
                  <RD.Description className="sr-only">
                    {typeof title === "string" ? title : "对话框"}
                  </RD.Description>
                )}
              </div>
              <RD.Close asChild>
                <IconButton label="关闭" className="-mr-1.5 -mt-0.5">
                  <X className="h-4 w-4" />
                </IconButton>
              </RD.Close>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                !bare && "px-4 py-4 sm:px-5",
              )}
            >
              {children}
            </div>
            {footer && (
              <div className="pb-safe flex shrink-0 items-center justify-end gap-2 border-t border-sub/10 px-4 py-3 sm:px-5">
                {footer}
              </div>
            )}
          </RD.Content>
        </div>
      </RD.Portal>
    </RD.Root>
  );
}
