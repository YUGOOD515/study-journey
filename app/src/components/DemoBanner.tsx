import { useState } from "react";
import { authApi } from "../lib/auth";
import type { Mode as AuthMode } from "../pages/AuthPage";
import { Button, notify } from "./ui";

/** 示例模式提示条：说明数据是演示用的，并提供注册 / 退出入口。 */
export function DemoBanner({ onLeave }: { onLeave: (next?: AuthMode) => void }) {
  const [busy, setBusy] = useState<"register" | "exit" | null>(null);

  const leave = async (next: "register" | "exit") => {
    setBusy(next);
    try {
      await authApi.endDemo();
      onLeave(next === "register" ? "register" : "login");
    } catch (err) {
      notify.error(err, "操作失败");
      setBusy(null);
    }
  };

  return (
    <div className="border-b border-line bg-fill/60">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-1.5 sm:px-6">
        <p className="flex min-w-0 items-center gap-2 text-2xs text-sub">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
          <span>
            <span className="font-medium text-ink">示例模式</span>
            <span className="mx-1.5 text-faint">·</span>
            一位大三同学的演示数据，可随意编辑，24 小时后自动清除
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="ghost" loading={busy === "exit"} disabled={busy !== null} onClick={() => void leave("exit")}>
            退出示例
          </Button>
          <Button size="sm" variant="primary" loading={busy === "register"} disabled={busy !== null} onClick={() => void leave("register")}>
            注册账号
          </Button>
        </div>
      </div>
    </div>
  );
}
