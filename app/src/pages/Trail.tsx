import { useCallback, useEffect, useMemo, useState } from "react";
import { PenLine } from "lucide-react";
import { api } from "../lib/api";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { formatCredits, roundCredits } from "../lib/credits";
import {
  bundlesFromProgress,
  flowItemsFromProgress,
  type CategoryBundle,
  type EarnedCourse,
  type PlannedCourse,
  type RequirementRow,
} from "../lib/progress";
import { TERM_LABEL } from "../lib/offeredTerm";
import { ProgressBar } from "../components/ProgressBar";
import { InterdisciplinaryFlow, type FlowItem } from "../components/InterdisciplinaryFlow";
import { myPlanTotalCredits } from "../lib/planTotal";
import { useEditMode } from "../lib/editMode";
import { Button, inputClass, notify, PageError, Popover, PopoverContent, PopoverTrigger, Skeleton } from "../components/ui";
import type {
  Course,
  ProgressResponse,
} from "../types";

export default function Trail() {
  const { editing } = useEditMode();
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [planInputs, setPlanInputs] = useState<{
    courses: Course[];
    personalPlan: Course[];
    done: Course[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      api.progress(),
      api.coursesWithCategory(),
      api.personalPlan(),
      api.semesterCourses(),
    ])
      .then(([p, courses, personalPlan, done]) => {
        setProgress(p);
        setPlanInputs({ courses, personalPlan, done });
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const refetchTrailData = useCallback(async () => {
    const [p, courses, personalPlan, done] = await Promise.all([
      api.progress(),
      api.coursesWithCategory(),
      api.personalPlan(),
      api.semesterCourses(),
    ]);
    setProgress(p);
    setPlanInputs({ courses, personalPlan, done });
  }, []);

  const bundles = useMemo(
    () => (progress ? bundlesFromProgress(progress, api.idForCourse) : []),
    [progress]
  );

  const totals = useMemo(() => {
    const t = progress?.totals;
    return {
      required: roundCredits(t?.required ?? 0),
      earned: roundCredits(t?.earned ?? 0),
      inProgress: roundCredits(t?.inProgress ?? 0),
      planned: roundCredits(t?.planned ?? 0),
      pending: roundCredits(t?.pending ?? 0),
    };
  }, [progress]);

  // “我的计划合计”：与时间轴页同一套口径（lib/planTotal）
  const planTotal = useMemo(
    () =>
      planInputs
        ? myPlanTotalCredits(planInputs.courses, planInputs.personalPlan, planInputs.done)
        : 0,
    [planInputs]
  );

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 经法管融通 流向图 items —— 全部来自后端进度结果（唯一真相源）
  // 注意：所有 hooks 必须在早 return 之前调用，否则违反 Rules of Hooks
  const flowItems: FlowItem[] = useMemo(
    () => (progress ? flowItemsFromProgress(progress, api.idForCourse) : []),
    [progress]
  );

  const interdisciplinaryTotal = useMemo(() => {
    for (const b of bundles) {
      for (const row of b.rows) {
        if (row.requirementType === "interdisciplinary") {
          return { earned: row.earnedCredits, required: row.requiredCredits };
        }
      }
    }
    return { earned: 0, required: 0 };
  }, [bundles]);

  const electiveTotalByCategory = useMemo(() => {
    const m = new Map<string, { earned: number; required: number }>();
    for (const b of bundles) {
      for (const row of b.rows) {
        if (row.requirementType === "elective") {
          m.set(b.code, {
            earned: row.earnedCredits,
            required: row.requiredCredits,
          });
        }
      }
    }
    return m;
  }, [bundles]);

  const toggleItem = useCallback(
    async (item: FlowItem) => {
      const next =
        item.assignment === "interdisciplinary" ? "elective" : "interdisciplinary";
      try {
        const [kind, raw] = item.key.split(":");
        if (kind === "official") {
          await api.setCreditAssignment(raw, next);
        } else if (kind === "record") {
          await api.patchManual(raw, { assigned_to: next });
        } else if (kind === "plan") {
          await api.patchPersonalPlan(raw, { assigned_to: next });
        }
        await refetchTrailData();
      } catch (e) {
        console.error(e);
      }
    },
    [refetchTrailData]
  );

  if (err) return <PageError message={err} onRetry={() => window.location.reload()} />;
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-9">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="mt-6 h-[180px] rounded-2xl" />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[220px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const pct =
    totals.required > 0 ? Math.min(100, (totals.earned / totals.required) * 100) : 0;
  const interOverflow = progress?.overflow.interdisciplinary ?? null;

  return (
    <div className="relative min-h-screen">
      {/* 顶部暖色氛围光 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px]"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 0%, rgb(var(--brand) / 0.07), transparent 72%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-9 lg:px-8">
        {/* 标题 */}
        <header className="trail-rise" style={{ animationDelay: "0ms" }}>
          <div className="text-[10px] tracking-[0.32em] text-faint uppercase mb-1.5">
            Study Journey
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl text-ink tracking-tight">旅迹</h1>
            <span className="text-[11px] text-sub">
              {editing ? "已修在前 · 计划在后 · 点课程可填成绩" : "已修在前 · 计划在后 · 查看中，切换到编辑后可填成绩"}
            </span>
          </div>
        </header>

        {/* 总览 */}
        <section
          className="trail-rise mt-6 rounded-2xl border border-sub/15 bg-card p-4 sm:p-6 md:p-8"
          style={{
            animationDelay: "70ms",
            boxShadow:
              "0 1px 2px rgb(var(--shadow-rgb) / var(--shadow-soft)), 0 24px 48px -32px rgb(var(--shadow-rgb) / var(--shadow-strong))",
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-7 sm:gap-9">
            <Ring pct={pct} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-stretch gap-x-7 gap-y-3 mb-5">
                <Stat label="已修" value={totals.earned} dotOpacity={1} />
                <Stat label="在修" value={totals.inProgress} dotOpacity={0.55} />
                <Stat label="计划" value={totals.planned} dotOpacity={0.26} />
                <Stat label="待修" value={totals.pending} muted />
              </div>
              <ProgressBar
                earned={totals.earned}
                inProgress={totals.inProgress}
                planned={totals.planned}
                required={totals.required}
                color="rgb(var(--brand) / 1)"
                height={12}
              />
              <div className="mt-2.5 flex items-baseline justify-between text-[11px] text-sub">
                <span className="tabular-nums">
                  共需 <span className="text-ink">{formatCredits(totals.required)}</span> 学分
                </span>
                <span className="tabular-nums">
                  我的计划合计 <span className="text-ink">{formatCredits(planTotal)}</span> 学分
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 经法管融通学分流向（仅当有该类课程时显示） */}
        {flowItems.length > 0 && (
          <section
            className="trail-rise mt-5 rounded-2xl border border-sub/15 bg-card p-4 sm:p-5"
            style={{ animationDelay: "130ms" }}
          >
            <div className="mb-3">
              <h2 className="text-xs text-ink flex items-center gap-2">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "rgb(var(--cat-mp) / 1)" }}
                />
                学分流向 · 经法管融通
              </h2>
              <div className="text-[10px] text-sub mt-1">
                {editing ? "点击课程或连线切换归属 · " : ""}计入「大类平台」上限 {interOverflow?.cap ?? 6} 学分，超出自动计入「通识教育·选修」
              </div>
            </div>
            <InterdisciplinaryFlow
              items={flowItems}
              onToggle={toggleItem}
              disabled={!editing}
              interdisciplinaryTotal={interdisciplinaryTotal}
              electiveTotalByCategory={electiveTotalByCategory}
            />
            {interOverflow && interOverflow.overflowCredits > 0 && (
              <div className="mt-3 text-[10px] leading-relaxed" style={{ color: "rgb(var(--brand) / 1)" }}>
                大类平台·经法管已达 {interOverflow.cap} 学分上限，超出的{" "}
                {formatCredits(interOverflow.overflowCredits)} 学分已自动计入「通识教育·选修」：
                {interOverflow.overflowCourses.map((c) => c.courseName).join("、")}
              </div>
            )}
          </section>
        )}

        {/* 五大板块 */}
        <div className="mt-8 mb-3 text-[10px] tracking-[0.28em] text-faint uppercase">
          培养方案 · 五大板块
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {bundles.map((b, i) => (
            <CategoryCard
              key={b.code}
              bundle={b}
              index={i}
              expandedKeys={expanded}
              onToggle={toggle}
              onRefetch={refetchTrailData}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 总览进度环：沿描边画出弧线，中心显示百分比。 */
function Ring({ pct }: { pct: number }) {
  const size = 128;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--sub) / 0.13)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--brand) / 1)"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{
            ["--ring-arc" as string]: `${arc}`,
            strokeDasharray: `${arc} ${c}`,
            animation: "ringDraw 1100ms cubic-bezier(0.22,1,0.36,1) both",
          } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] leading-none text-ink tabular-nums">
          {pct.toFixed(0)}
          <span className="text-sm text-sub align-top ml-0.5">%</span>
        </span>
        <span className="text-[10px] text-faint mt-1 tracking-[0.2em]">完成</span>
      </div>
    </div>
  );
}

