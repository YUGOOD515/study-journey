import { Toaster as Sonner, toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={{ bottom: 24, right: 24 }}
      mobileOffset={{ bottom: 80, left: 12, right: 12 }}
      visibleToasts={4}
      gap={8}
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-ink" />,
        error: <XCircle className="h-4 w-4 text-danger" />,
        warning: <AlertTriangle className="h-4 w-4 text-warn" />,
        info: <Info className="h-4 w-4 text-sub" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "pointer-events-auto flex w-full items-start gap-2 rounded-md border border-line bg-card px-3 py-2.5 text-xs text-ink shadow-pop sm:w-[340px]",
          title: "font-medium",
          description: "mt-0.5 text-2xs text-sub",
          icon: "mt-px shrink-0",
          actionButton:
            "ml-auto shrink-0 rounded border border-line-strong px-2 py-0.5 text-2xs font-medium text-ink hover:bg-fill",
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
  error: (e: unknown, title = "操作失败") => toast.error(title, { description: message(e), duration: 6000 }),
  undo: (text: string, onUndo: () => void) =>
    toast.success(text, { action: { label: "撤销", onClick: onUndo }, duration: 6000 }),
};
