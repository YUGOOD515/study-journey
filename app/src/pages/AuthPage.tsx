import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Footprints, GanttChartSquare, ShieldCheck } from "lucide-react";
import { Button, Field, Input, PasswordInput } from "../components/ui";
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

  const FEATURES = [
    { icon: GanttChartSquare, title: "时间轴", text: "8 个学期一屏规划，拖拽排课，先修和开课学期冲突即时提示。" },
    { icon: Footprints, title: "旅迹", text: "已修、在修、计划学分一目了然，按五大板块追踪培养方案进度。" },
    { icon: CalendarDays, title: "学期课表", text: "按周查看真实课表，周次分布、上课地点和教师随时可查。" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 sm:px-6">
        <span className="text-base tracking-tight text-brand">学旅</span>
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-10 sm:pb-16">
        <div className="grid w-full max-w-[880px] items-center gap-8 md:grid-cols-[1fr_380px] md:gap-14">
          <section className="hidden md:block">
            <div className="text-[10px] tracking-[0.3em] text-faint">STUDY JOURNEY</div>
            <h2 className="mt-2 text-2xl leading-snug text-ink">
              把四年的课，
              <br />
              排成一条清楚的路。
            </h2>
            <ul className="mt-7 space-y-4">
              {FEATURES.map(({ icon: Icon, title: t, text }) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-xs text-ink">{t}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-sub">{text}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex items-center gap-1.5 text-[11px] text-faint">
              <ShieldCheck className="h-3.5 w-3.5" />
              每个账号的数据相互隔离，只有你自己能看到。
            </div>
          </section>

          <form onSubmit={submit} className="w-full space-y-4 rounded-xl border border-sub/15 bg-card p-5 shadow-card sm:p-6">
            <div>
              <h1 className="text-lg text-ink">{title}</h1>
              <p className="mt-1 text-xs leading-relaxed text-sub">
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
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 text-sm"
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
                  className="h-9 text-sm"
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
                  className="h-9 text-sm"
                />
              </Field>
            )}

            {needsCaptcha && (
              <Turnstile key={mode} ref={turnstile} siteKey={config.turnstileSiteKey!} onToken={setCaptcha} />
            )}

            {error && <p className="rounded-md bg-danger/10 px-2.5 py-1.5 text-xs text-danger">{error}</p>}
            {notice && <p className="rounded-md bg-brand/10 px-2.5 py-1.5 text-xs text-brand">{notice}</p>}

            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              {{ login: "登录", register: "注册并登录", forgot: "发送重置邮件", reset: "保存新密码" }[mode]}
            </Button>

            <div className="flex justify-between text-xs text-sub">
              {mode === "login" ? (
                <>
                  <LinkButton onClick={() => go("register")}>没有账号？注册</LinkButton>
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
          </form>
        </div>
      </div>
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="underline-offset-2 hover:text-ink hover:underline">
      {children}
    </button>
  );
}
