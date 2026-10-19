import { useEffect, useRef, useState, type FormEvent } from "react";
import { authApi, type Me } from "../lib/auth";

type Panel = "main" | "password" | "delete";

export function AccountMenu({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("main");
  const [year, setYear] = useState(me.enrollmentYear);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const switchPanel = (p: Panel) => {
    setPanel(p);
    setCurrent("");
    setNext("");
    setMessage(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const saveYear = () =>
    run(async () => {
      await authApi.updateMe({ enrollmentYear: year });
      window.location.reload();
    });

  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await authApi.changePassword(current, next);
      switchPanel("main");
      setMessage({ kind: "ok", text: "密码已修改，其他设备已退出登录" });
    });
  };

  const deleteAccount = (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm("注销后，你的计划、成绩和课表将被永久删除，无法恢复。确定注销吗？")) return;
    void run(async () => {
      await authApi.deleteAccount(current);
      onSignedOut();
    });
  };

  const signOut = () =>
    run(async () => {
      await authApi.signOut();
      onSignedOut();
    });

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => thisYear + 1 - i);
  if (!years.includes(me.enrollmentYear)) years.push(me.enrollmentYear);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          switchPanel("main");
        }}
        title={me.email}
        className="h-7 w-7 rounded-full bg-brand/15 text-brand text-xs flex items-center justify-center hover:bg-brand/25 transition-colors"
      >
        {(me.email[0] ?? "?").toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-sub/15 bg-card p-4 shadow-lg space-y-3 text-xs">
          <div>
            <div className="text-sub">当前账号</div>
            <div className="text-ink truncate">{me.email}</div>
          </div>

          {panel === "main" && (
            <>
              <div className="space-y-1">
                <div className="text-sub">入学年份（第 1 学期 = 该年秋季）</div>
                <div className="flex gap-2">
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="flex-1 rounded-md border border-sub/25 bg-transparent px-2 py-1 text-ink"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y} 级
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy || year === me.enrollmentYear}
                    onClick={saveYear}
                    className="rounded-md bg-brand px-2.5 py-1 text-white disabled:opacity-40"
                  >
                    保存
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1 border-t border-sub/10 pt-2">
                <MenuButton onClick={() => switchPanel("password")}>修改密码</MenuButton>
                <MenuButton onClick={signOut} disabled={busy}>退出登录</MenuButton>
                <MenuButton danger onClick={() => switchPanel("delete")}>注销账号</MenuButton>
              </div>
            </>
          )}

          {panel === "password" && (
            <form onSubmit={changePassword} className="space-y-2">
              <PasswordInput label="当前密码" value={current} onChange={setCurrent} autoComplete="current-password" />
              <PasswordInput label="新密码（至少 8 位）" value={next} onChange={setNext} autoComplete="new-password" />
              <FormButtons busy={busy} submitText="修改密码" onCancel={() => switchPanel("main")} />
            </form>
          )}

          {panel === "delete" && (
            <form onSubmit={deleteAccount} className="space-y-2">
              <p className="text-red-600 dark:text-red-400">
                注销会永久删除账号及全部个人数据（计划、成绩、课表）。
              </p>
              <PasswordInput label="输入密码确认" value={current} onChange={setCurrent} autoComplete="current-password" />
              <FormButtons busy={busy} submitText="永久注销" danger onCancel={() => switchPanel("main")} />
            </form>
          )}

          {message && (
            <p className={message.kind === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}>
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MenuButton({
  onClick,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "text-left rounded-md px-2 py-1.5 transition-colors disabled:opacity-50 " +
        (danger ? "text-red-600 hover:bg-red-500/10 dark:text-red-400" : "text-ink hover:bg-sub/10")
      }
    >
      {children}
    </button>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sub">{label}</span>
      <input
        type="password"
        required
        minLength={8}
        maxLength={128}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-sub/25 bg-transparent px-2 py-1 text-ink outline-none focus:border-brand"
      />
    </label>
  );
}

function FormButtons({
  busy,
  submitText,
  onCancel,
  danger,
}: {
  busy: boolean;
  submitText: string;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1 text-sub hover:bg-sub/10">
        取消
      </button>
      <button
        type="submit"
        disabled={busy}
        className={
          "rounded-md px-2.5 py-1 text-white disabled:opacity-50 " + (danger ? "bg-red-600" : "bg-brand")
        }
      >
        {busy ? "请稍候…" : submitText}
      </button>
    </div>
  );
}
