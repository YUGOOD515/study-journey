import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import {
  bundleByCategory,
  computeRequirementRows,
  type CategoryBundle,
  type EarnedCourse,
  type RequirementRow,
} from "../lib/progress";
import { ProgressBar } from "../components/ProgressBar";
import type {
  CourseWithCategory,
  ProgramRequirement,
  SemesterCourse,
} from "../types";

export default function Trail() {
  const [courses, setCourses] = useState<CourseWithCategory[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
  const [done, setDone] = useState<SemesterCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      api.coursesWithCategory(),
      api.programRequirements(),
      api.semesterCourses(),
    ])
      .then(([c, r, d]) => {
        setCourses(c);
        setReqs(r);
        setDone(d);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const refetchDone = useCallback(async () => {
    const d = await api.semesterCourses();
    setDone(d);
  }, []);

  const bundles = useMemo(
    () => bundleByCategory(computeRequirementRows(reqs, courses, done)),
    [reqs, courses, done]
  );

  const overall = useMemo(() => {
    const required = bundles.reduce((s, b) => s + b.totalRequired, 0);
    const earned = bundles.reduce((s, b) => s + b.totalEarned, 0);
    return { required: round1(required), earned: round1(earned) };
  }, [bundles]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sub">
        加载中…
      </div>
    );
  }
  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        加载失败：{err}
      </div>
    );
  }

  const overallPct =
    overall.required > 0 ? (overall.earned / overall.required) * 100 : 0;

  return (
    <div className="min-h-screen px-8 py-6">
      <header className="mb-6">
        <h1 className="text-lg text-ink">旅迹</h1>
        <div className="text-[11px] text-sub mt-0.5">
          按培养方案对账 · 5 大板块进度 · 点药丸快填成绩
        </div>
      </header>

      {/* 总览 */}
      <section className="bg-card border border-sub/15 rounded-xl p-6 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm text-sub">总进度</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl text-ink tabular-nums">
              {overall.earned}
            </span>
            <span className="text-sub tabular-nums">
              / {overall.required} 学分
            </span>
            <span className="ml-3 text-xs text-sub tabular-nums">
              ({overallPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <ProgressBar
          earned={overall.earned}
          required={overall.required}
          color="#c96442"
          trackColor="rgba(201,100,66,0.10)"
        />
      </section>

      {/* 5 个板块 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bundles.map((b) => (
          <CategoryCard
            key={b.code}
            bundle={b}
            expandedKeys={expanded}
            onToggle={toggle}
            onRefetch={refetchDone}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({
  bundle,
  expandedKeys,
  onToggle,
  onRefetch,
}: {
  bundle: CategoryBundle;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  onRefetch: () => Promise<void>;
}) {
  const style = CATEGORY_STYLE[bundle.code];
  const pct =
    bundle.totalRequired > 0
      ? (bundle.totalEarned / bundle.totalRequired) * 100
      : 0;

  return (
    <div className="bg-card border border-sub/15 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: style.color }}
          />
          <h2 className="text-base text-ink">{bundle.name}</h2>
        </div>
        <div className="text-xs text-sub tabular-nums">
          <span className="text-ink text-base mr-1">{bundle.totalEarned}</span>
          / {bundle.totalRequired} 学分 · {pct.toFixed(1)}%
        </div>
      </div>

      <div className="space-y-3">
        {bundle.rows.map((row) => {
          const key = `${bundle.code}-${row.requirementType}`;
          const isOpen = expandedKeys.has(key);
          const rowPct =
            row.requiredCredits > 0
              ? (row.earnedCredits / row.requiredCredits) * 100
              : 0;
          return (
            <div key={key}>
              <button
                onClick={() => onToggle(key)}
                className="w-full text-left group"
              >
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sub group-hover:text-ink transition-colors">
                      {row.requirementName}
                    </span>
                    <span className="text-sub/60 tabular-nums">
                      ({row.earnedCourses.length} 门)
                    </span>
                  </div>
                  <div className="tabular-nums" style={{ color: style.text }}>
                    {row.earnedCredits}
                    <span className="text-sub mx-0.5">/</span>
                    {row.requiredCredits}
                    <span className="text-sub/60 ml-1.5 text-[10px]">
                      {rowPct.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <ProgressBar
                  earned={row.earnedCredits}
                  required={row.requiredCredits}
                  color={style.color}
                  trackColor={style.bgGhost}
                />
              </button>

              {isOpen && (
                <EarnedList
                  row={row}
                  color={style.text}
                  onRefetch={onRefetch}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EarnedList({
  row,
  color,
  onRefetch,
}: {
  row: RequirementRow;
  color: string;
  onRefetch: () => Promise<void>;
}) {
  if (row.earnedCourses.length === 0) {
    return (
      <div className="mt-2 text-[11px] text-sub/60 italic px-1">
        暂无已修课程
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {row.earnedCourses.map((c) => (
        <ScorePill
          key={`${c.source}-${c.courseCode ?? c.id}`}
          course={c}
          color={color}
          onRefetch={onRefetch}
        />
      ))}
    </div>
  );
}

// ── 可点击的"成绩药丸" + popover 输入框 ─────────────────
function ScorePill({
  course,
  color,
  onRefetch,
}: {
  course: EarnedCourse;
  color: string;
  onRefetch: () => Promise<void>;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const score = course.score;
  const hasScore = score != null;

  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor(r);
  };
  const close = () => setAnchor(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-sub/10 hover:bg-sub/20 transition-colors cursor-pointer"
        style={{ color }}
        title={course.source === "official" ? course.courseCode ?? "" : "手动添加"}
      >
        {course.source === "manual" && (
          <span className="px-1 rounded-sm bg-sub/10 text-[9px] text-sub">自</span>
        )}
        <span>{course.courseName}</span>
        <span className="text-sub/70 tabular-nums">{course.credits}</span>
        <span
          className="ml-1 pl-1.5 border-l border-sub/25 tabular-nums text-[10px]"
          style={{ color: hasScore ? color : "rgb(var(--sub) / 0.55)" }}
        >
          {hasScore ? score : "—"}
        </span>
      </button>
      {anchor &&
        createPortal(
          <ScorePopover
            anchor={anchor}
            course={course}
            initialScore={score ?? null}
            onClose={close}
            onSaved={async () => {
              await onRefetch();
              close();
            }}
          />,
          document.body
        )}
    </>
  );
}

function ScorePopover({
  anchor,
  course,
  initialScore,
  onClose,
  onSaved,
}: {
  anchor: DOMRect;
  course: EarnedCourse;
  initialScore: number | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [val, setVal] = useState<string>(
    initialScore != null ? String(initialScore) : ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const persist = async (newScore: number | null) => {
    setBusy(true);
    setErr(null);
    try {
      if (course.source === "manual") {
        if (course.id == null) throw new Error("手动课缺少 id");
        await api.patchManual(course.id, { score: newScore });
      } else {
        if (!course.courseCode) throw new Error("官方课缺少课程号");
        await api.patchOfficial(course.courseCode, { score: newScore });
      }
      await onSaved();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = val.trim();
    if (t === "") {
      void persist(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setErr("分数需在 0–100 之间");
      return;
    }
    void persist(n);
  };

  // 默认放在按钮下方；右侧超出屏幕则左对齐到屏右边距
  const W = 240;
  const top = anchor.bottom + 6;
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const left = Math.min(anchor.left, screenW - W - 12);

  return (
    <div
      ref={rootRef}
      className="fixed z-50 bg-card border border-sub/20 rounded-lg p-3"
      style={{
        top,
        left,
        width: W,
        boxShadow:
          "0 14px 36px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 2px 8px rgb(var(--shadow-rgb) / var(--shadow-soft))",
      }}
    >
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div className="text-[12px] text-ink truncate" title={course.courseName}>
          {course.courseName}
        </div>
        <div className="text-[10px] text-sub tabular-nums shrink-0">
          {course.credits} 学分
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.1"
          value={val}
          autoFocus
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0–100"
          className="flex-1 px-2 py-1 rounded-md bg-bg border border-sub/30 text-ink text-[12px] tabular-nums focus:outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-2.5 py-1 rounded-md text-[11px] text-white disabled:opacity-50"
          style={{ backgroundColor: "rgb(var(--brand) / 1)" }}
        >
          {busy ? "…" : "保存"}
        </button>
      </form>

      <div className="flex items-center justify-between mt-2 min-h-[14px]">
        <button
          type="button"
          onClick={() => void persist(null)}
          disabled={busy}
          className="text-[10px] text-sub hover:text-ink transition-colors disabled:opacity-50"
        >
          清空分数
        </button>
        {err && <div className="text-[10px] text-red-500">{err}</div>}
      </div>
    </div>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
