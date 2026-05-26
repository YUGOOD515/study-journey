import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import {
  bundleByCategory,
  computeRequirementRows,
  toInstances,
  type CategoryBundle,
  type CourseInstance,
  type RequirementRow,
} from "../lib/progress";
import { TERM_LABEL } from "../lib/offeredTerm";
import { ProgressBar } from "../components/ProgressBar";
import type {
  CreditCountTo,
  PlanCustomCourse,
  PlanProgramCourse,
  ProgramRequirement,
} from "../types";

export default function Trail() {
  const [programCourses, setProgramCourses] = useState<PlanProgramCourse[]>([]);
  const [customCourses, setCustomCourses] = useState<PlanCustomCourse[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const refetchAll = useCallback(async () => {
    const [p, c] = await Promise.all([api.planCourses(), api.customCourses()]);
    setProgramCourses(p);
    setCustomCourses(c);
  }, []);

  useEffect(() => {
    Promise.all([api.planCourses(), api.customCourses(), api.programRequirements()])
      .then(([p, c, r]) => {
        setProgramCourses(p);
        setCustomCourses(c);
        setReqs(r);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const instances = useMemo(
    () => toInstances(programCourses, customCourses),
    [programCourses, customCourses]
  );

  const bundles = useMemo(
    () => bundleByCategory(computeRequirementRows(reqs, instances)),
    [reqs, instances]
  );

  const overall = useMemo(() => {
    const required = bundles.reduce((s, b) => s + b.totalRequired, 0);
    const earned = bundles.reduce((s, b) => s + b.totalEarned, 0);
    const planned = bundles.reduce((s, b) => s + b.totalPlanned, 0);
    return {
      required: round1(required),
      earned: round1(earned),
      planned: round1(planned),
    };
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
          已修在前 · 计划修读在后 · 点课程填成绩
        </div>
      </header>

      {/* 总览 */}
      <section className="bg-card border border-sub/15 rounded-xl p-6 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm text-sub">总进度</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl text-ink tabular-nums">{overall.earned}</span>
            <span className="text-sub tabular-nums">/ {overall.required} 学分</span>
            <span className="ml-3 text-xs text-sub tabular-nums">
              ({overallPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mb-2 text-[11px] text-sub">
          <span>我的计划预览</span>
          <span className="tabular-nums">
            + {overall.planned} 学分，预计 {round1(overall.earned + overall.planned)}
          </span>
        </div>
        <ProgressBar
          earned={overall.earned}
          required={overall.required}
          color="#c96442"
          trackColor="rgba(201,100,66,0.10)"
          planned={overall.planned}
        />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bundles.map((b) => (
          <CategoryCard
            key={b.code}
            bundle={b}
            expandedKeys={expanded}
            onToggle={toggle}
            onRefetch={refetchAll}
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
      <div className="mb-3 text-[11px] text-sub tabular-nums">
        我的计划预览 + {bundle.totalPlanned} 学分
      </div>

      <div className="space-y-3">
        {bundle.rows.map((row) => {
          const key = `${bundle.code}-${row.requirementTypeCode}`;
          const isOpen = expandedKeys.has(key);
          const rowPct =
            row.requiredCredits > 0
              ? (row.earnedCredits / row.requiredCredits) * 100
              : 0;
          return (
            <div key={key}>
              <button onClick={() => onToggle(key)} className="w-full text-left group">
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sub group-hover:text-ink transition-colors">
                      {row.requirementName}
                    </span>
                    <span className="text-sub/60 tabular-nums">
                      ({row.earnedCourses.length} 门已修 · {row.plannedCourses.length} 门计划)
                    </span>
                  </div>
                  <div className="tabular-nums" style={{ color: style.text }}>
                    {row.earnedCredits}
                    {row.plannedCredits > 0 && (
                      <span className="text-sub/70 ml-1">+{row.plannedCredits}</span>
                    )}
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
                  planned={row.plannedCredits}
                />
              </button>

              {isOpen && (
                <CourseStatusList row={row} color={style.text} onRefetch={onRefetch} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CourseStatusList({
  row,
  color,
  onRefetch,
}: {
  row: RequirementRow;
  color: string;
  onRefetch: () => Promise<void>;
}) {
  if (row.earnedCourses.length === 0 && row.plannedCourses.length === 0) {
    return (
      <div className="mt-2 text-[11px] text-sub/60 italic px-1">
        暂无已修或计划课程
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {row.earnedCourses.length > 0 && (
        <CourseGroup label="已修">
          {row.earnedCourses.map((c) => (
            <CoursePill
              key={`earned-${c.source}-${c.course_code}`}
              course={c}
              color={color}
              kind="earned"
              onRefetch={onRefetch}
            />
          ))}
        </CourseGroup>
      )}

      {row.plannedCourses.length > 0 && (
        <CourseGroup label="计划修读">
          {row.plannedCourses.map((c) => (
            <CoursePill
              key={`planned-${c.source}-${c.course_code}`}
              course={c}
              color={color}
              kind="planned"
              onRefetch={onRefetch}
            />
          ))}
        </CourseGroup>
      )}
    </div>
  );
}

function CourseGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-14 shrink-0 pt-1 text-[10px] text-sub/65">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function CoursePill({
  course,
  color,
  kind,
  onRefetch,
}: {
  course: CourseInstance;
  color: string;
  kind: "earned" | "planned";
  onRefetch: () => Promise<void>;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor(r);
  };
  const close = () => setAnchor(null);

  const isCustom = course.source === "custom";
  const hasScore = course.score != null;
  const isPlanned = kind === "planned";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        className={
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer " +
          (isPlanned
            ? "border border-dashed bg-sub/5 hover:bg-sub/10"
            : "bg-sub/10 hover:bg-sub/20")
        }
        style={{
          color,
          borderColor: isPlanned ? "rgb(var(--sub) / 0.25)" : undefined,
        }}
        title={course.course_code}
      >
        {isCustom && (
          <span className="px-1 rounded-sm bg-sub/10 text-[9px] text-sub">自</span>
        )}
        <span>{course.course_name}</span>
        <span className="text-sub/70 tabular-nums">{course.credits}</span>
        {isPlanned ? (
          <>
            <span className="text-sub/55 tabular-nums">
              {course.planned_term == null
                ? "待安排"
                : TERM_LABEL[course.planned_term]}
            </span>
            <span className="ml-1 pl-1.5 border-l border-sub/25 tabular-nums text-[10px] text-sub/70">
              填成绩
            </span>
          </>
        ) : (
          <span
            className="ml-1 pl-1.5 border-l border-sub/25 tabular-nums text-[10px]"
            style={{ color: hasScore ? color : "rgb(var(--sub) / 0.55)" }}
          >
            {hasScore ? course.score : "—"}
          </span>
        )}
      </button>
      {anchor &&
        createPortal(
          <ScorePopover
            anchor={anchor}
            course={course}
            kind={kind}
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
  kind,
  onClose,
  onSaved,
}: {
  anchor: DOMRect;
  course: CourseInstance;
  kind: "earned" | "planned";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [val, setVal] = useState<string>(course.score != null ? String(course.score) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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
    if (kind === "planned" && newScore == null) {
      setErr("计划课程需要填写成绩后才会计入已修");
      return;
    }
    if (kind === "planned" && course.planned_term == null) {
      setErr("「待安排」的课程需先拖到某个学期后才能填成绩");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      if (newScore != null) {
        // 填分数 → 标记为已修读；actual_term 同步到 planned_term
        if (course.source === "program") {
          await api.patchPlanCourse(course.course_code, {
            score: newScore,
            study_status: "已修读",
            actual_term: course.planned_term,
          });
        } else {
          await api.patchCustomCourse(course.course_code, {
            score: newScore,
            study_status: "已修读",
          });
        }
      } else {
        // 清空分数 → 回到未修读
        if (course.source === "program") {
          await api.patchPlanCourse(course.course_code, {
            score: null,
            study_status: "未修读",
            actual_term: null,
          });
        } else {
          await api.patchCustomCourse(course.course_code, {
            score: null,
            study_status: "未修读",
          });
        }
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

  // 经法管融通课程可切换 credit_count_to
  const isInter =
    course.requirement_type === "经法管融通" ||
    (course.course_subcategory?.includes("经法管融通") ?? false);

  const toggleCreditFlow = async () => {
    if (!isInter) return;
    const next: CreditCountTo =
      course.credit_count_to === "通识教育-选修" ? "大类平台-选修" : "通识教育-选修";
    setBusy(true);
    setErr(null);
    try {
      if (course.source === "program") {
        await api.patchPlanCourse(course.course_code, { credit_count_to: next });
      } else {
        await api.patchCustomCourse(course.course_code, { credit_count_to: next });
      }
      await onSaved();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setBusy(false);
    }
  };

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
        <div className="text-[12px] text-ink truncate" title={course.course_name}>
          {course.course_name}
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

      {isInter && (
        <div className="mt-2 pt-2 border-t border-sub/10">
          <div className="text-[10px] text-sub mb-1">学分流向</div>
          <button
            type="button"
            onClick={toggleCreditFlow}
            disabled={busy}
            className="text-[11px] text-ink hover:bg-sub/10 rounded-md px-2 py-1 transition-colors disabled:opacity-50"
          >
            {course.credit_count_to ?? "未设置"} ↔ 切换
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 min-h-[14px]">
        {kind === "planned" ? (
          <div className="text-[10px] text-sub/70">保存后进入已修进度</div>
        ) : (
          <button
            type="button"
            onClick={() => void persist(null)}
            disabled={busy}
            className="text-[10px] text-sub hover:text-ink transition-colors disabled:opacity-50"
          >
            清空分数
          </button>
        )}
        {err && <div className="text-[10px] text-red-500">{err}</div>}
      </div>
    </div>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
