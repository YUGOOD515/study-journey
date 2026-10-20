import { useEffect, useMemo } from "react";
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

const TABS: Array<{ id: Tab; label: string; href: string; icon: typeof CalendarDays }> = [
  { id: "timeline", label: "时间轴", href: "/timeline", icon: GanttChartSquare },
  { id: "trail", label: "旅迹", href: "/trail", icon: Footprints },
  { id: "term-schedule", label: "学期课表", href: "/schedule", icon: CalendarDays },
];

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

  useEffect(() => {
    const label = TABS.find((t) => t.id === tab)?.label;
    document.title = label ? `${label} · 学旅` : "学旅";
  }, [tab]);

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-nav border-b border-line bg-bg">
        <div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex h-full min-w-0 items-center gap-8">
            <a
              href="/timeline"
              onClick={(e) => {
                e.preventDefault();
                navigate("/timeline");
              }}
              className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink"
            >
              <span className="h-3 w-3 rounded-sm bg-brand" aria-hidden />
              学旅
            </a>
            <div className="hidden h-full items-stretch gap-6 sm:flex" role="tablist" aria-label="页面">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => navigate(t.href)}
                  className={cn(
                    "-mb-px inline-flex items-center border-b-2 text-xs transition-colors",
                    tab === t.id ? "border-ink font-medium text-ink" : "border-transparent text-sub hover:text-ink",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <EditModeToggle />
            <ThemeToggle />
            <AccountMenu me={me} onSignedOut={onSignedOut} />
          </div>
        </div>
      </nav>

      <main>
        <Switch>
          <Route path="/">
            <Redirect to="/timeline" replace />
          </Route>
          <Route path="/timeline">
            <Timeline currentTerm={defaultTerm} onOpenSchedule={(term) => navigate(`/schedule/${term}`)} />
          </Route>
          <Route path="/trail">
            <Trail />
          </Route>
          <Route path="/schedule/:term?">
            <TermSchedule
              termNumber={scheduleTerm}
              currentTerm={defaultTerm}
              onTermChange={(term) => navigate(`/schedule/${term}`, { replace: true })}
            />
          </Route>
          <Route>
            <Redirect to="/timeline" replace />
          </Route>
        </Switch>
      </main>

      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-nav grid grid-cols-3 border-t border-line bg-bg sm:hidden"
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
                "flex h-14 flex-col items-center justify-center gap-1 text-2xs transition-colors",
                active ? "font-medium text-ink" : "text-faint",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.75} />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
