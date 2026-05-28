import { useState } from "react";
import Timeline from "./pages/Timeline";
import TermSchedule from "./pages/TermSchedule";
import Trail from "./pages/Trail";
import { ThemeToggle } from "./components/ThemeToggle";

type Tab = "timeline" | "trail" | "term-schedule";

export default function App() {
  const [tab, setTab] = useState<Tab>("timeline");
  const [scheduleTerm, setScheduleTerm] = useState(1);

  const openSchedule = (term: number) => {
    setScheduleTerm(term);
    setTab("term-schedule");
  };

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
        </div>
      </nav>

      <main>
        {tab === "timeline" && <Timeline onOpenSchedule={openSchedule} />}
        {tab === "trail" && <Trail />}
        {tab === "term-schedule" && (
          <TermSchedule
            termNumber={scheduleTerm}
            onTermChange={setScheduleTerm}
            onBack={() => setTab("timeline")}
          />
        )}
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
