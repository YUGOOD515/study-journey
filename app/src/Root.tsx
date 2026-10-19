import { useCallback, useEffect, useState } from "react";
import App from "./App";
import AuthPage from "./pages/AuthPage";
import { authApi, UNAUTHORIZED_EVENT, type AppConfig, type Me } from "./lib/auth";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "signed-out"; config: AppConfig }
  | { status: "signed-in"; config: AppConfig; me: Me };

/** 登录门：未登录显示登录/注册页，登录后渲染应用。 */
export default function Root() {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
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
      setState((s) => (s.status === "signed-in" ? { status: "signed-out", config: s.config } : s));
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (state.status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-xs text-sub">加载中…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-xs text-sub">
        <p>加载失败：{state.message}</p>
        <button onClick={() => void refresh()} className="rounded-md border border-sub/25 px-3 py-1 hover:text-ink">
          重试
        </button>
      </div>
    );
  }
  if (state.status === "signed-out") {
    return <AuthPage config={state.config} onSignedIn={refresh} />;
  }
  return (
    <App
      key={state.me.id}
      me={state.me}
      onSignedOut={() => setState({ status: "signed-out", config: state.config })}
    />
  );
}
