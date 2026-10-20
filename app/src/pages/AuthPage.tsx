import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Input, PasswordInput } from "../components/ui";
import { ThemeToggle } from "../components/ThemeToggle";
import { Turnstile, type TurnstileHandle } from "../components/Turnstile";
import { authApi, type AppConfig } from "../lib/auth";
import { Eye } from "../lib/icons";

export type Mode = "login" | "register" | "forgot" | "reset";

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
  onStartDemo,
  initial,
  initialError,
}: {
  config: AppConfig;
  onSignedIn: () => Promise<void> | void;
  /** 进入示例模式；失败时抛出错误，由本页显示。 */
  onStartDemo: () => Promise<void>;
  initial?: Mode;
  initialError?: string;
}) {
  const [mode, setMode] = useState<Mode>(() => initial ?? initialMode());
  const [demoBusy, setDemoBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (initialError) return initialError;
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

  const startDemo = async () => {
    setError(null);
    setDemoBusy(true);
    try {
      await onStartDemo();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDemoBusy(false);
    }
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

  const description = {
    login: "规划课程、记录成绩、查看学期课表。",
    register: "注册后会复制一份培养方案，之后的计划、成绩和课表仅自己可见。",
    forgot: "输入注册邮箱，将发送重置密码链接。",
    reset: "请输入新的密码。",
  }[mode];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="h-3 w-3 rounded-sm bg-brand" aria-hidden />
            学旅
          </span>
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 justify-center px-4 pb-16 pt-16 sm:pt-24">
        <div className="w-full max-w-[360px]">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-sub">{description}</p>

          <form onSubmit={submit} className="mt-6 space-y-4 rounded-md border border-line bg-card p-5">
            {mode !== "reset" && (
              <Field label="邮箱">
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9"
                  placeholder="you@example.com"
                />
              </Field>
            )}

            {mode !== "forgot" && (
              <Field label={mode === "reset" ? "新密码" : "密码"} hint={mode === "login" ? undefined : "至少 8 位"}>
                <PasswordInput
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9"
                />
              </Field>
            )}

            {(mode === "register" || mode === "reset") && (
              <Field label="确认密码">
                <PasswordInput
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className="h-9"
                />
              </Field>
            )}

            {needsCaptcha && (
              <Turnstile key={mode} ref={turnstile} siteKey={config.turnstileSiteKey!} onToken={setCaptcha} />
            )}

            {error && (
              <p role="alert" className="rounded bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
                {error}
              </p>
            )}
            {notice && <p className="rounded bg-brand/10 px-2.5 py-1.5 text-xs text-ink">{notice}</p>}

            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              {{ login: "登录", register: "注册并登录", forgot: "发送重置邮件", reset: "保存新密码" }[mode]}
            </Button>
          </form>

          <div className="mt-4 flex justify-between text-xs text-sub">
            {mode === "login" ? (
              <>
                <LinkButton onClick={() => go("register")}>注册新账号</LinkButton>
                {config.emailEnabled && <LinkButton onClick={() => go("forgot")}>忘记密码</LinkButton>}
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

          {(mode === "login" || mode === "register") && (
            <div className="mt-8 border-t border-line pt-6">
              <Button size="lg" block icon={<Eye />} loading={demoBusy} onClick={() => void startDemo()}>
                先看看示例
              </Button>
              <p className="mt-2 text-2xs leading-relaxed text-sub">
                免注册体验一位大三同学的完整 8 学期计划、成绩与课表，可以随意编辑；示例数据 24 小时后自动清除。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="underline-offset-4 hover:text-ink hover:underline">
      {children}
    </button>
  );
}
