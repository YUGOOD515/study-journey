import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";
import { inputClass } from "./Field";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** 需要输入这段文字才能确认（高风险操作） */
  requireText?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** 统一的确认弹窗，替代 window.confirm。 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    resolver.current?.(false);
    setTyped("");
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  const blocked = Boolean(options?.requireText) && typed.trim() !== options?.requireText;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options != null}
        onOpenChange={(open) => !open && finish(false)}
        title={options?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => finish(false)}>
              {options?.cancelLabel ?? "取消"}
            </Button>
            <Button
              variant={options?.tone === "danger" ? "danger-solid" : "primary"}
              disabled={blocked}
              onClick={() => finish(true)}
              autoFocus={!options?.requireText}
            >
              {options?.confirmLabel ?? "确定"}
            </Button>
          </>
        }
      >
        {options?.description && (
          <div className="text-xs leading-relaxed text-sub">{options.description}</div>
        )}
        {options?.requireText && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] text-sub">
              请输入 <span className="font-medium text-ink">{options.requireText}</span> 以确认
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !blocked) finish(true);
              }}
              className={inputClass}
            />
          </label>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm 需要在 ConfirmProvider 内使用");
  return fn;
}
