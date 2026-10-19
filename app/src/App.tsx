import { useEffect, useMemo, useState } from "react";
import { Redirect, Route, Switch, useLocation, useRoute } from "wouter";
import { CalendarDays, Footprints, GanttChartSquare } from "lucide-react";
import Timeline from "./pages/Timeline";
import TermSchedule from "./pages/TermSchedule";
import Trail from "./pages/Trail";
import { ThemeToggle } from "./components/ThemeToggle";
import { AccountMenu } from "./components/AccountMenu";
import { EditModeToggle } from "./components/EditModeToggle";
import { currentTermNumber } from "./lib/currentTerm";
import { cn } from "./lib/cn";
import type { Me } from "./lib/auth";

type Tab = "timeline" | "trail" | "term-schedule";
type MotionDirection = -1 | 1;

const TABS: Array<{ id: Tab; label: string; href: string; icon: typeof CalendarDays }> = [
  { id: "timeline", label: "时间轴", href: "/timeline", icon: GanttChartSquare },
  { id: "trail", label: "旅迹", href: "/trail", icon: Footprints },
  { id: "term-schedule", label: "学期课表", href: "/schedule", icon: CalendarDays },
];

const TAB_ORDER: Record<Tab, number> = { timeline: 0, trail: 1, "term-schedule": 2 };
const PAGE_TRANSITION_MS = 420;

interface PageTransitionState {
  from: Tab | null;
  to: Tab;
  direction: MotionDirection;
  nonce: number;
}

function tabOf(path: string): Tab {
  if (path.startsWith("/trail")) return "trail";
  if (path.startsWith("/schedule")) return "term-schedule";
  return "timeline";
}

export default function App({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [location, navigate] = useLocation();
  const [, scheduleParams] = useRoute<{ term: string }>("/schedule/:term");
  const tab = tabOf(location);
  const defaultTerm = useMemo(() => currentTermNumber(me.enrollmentYear), [me.enrollmentYear]);
  const parsedTerm = Number(scheduleParams?.term);
  const scheduleTerm = Number.isInteger(parsedTerm) && parsedTerm >= 1 && parsedTerm <= 8 ? parsedTerm : defaultTerm;

  const [pageTransition, setPageTransition] = useState<PageTransitionState>({
    from: null,
    to: tab,
    direction: 1,
    nonce: 0,
  });

  useEffect(() => {
    setPageTransition((current) => {
      if (current.to === tab) return current;
      return {
        from: current.to,
        to: tab,
        direction: TAB_ORDER[tab] >= TAB_ORDER[current.to] ? 1 : -1,
        nonce: current.nonce + 1,
      };
    });
  }, [tab]);

  useEffect(() => {
    if (pageTransition.from == null) return;
    const timer = window.setTimeout(() => {
      setPageTransition((current) =>
        current.nonce === pageTransition.nonce ? { ...current, from: null } : current
      );
    }, PAGE_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [pageTransition.from, pageTransition.nonce]);

  useEffect(() => {
    const label = TABS.find((t) => t.id === tab)?.label;
    document.title = label ? `${label} · 学旅` : "学旅 · Study Journey";
  }, [tab]);

  const renderPage = (pageTab: Tab) => {
    if (pageTab === "timeline") {
      return <Timeline currentTerm={defaultTerm} onOpenSchedule={(term) => navigate(`/schedule/${term}`)} />;
    }
    if (pageTab === "trail") return <Trail />;
    return (
      <TermSchedule
        termNumber={scheduleTerm}
        currentTerm={defaultTerm}
        onTermChange={(term) => navigate(`/schedule/${term}`, { replace: true })}
      />
    );
  };

  const transitioning = pageTransition.from != null && pageTransition.from !== pageTransition.to;

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-nav flex h-12 items-center justify-between gap-3 border-b border-sub/15 bg-card/75 px-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <a
            href="/timeline"
            onClick={(e) => {
              e.preventDefault();
              navigate("/timeline");
            }}
            className="shrink-0 text-base tracking-tight text-brand"
          >
            学旅
          </a>
          <div className="hidden items-center gap-0.5 sm:flex" role="tablist" aria-label="页面">
            {TABS.map((t) => (
              <NavTab key={t.id} active={tab === t.id} onClick={() => navigate(t.href)} icon={t.icon}>
                {t.label}
              </NavTab>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <EditModeToggle />
          <ThemeToggle />
          <AccountMenu me={me} onSignedOut={onSignedOut} />
        </div>
      </nav>

      <main className="page-transition-stage pb-16 sm:pb-0">
        <Switch>
          <Route path="/">
            <Redirect to="/timeline" replace />
          </Route>
          <Route path="/timeline" />
          <Route path="/trail" />
          <Route path="/schedule" />
          <Route path="/schedule/:term" />
          <Route>
            <Redirect to="/timeline" replace />
          </Route>
        </Switch>
        {transitioning && pageTransition.from != null && (
          <div
            key={pageTransition.from}
            className="page-transition-layer page-transition-exit"
            data-direction={pageTransition.direction}
            aria-hidden="true"
          >
            {renderPage(pageTransition.from)}
          </div>
        )}
        <div
          key={pageTransition.to}
          className={"page-transition-layer " + (transitioning ? "page-transition-enter" : "")}
          data-direction={pageTransition.direction}
        >
          {renderPage(pageTransition.to)}
        </div>
      </main>

      {/* 手机底部导航 */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-nav grid grid-cols-3 border-t border-sub/15 bg-card/90 backdrop-blur sm:hidden"
        aria-label="页面"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => navigate(t.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
                active ? "text-brand" : "text-sub"
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function NavTab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarDays;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
        active ? "bg-sub/10 text-ink" : "text-sub hover:bg-sub/5 hover:text-ink"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
