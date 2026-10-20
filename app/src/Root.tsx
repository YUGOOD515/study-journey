import { useCallback, useEffect, useState } from "react";
import App from "./App";
import AuthPage, { type Mode as AuthMode } from "./pages/AuthPage";
import { authApi, UNAUTHORIZED_EVENT, type AppConfig, type Me } from "./lib/auth";
import { invalidateApiCache } from "./lib/api";
import { EditModeProvider } from "./lib/editMode";
import { ConfirmProvider, PageError, Spinner, Toaster, TooltipProvider } from "./components/ui";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "demo-loading" }
  | { status: "signed-out"; config: AppConfig; mode?: AuthMode; error?: string }
  | { status: "signed-in"; config: AppConfig; me: Me };

/** 登录门：未登录显示登录/注册页，登录后渲染应用。 */
export default function Root() {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    invalidateApiCache();
    try {
      const [config, me] = await Promise.all([authApi.config(), authApi.me()]);
      if (me) {
        if (isDemoPath()) leaveDemoPath();
        setState({ status: "signed-in", config, me });
        return;
      }
      // 分享出去的 /demo 链接：未登录时直接创建示例账号
      if (isDemoPath()) {
        setState({ status: "demo-loading" });
        try {
          await authApi.startDemo();
          leaveDemoPath();
          const demoMe = await authApi.me();
          if (demoMe) {
            setState({ status: "signed-in", config, me: demoMe });
            return;
          }
        } catch (err) {
          leaveDemoPath("/");
          setState({ status: "signed-out", config, error: err instanceof Error ? err.message : String(err) });
          return;
        }
      }
      setState({ status: "signed-out", config });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const startDemo = useCallback(async () => {
    await authApi.startDemo();
    leaveDemoPath();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 任意接口返回 401（会话过期、在别处退出）时回到登录页
  useEffect(() => {
    const onUnauthorized = () => {
      invalidateApiCache();
      setState((s) => (s.status === "signed-in" ? { status: "signed-out", config: s.config } : s));
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  let content: React.ReactNode;
  if (state.status === "loading" || state.status === "demo-loading") {
    content = (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner />
        {state.status === "demo-loading" && <p className="text-xs text-sub">正在准备示例数据…</p>}
      </div>
    );
  } else if (state.status === "error") {
    content = <PageError message={state.message} onRetry={() => void refresh()} />;
  } else if (state.status === "signed-out") {
    content = (
      <AuthPage
        key={state.mode ?? "login"}
        config={state.config}
        initial={state.mode}
        initialError={state.error}
        onSignedIn={refresh}
        onStartDemo={startDemo}
      />
    );
  } else {
    content = (
      <EditModeProvider>
        <App
          key={state.me.id}
          me={state.me}
          onSignedOut={(next?: AuthMode) => {
            invalidateApiCache();
            setState({ status: "signed-out", config: state.config, mode: next });
          }}
        />
      </EditModeProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <ConfirmProvider>
        {content}
        <Toaster />
      </ConfirmProvider>
    </TooltipProvider>
  );
}

function isDemoPath() {
  return window.location.pathname.replace(/\/+$/, "") === "/demo";
}

/** 离开 /demo 路径（进入示例后落到时间轴；失败时回首页）。 */
function leaveDemoPath(to = "/timeline") {
  if (isDemoPath()) window.history.replaceState(null, "", to);
}
