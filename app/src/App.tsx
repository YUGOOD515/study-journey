import { useEffect, useState } from "react";
import Timeline from "./pages/Timeline";
import TermSchedule from "./pages/TermSchedule";
import Trail from "./pages/Trail";
import { ThemeToggle } from "./components/ThemeToggle";
import { AccountMenu } from "./components/AccountMenu";
import type { Me } from "./lib/auth";

type Tab = "timeline" | "trail" | "term-schedule";
type MotionDirection = -1 | 1;

const TAB_ORDER: Record<Tab, number> = {
  timeline: 0,
  trail: 1,
  "term-schedule": 2,
};

const PAGE_TRANSITION_MS = 420;

interface PageTransitionState {
  from: Tab | null;
  to: Tab;
  direction: MotionDirection;
  nonce: number;
}

function getTabDirection(from: Tab, to: Tab): MotionDirection {
  return TAB_ORDER[to] >= TAB_ORDER[from] ? 1 : -1;
}

export default function App({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>("timeline");
  const [scheduleTerm, setScheduleTerm] = useState(1);
  const [pageTransition, setPageTransition] = useState<PageTransitionState>({
    from: null,
    to: tab,
    direction: 1,
    nonce: 0,
  });

  const openSchedule = (term: number) => {
    setScheduleTerm(term);
    setTab("term-schedule");
  };

  useEffect(() => {
    setPageTransition((current) => {
      if (current.to === tab) return current;

      return {
        from: current.to,
        to: tab,
        direction: getTabDirection(current.to, tab),
        nonce: current.nonce + 1,
      };
    });
  }, [tab]);

  useEffect(() => {
    if (pageTransition.from == null) return;

    const timer = window.setTimeout(() => {
      setPageTransition((current) =>
        current.nonce === pageTransition.nonce
          ? { ...current, from: null }
          : current
      );
    }, PAGE_TRANSITION_MS);

    return () => window.clearTimeout(timer);
  }, [pageTransition.from, pageTransition.nonce]);

  const renderPage = (pageTab: Tab) => {
    if (pageTab === "timeline") {
      return <Timeline onOpenSchedule={openSchedule} />;
    }

    if (pageTab === "trail") {
      return <Trail />;
    }

    return (
      <TermSchedule
        termNumber={scheduleTerm}
        onTermChange={setScheduleTerm}
        onBack={() => setTab("timeline")}
      />
    );
  };

  const transitioning =
    pageTransition.from != null && pageTransition.from !== pageTransition.to;

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-sub/15 px-6 py-2.5 flex items-center justify-between bg-card/70 backdrop-blur">
        <div className="flex items-center gap-6">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setTab("timeline");
            }}
            className="text-base text-brand tracking-tight"
          >
            学旅
          </a>
          <div className="flex items-center gap-0.5">
            <NavTab active={tab === "timeline"} onClick={() => setTab("timeline")}>
              时间轴
            </NavTab>
            <NavTab active={tab === "trail"} onClick={() => setTab("trail")}>
              旅迹
            </NavTab>
            <NavTab active={tab === "term-schedule"} onClick={() => setTab("term-schedule")}>
              学期课表
            </NavTab>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <AccountMenu me={me} onSignedOut={onSignedOut} />
        </div>
      </nav>

      <main className="page-transition-stage">
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
          className={
            "page-transition-layer " +
            (transitioning ? "page-transition-enter" : "")
          }
          data-direction={pageTransition.direction}
        >
          {renderPage(pageTransition.to)}
        </div>
      </main>
    </div>
  );
}

function NavTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-1 text-xs rounded-md transition-colors " +
        (active
          ? "text-ink bg-sub/10"
          : "text-sub hover:text-ink hover:bg-sub/5")
      }
    >
      {children}
    </button>
  );
}
