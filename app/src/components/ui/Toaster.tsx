import { Toaster as Sonner, toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

/** 全局消息提示（右下 / 手机底部居中）。 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={{ bottom: 76, right: 20 }}
      mobileOffset={{ bottom: 128, left: 12, right: 12 }}
      visibleToasts={4}
      gap={8}
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-brand" />,
        error: <XCircle className="h-4 w-4 text-danger" />,
        warning: <AlertTriangle className="h-4 w-4 text-brand" />,
        info: <Info className="h-4 w-4 text-sub" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border border-sub/15 bg-card px-3 py-2.5 text-xs text-ink shadow-pop sm:w-[340px]",
          title: "leading-snug",
          description: "mt-0.5 text-[11px] leading-snug text-sub",
          icon: "mt-px shrink-0",
          actionButton:
            "ml-auto shrink-0 rounded-md bg-sub/10 px-2 py-1 text-[11px] text-ink hover:bg-sub/15",
          closeButton: "text-faint",
        },
      }}
    />
  );
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export const notify = {
  success: (text: string, description?: string) => toast.success(text, { description }),
  info: (text: string, description?: string) => toast.info(text, { description }),
  warning: (text: string, description?: string, onUndo?: () => void) =>
    toast.warning(text, {
      description,
      duration: 6000,
      action: onUndo ? { label: "撤销", onClick: onUndo } : undefined,
    }),
  error: (e: unknown, title = "操作失败") =>
    toast.error(title, { description: message(e), duration: 6000 }),
  undo: (text: string, onUndo: () => void) =>
    toast.success(text, { action: { label: "撤销", onClick: onUndo }, duration: 6000 }),
};
