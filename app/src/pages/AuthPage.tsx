import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { Turnstile, type TurnstileHandle } from "../components/Turnstile";
import { authApi, type AppConfig } from "../lib/auth";

type Mode = "login" | "register" | "forgot" | "reset";

function initialMode(): Mode {
  const params = new URLSearchParams(window.location.search);
  if (params.get("token")) return "reset";
  return "login";
}

function clearAuthParams() {
  const url = new URL(window.location.href);
  ["token", "auth", "error"].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export default function AuthPage({
  config,
  onSignedIn,
}: {
  config: AppConfig;
  onSignedIn: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    return err ? "链接无效或已过期，请重新申请" : null;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const resetToken = useRef(new URLSearchParams(window.location.search).get("token"));

  const needsCaptcha = Boolean(config.turnstileSiteKey) && mode !== "reset";

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setPassword2("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if ((mode === "register" || mode === "reset") && password !== password2) {
      setError("两次输入的密码不一致");
      return;
    }
    if (needsCaptcha && !captcha) {
      setError("请先完成人机验证");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await authApi.signIn(email.trim(), password, captcha);
        await onSignedIn();
      } else if (mode === "register") {
        const name = email.trim().split("@")[0] || "同学";
        const res = await authApi.signUp(email.trim(), password, name, captcha);
        if (res?.token) {
          await onSignedIn();
        } else {
          go("login");
          setNotice("注册成功！验证邮件已发送，请点击邮件中的链接后再登录。");
        }
      } else if (mode === "forgot") {
        await authApi.requestPasswordReset(email.trim(), captcha);
        setNotice("如果该邮箱已注册，你会收到一封重置密码邮件。");
      } else if (mode === "reset") {
        await authApi.resetPassword(resetToken.current ?? "", password);
        clearAuthParams();
        resetToken.current = null;
        go("login");
        setNotice("密码已重置，请用新密码登录。");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      turnstile.current?.reset();
    }
  };

  const title = {
    login: "登录学旅",
    register: "注册学旅",
    forgot: "找回密码",
    reset: "设置新密码",
  }[mode];

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex justify-between items-center px-6 py-2.5">
        <span className="text-base text-brand tracking-tight">学旅</span>
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-xl border border-sub/15 bg-card p-6 shadow-sm space-y-4"
        >
          <div>
            <h1 className="text-lg text-ink">{title}</h1>
            <p className="mt-1 text-xs text-sub">
              {mode === "register"
                ? "注册后会为你复制一份培养方案，之后的计划、成绩和课表只有你自己能看到。"
                : mode === "forgot"
                  ? "输入注册邮箱，我们会发送重置密码链接。"
                  : mode === "reset"
                    ? "请输入新的密码。"
                    : "规划课程、记录成绩、查看学期课表。"}
            </p>
          </div>

          {mode !== "reset" && (
            <Field label="邮箱">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          {mode !== "forgot" && (
            <Field label={mode === "reset" ? "新密码" : "密码"}>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          {(mode === "register" || mode === "reset") && (
            <Field label="确认密码">
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          {needsCaptcha && (
            <Turnstile key={mode} ref={turnstile} siteKey={config.turnstileSiteKey!} onToken={setCaptcha} />
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {notice && <p className="text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand px-3 py-2 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? "请稍候…"
              : { login: "登录", register: "注册并登录", forgot: "发送重置邮件", reset: "保存新密码" }[mode]}
          </button>

          <div className="flex justify-between text-xs text-sub">
            {mode === "login" ? (
              <>
                <LinkButton onClick={() => go("register")}>没有账号？注册</LinkButton>
                {config.emailEnabled && (
                  <LinkButton onClick={() => go("forgot")}>忘记密码</LinkButton>
                )}
              </>
            ) : (
              <LinkButton
                onClick={() => {
                  clearAuthParams();
                  go("login");
                }}
              >
                返回登录
              </LinkButton>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-sub/25 bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-brand";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-sub">{label}</span>
      {children}
    </label>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="hover:text-ink underline-offset-2 hover:underline">
      {children}
    </button>
  );
}
