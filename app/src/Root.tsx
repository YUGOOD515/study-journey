import { useCallback, useEffect, useState } from "react";
import App from "./App";
import AuthPage from "./pages/AuthPage";
import { authApi, UNAUTHORIZED_EVENT, type AppConfig, type Me } from "./lib/auth";
import { invalidateApiCache } from "./lib/api";
import { EditModeProvider } from "./lib/editMode";
import { ConfirmProvider, PageError, Toaster, TooltipProvider } from "./components/ui";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "signed-out"; config: AppConfig }
  | { status: "signed-in"; config: AppConfig; me: Me };

/** 登录门：未登录显示登录/注册页，登录后渲染应用。 */
export default function Root() {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    invalidateApiCache();
    try {
      const [config, me] = await Promise.all([authApi.config(), authApi.me()]);
      setState(me ? { status: "signed-in", config, me } : { status: "signed-out", config });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

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
  if (state.status === "loading") {
    content = (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-sub/20 border-t-brand" aria-label="加载中" />
      </div>
    );
  } else if (state.status === "error") {
    content = <PageError message={state.message} onRetry={() => void refresh()} />;
  } else if (state.status === "signed-out") {
    content = <AuthPage config={state.config} onSignedIn={refresh} />;
  } else {
    content = (
      <EditModeProvider>
        <App
          key={state.me.id}
          me={state.me}
          onSignedOut={() => {
            invalidateApiCache();
            setState({ status: "signed-out", config: state.config });
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