/** 总览四态统计项：已修 / 在修 / 计划 / 待修。 */
function Stat({
  label,
  value,
  dotOpacity,
  muted,
}: {
  label: string;
  value: number;
  dotOpacity?: number;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[10px] text-sub">
        {muted ? (
          <span className="inline-block w-1.5 h-1.5 rounded-full border border-sub/45" />
        ) : (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "rgb(var(--brand) / 1)", opacity: dotOpacity }}
          />
        )}
        {label}
      </div>
      <div className="text-[19px] leading-none text-ink tabular-nums">
        {formatCredits(value)}
      </div>
    </div>
  );
}

function CategoryCard({
  bundle,
  index,
  expandedKeys,
  onToggle,
  onRefetch,
}: {
  bundle: CategoryBundle;
  index: number;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  onRefetch: () => Promise<void>;
}) {
  const style = CATEGORY_STYLE[bundle.code];
  const pct =
    bundle.totalRequired > 0
      ? Math.min(100, (bundle.totalEarned / bundle.totalRequired) * 100)
      : bundle.totalEarned > 0
        ? 100
        : 0;
  const preview = roundCredits(bundle.totalInProgress + bundle.totalPlanned);

  return (
    <div
      className="trail-rise relative bg-card border border-sub/15 rounded-2xl pl-6 pr-5 py-5 overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-sub/25 hover:shadow-[0_18px_36px_-26px_rgb(var(--shadow-rgb)/var(--shadow-strong))]"
      style={{ animationDelay: `${150 + index * 70}ms` }}
    >
      {/* 类别色脊 */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: style.color }}
      />

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-[3px]"
            style={{ backgroundColor: style.color }}
          />
          <h2 className="text-[15px] text-ink">{bundle.name}</h2>
        </div>
        <div className="text-xs text-sub tabular-nums">
          <span className="text-ink text-lg mr-0.5">{formatCredits(bundle.totalEarned)}</span>
          <span className="text-faint">/ {formatCredits(bundle.totalRequired)}</span>
          <span className="ml-2" style={{ color: style.text }}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="mb-3 h-[14px] text-[10px] text-faint tabular-nums">
        {preview > 0 ? `计划预览 +${formatCredits(preview)} 学分` : ""}
      </div>
      <ProgressBar
        earned={bundle.totalEarned}
        inProgress={bundle.totalInProgress}
        planned={bundle.totalPlanned}
        required={bundle.totalRequired}
        color={style.color}
        trackColor={style.bgGhost}
        height={8}
      />

      <div className="mt-5 space-y-3.5">
        {bundle.rows.map((row) => {
          const key = `${bundle.code}-${row.requirementType}`;
          const isOpen = expandedKeys.has(key);
          const rowPct =
            row.requiredCredits > 0
              ? Math.min(100, (row.earnedCredits / row.requiredCredits) * 100)
              : row.earnedCredits > 0
                ? 100
                : 0;
          const rowPreview = roundCredits(row.inProgressCredits + row.plannedCredits);
          return (
            <div key={key}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => onToggle(key)}
                className="w-full text-left group/row"
              >
                <div className="flex items-baseline justify-between text-xs mb-1.5 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sub group-hover/row:text-ink transition-colors truncate">
                      {row.requirementName}
                    </span>
                    <span className="text-faint tabular-nums shrink-0">
                      {row.earnedCourses.length} 已修 · {row.plannedCourses.length} 计划
                    </span>
                  </div>
                  <div className="tabular-nums shrink-0" style={{ color: style.text }}>
                    {formatCredits(row.earnedCredits)}
                    {rowPreview > 0 && (
                      <span className="text-faint ml-0.5">+{formatCredits(rowPreview)}</span>
                    )}
                    <span className="text-faint mx-1">/</span>
                    <span className="text-sub">{formatCredits(row.requiredCredits)}</span>
                    <span className="text-faint ml-1.5 text-[10px]">{rowPct.toFixed(0)}%</span>
                  </div>
                </div>
                <ProgressBar
                  earned={row.earnedCredits}
                  inProgress={row.inProgressCredits}
                  planned={row.plannedCredits}
                  required={row.requiredCredits}
                  color={style.color}
                  trackColor={style.bgGhost}
                  height={6}
                />
              </button>

              {isOpen && (
                <CourseStatusList
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
      <div className="mt-2 text-[11px] text-faint italic px-1">
        暂无已修或计划课程
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {row.earnedCourses.length > 0 && (
        <CourseGroup label="已修">
          {row.earnedCourses.map((c) => (
            <ScorePill
              key={`earned-${c.source}-${c.courseCode}`}
              course={c}
              color={color}
              onRefetch={onRefetch}
            />
          ))}
        </CourseGroup>
      )}

      {row.plannedCourses.length > 0 && (
        <CourseGroup label="计划修读">
          {row.plannedCourses.map((c) => (
            <PlannedCoursePill
              key={`planned-${c.source}-${c.courseCode}-${c.courseName}`}
              course={c}
              color={color}
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
      <div className="w-14 shrink-0 pt-1 text-[10px] text-faint">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// ── 成绩药丸：编辑模式下点击弹出成绩输入（Radix Popover） ─────────────────
function ScorePill({
  course,
  color,
  onRefetch,
}: {
  course: EarnedCourse;
  color: string;
  onRefetch: () => Promise<void>;
}) {
  const { editing } = useEditMode();
  const [open, setOpen] = useState(false);
  const score = course.score;
  const hasScore = score != null;

  const pill = (
    <button
      type="button"
      disabled={!editing}
      className="inline-flex min-h-[26px] items-center gap-1 rounded-md bg-sub/10 px-2 py-0.5 text-[11px] transition-colors enabled:hover:bg-sub/20 disabled:cursor-default data-[state=open]:bg-sub/20"
      style={{ color }}
      title={course.source === "official" ? course.courseCode ?? "" : "手动添加"}
    >
      {course.source === "manual" && <span className="rounded-sm bg-sub/10 px-1 text-[9px] text-sub">自</span>}
      <span>{course.courseName}</span>
      <span className="num text-sub">{formatCredits(course.credits)}</span>
      <span
        className="num ml-1 border-l border-sub/25 pl-1.5 text-[10px]"
        style={{ color: hasScore ? color : "rgb(var(--faint) / 1)" }}
      >
        {hasScore ? score : "—"}
      </span>
    </button>
  );

  if (!editing) return pill;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{pill}</PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-3">
        <ScoreForm
          course={course}
          initialScore={score ?? null}
          onSaved={async () => {
            await onRefetch();
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function PlannedCoursePill({
  course,
  color,
  onRefetch,
}: {
  course: PlannedCourse;
  color: string;
  onRefetch: () => Promise<void>;
}) {
  const { editing } = useEditMode();
  const [open, setOpen] = useState(false);

  const pill = (
    <button
      type="button"
      disabled={!editing}
      className="inline-flex min-h-[26px] items-center gap-1 rounded-md border border-dashed bg-sub/5 px-2 py-0.5 text-[11px] transition-colors enabled:hover:bg-sub/10 disabled:cursor-default data-[state=open]:bg-sub/10"
      style={{ color, borderColor: "rgb(var(--sub) / 0.25)" }}
      title={course.source === "official" ? course.courseCode ?? "" : "计划课程"}
    >
      <span>{course.courseName}</span>
      <span className="num text-sub">{formatCredits(course.credits)}</span>
      <span className="num text-faint">
        {course.plannedTerm == null ? "待安排" : TERM_LABEL[course.plannedTerm]}
      </span>
      {editing && (
        <span className="ml-1 inline-flex items-center gap-0.5 border-l border-sub/25 pl-1.5 text-[10px] text-sub">
          <PenLine size={10} />
          成绩
        </span>
      )}
    </button>
  );

  if (!editing) return pill;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{pill}</PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-3">
        <ScoreForm
          course={course}
          initialScore={null}
          onSaved={async () => {
            await onRefetch();
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type ScoreEditableCourse = EarnedCourse | PlannedCourse;

function ScoreForm({
  course,
  initialScore,
  onSaved,
}: {
  course: ScoreEditableCourse;
  initialScore: number | null;
  onSaved: () => Promise<void>;
}) {
  const [val, setVal] = useState<string>(initialScore != null ? String(initialScore) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const persist = async (newScore: number | null) => {
    const isPlanned = isPlannedCourse(course);
    if (isPlanned && newScore == null) {
      setErr("计划课程需要填写成绩后才会计入已修");
      return;
    }
    if (isPlanned && course.plannedTerm == null) {
      setErr("「待安排」的课程需先安排到某个学期后才能填成绩");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      if (isPlanned) {
        if (course.plannedTerm == null) {
          throw new Error("plannedTerm 不应为 null（已在前面拦截）");
        }
        const plannedTerm = course.plannedTerm;
        if (course.source === "manual") {
          const courseNature = course.courseNature === "跨专业" ? "选修" : course.courseNature;
          if (course.origin === "record") {
            if (!course.courseCode) throw new Error("手动课缺少 courseCode");
            await api.patchManual(course.courseCode, { score: newScore });
          } else {
            if (!course.courseCode) throw new Error("计划课程缺少 courseCode");
            await api.patchManual(course.courseCode, {
              term_number: plannedTerm,
              score: newScore,
              note: "由计划转为已修",
              course_nature: courseNature,
            });
          }
        } else {
          if (!course.courseCode) throw new Error("官方课缺少课程号");
          await api.upsertOfficial({
            term_number: plannedTerm,
            course_code: course.courseCode,
            score: newScore,
          });
        }
      } else if (course.source === "manual") {
        if (!course.courseCode) throw new Error("手动课缺少 courseCode");
        await api.patchManual(course.courseCode, { score: newScore });
      } else {
        if (!course.courseCode) throw new Error("官方课缺少课程号");
        await api.patchOfficial(course.courseCode, { score: newScore });
      }
      await onSaved();
      notify.success(newScore == null ? `已清空成绩：${course.courseName}` : `已保存成绩：${course.courseName} ${newScore}`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
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

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="truncate text-xs text-ink" title={course.courseName}>
          {course.courseName}
        </div>
        <div className="num shrink-0 text-[10px] text-sub">{formatCredits(course.credits)} 学分</div>
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
          aria-label="成绩"
          className={inputClass + " num h-8 flex-1"}
        />
        <Button type="submit" size="md" variant="primary" loading={busy}>
          保存
        </Button>
      </form>
      <div className="mt-2 flex min-h-[16px] items-center justify-between gap-2">
        {isPlannedCourse(course) ? (
          <div className="text-[10px] text-sub">保存后进入已修进度</div>
        ) : (
          <button
            type="button"
            onClick={() => void persist(null)}
            disabled={busy}
            className="text-[10px] text-sub transition-colors hover:text-ink disabled:opacity-50"
          >
            清空分数
          </button>
        )}
        {err && <div className="text-right text-[10px] text-danger">{err}</div>}
      </div>
    </div>
  );
}

function isPlannedCourse(course: ScoreEditableCourse): course is PlannedCourse {
  return !("score" in course);
}
