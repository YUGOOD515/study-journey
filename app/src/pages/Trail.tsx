import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, PenLine } from "lucide-react";
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
import { ProgressBar, ProgressLegendSwatch } from "../components/ProgressBar";
import { InterdisciplinaryFlow, type FlowItem } from "../components/InterdisciplinaryFlow";
import { myPlanTotalCredits } from "../lib/planTotal";
import { useEditMode } from "../lib/editMode";
import { cn } from "../lib/cn";
import {
  Button,
  inputClass,
  Metric,
  notify,
  Page,
  PageError,
  PageHeader,
  Panel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SectionHeader,
  Skeleton,
} from "../components/ui";
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
      <Page>
        <div className="border-b border-line pb-3 pt-6 sm:pt-8">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="mt-6 h-[148px]" />
        <Skeleton className="mt-6 h-[360px]" />
      </Page>
    );
  }

  const pct = totals.required > 0 ? Math.min(100, (totals.earned / totals.required) * 100) : 0;
  const interOverflow = progress?.overflow.interdisciplinary ?? null;

  return (
    <Page>
      <PageHeader
        title="旅迹"
        meta={editing ? "按培养方案五大板块汇总学分；点击课程可填写成绩。" : "按培养方案五大板块汇总学分；切换到编辑后可填写成绩。"}
        metrics={
          <>
            <Metric label="完成度" value={pct.toFixed(0)} unit="%" />
            <Metric label="已修" value={formatCredits(totals.earned)} unit="学分" />
            <Metric label="要求" value={formatCredits(totals.required)} unit="学分" />
          </>
        }
      />

      {/* 总览 */}
      <section className="mt-6" aria-labelledby="trail-overview">
        <SectionHeader title={<span id="trail-overview">总览</span>} />
        <Panel className="mt-3 p-4 sm:p-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <OverviewStat level={0} label="已修" value={totals.earned} />
            <OverviewStat level={1} label="在修" value={totals.inProgress} />
            <OverviewStat level={2} label="计划" value={totals.planned} />
            <OverviewStat level={3} label="待修" value={totals.pending} />
          </dl>
          <div className="mt-5">
            <ProgressBar
              earned={totals.earned}
              inProgress={totals.inProgress}
              planned={totals.planned}
              required={totals.required}
              color="rgb(var(--ink))"
              height={8}
            />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4 text-2xs text-sub">
            <span>
              共需 <span className="num text-ink">{formatCredits(totals.required)}</span> 学分
            </span>
            <span>
              我的计划合计 <span className="num text-ink">{formatCredits(planTotal)}</span> 学分
            </span>
          </div>
        </Panel>
      </section>

      {/* 经法管融通学分归属（仅当有该类课程时显示） */}
      {flowItems.length > 0 && (
        <section className="mt-8" aria-labelledby="trail-flow">
          <SectionHeader
            title={<span id="trail-flow">经法管融通学分归属</span>}
            description={`计入「大类平台」上限 ${interOverflow?.cap ?? 6} 学分，超出部分自动计入「通识教育」选修。`}
          />
          <Panel className="mt-3 p-4 sm:p-5">
            <InterdisciplinaryFlow
              items={flowItems}
              onToggle={toggleItem}
              disabled={!editing}
              interdisciplinaryTotal={interdisciplinaryTotal}
              electiveTotalByCategory={electiveTotalByCategory}
            />
            {interOverflow && interOverflow.overflowCredits > 0 && (
              <p className="mt-3 rounded-sm bg-warn/10 px-2.5 py-2 text-2xs text-warn">
                大类平台经法管融通已达 <span className="num">{interOverflow.cap}</span> 学分上限，超出的{" "}
                <span className="num">{formatCredits(interOverflow.overflowCredits)}</span> 学分已计入「通识教育」选修：
                {interOverflow.overflowCourses.map((c) => c.courseName).join("、")}
              </p>
            )}
          </Panel>
        </section>
      )}

      {/* 五大板块 */}
      <section className="mt-8" aria-labelledby="trail-bundles">
        <SectionHeader
          title={<span id="trail-bundles">培养方案板块</span>}
          description="点击要求行展开对应课程。"
          aside={
            <span className="hidden items-center gap-3 sm:flex">
              <LegendItem level={0} label="已修" />
              <LegendItem level={1} label="在修" />
              <LegendItem level={2} label="计划" />
            </span>
          }
        />
        <Panel className="mt-3 overflow-hidden">
          <div role="table" aria-label="培养方案板块学分">
            <div role="row" className={cn(ROW_GRID, "h-8 border-b border-line bg-fill text-2xs text-sub")}>
              <span role="columnheader">板块 / 要求</span>
              <span role="columnheader" className="hidden sm:block">进度</span>
              <span role="columnheader" className="text-right">已修</span>
              <span role="columnheader" className="hidden text-right sm:block">在修+计划</span>
              <span role="columnheader" className="hidden text-right sm:block">要求</span>
              <span role="columnheader" className="text-right">完成</span>
            </div>
            {bundles.map((b) => (
              <BundleRows key={b.code} bundle={b} expandedKeys={expanded} onToggle={toggle} onRefetch={refetchTrailData} />
            ))}
          </div>
        </Panel>
      </section>
    </Page>
  );
}

/**
 * 板块表格网格。
 * 桌面：名称 | 进度条 | 已修 | 在修+计划 | 要求 | 完成%
 * 手机：名称 | 已修/要求 | 完成%，进度条另起一行
 */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_72px_44px] items-center gap-x-3 px-3 sm:grid-cols-[minmax(160px,1.1fr)_minmax(120px,2fr)_64px_72px_64px_48px] sm:gap-x-4 sm:px-4";

/** 要求行顺序：必修 → 经法管融通 → 选修 */
const ROW_ORDER: Record<RequirementRow["requirementType"], number> = { required: 0, interdisciplinary: 1, elective: 2 };

function pctOf(earned: number, required: number) {
  if (required > 0) return Math.min(100, (earned / required) * 100);
  return earned > 0 ? 100 : 0;
}

function LegendItem({ level, label }: { level: 0 | 1 | 2 | 3; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ProgressLegendSwatch level={level} />
      {label}
    </span>
  );
}

function OverviewStat({ level, label, value }: { level: 0 | 1 | 2 | 3; label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-2xs text-sub">
        <ProgressLegendSwatch level={level} />
        {label}
      </dt>
      <dd className={cn("num mt-1 text-xl font-medium", level === 3 ? "text-sub" : "text-ink")}>
        {formatCredits(value)}
      </dd>
    </div>
  );
}

function NumCells({
  earned,
  preview,
  required,
  strong,
}: {
  earned: number;
  preview: number;
  required: number;
  strong?: boolean;
}) {
  const pct = pctOf(earned, required);
  return (
    <>
      <span role="cell" className={cn("num text-right", strong ? "font-medium text-ink" : "text-ink")}>
        {formatCredits(earned)}
        <span className="text-faint sm:hidden"> / {formatCredits(required)}</span>
      </span>
      <span role="cell" className="num hidden text-right text-sub sm:block">
        {preview > 0 ? `+${formatCredits(preview)}` : <span className="text-faint">—</span>}
      </span>
      <span role="cell" className="num hidden text-right text-sub sm:block">
        {formatCredits(required)}
      </span>
      <span role="cell" className={cn("num text-right", pct >= 100 ? "text-ink" : "text-sub")}>
        {pct.toFixed(0)}%
      </span>
    </>
  );
}

function BundleRows({
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
  const preview = roundCredits(bundle.totalInProgress + bundle.totalPlanned);

  return (
    <div role="rowgroup" className="border-b border-line last:border-b-0">
      {/* 板块汇总行 */}
      <div role="row" className={cn(ROW_GRID, "gap-y-1.5 py-2.5 text-xs")}>
        <span role="rowheader" className="flex min-w-0 items-center gap-2 font-semibold text-ink">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: style.color }} aria-hidden />
          <span className="truncate">{bundle.name}</span>
        </span>
        <span role="cell" className="order-last col-span-3 sm:order-none sm:col-span-1">
          <ProgressBar
            earned={bundle.totalEarned}
            inProgress={bundle.totalInProgress}
            planned={bundle.totalPlanned}
            required={bundle.totalRequired}
            color={style.color}
            height={6}
          />
        </span>
        <NumCells earned={bundle.totalEarned} preview={preview} required={bundle.totalRequired} strong />
      </div>

      {/* 要求行 */}
      {[...bundle.rows].sort((a, b) => ROW_ORDER[a.requirementType] - ROW_ORDER[b.requirementType]).map((row) => {
        const key = `${bundle.code}-${row.requirementType}`;
        const isOpen = expandedKeys.has(key);
        const rowPreview = roundCredits(row.inProgressCredits + row.plannedCredits);
        const count = row.earnedCourses.length + row.plannedCourses.length;
        return (
          <div key={key}>
            <button
              type="button"
              role="row"
              aria-expanded={isOpen}
              onClick={() => onToggle(key)}
              className={cn(
                ROW_GRID,
                "w-full gap-y-1.5 py-2 text-left text-xs transition-colors hover:bg-fill",
                isOpen && "bg-fill",
              )}
            >
              <span role="rowheader" className="flex min-w-0 items-center gap-1 pl-0.5 text-sub">
                <ChevronRight
                  size={14}
                  className={cn("shrink-0 text-faint transition-transform", isOpen && "rotate-90")}
                  aria-hidden
                />
                <span className="truncate text-ink">{row.requirementName}</span>
                <span className="ml-1 shrink-0 text-2xs text-faint">
                  <span className="num">{count}</span> 门
                </span>
              </span>
              <span role="cell" className="order-last col-span-3 pl-[18px] sm:order-none sm:col-span-1 sm:pl-0">
                <ProgressBar
                  earned={row.earnedCredits}
                  inProgress={row.inProgressCredits}
                  planned={row.plannedCredits}
                  required={row.requiredCredits}
                  color={style.color}
                  height={4}
                />
              </span>
              <NumCells earned={row.earnedCredits} preview={rowPreview} required={row.requiredCredits} />
            </button>

            {isOpen && <CourseStatusList row={row} onRefetch={onRefetch} />}
          </div>
        );
      })}
    </div>
  );
}

function CourseStatusList({ row, onRefetch }: { row: RequirementRow; onRefetch: () => Promise<void> }) {
  if (row.earnedCourses.length === 0 && row.plannedCourses.length === 0) {
    return <div className="bg-fill px-3 pb-3 pl-[34px] text-2xs text-faint sm:px-4 sm:pl-[38px]">暂无已修或计划课程</div>;
  }
  return (
    <div className="space-y-2 bg-fill px-3 pb-3 pl-[34px] sm:px-4 sm:pl-[38px]">
      {row.earnedCourses.length > 0 && (
        <CourseGroup label="已修" count={row.earnedCourses.length}>
          {row.earnedCourses.map((c) => (
            <ScorePill key={`earned-${c.source}-${c.courseCode}`} course={c} onRefetch={onRefetch} />
          ))}
        </CourseGroup>
      )}
      {row.plannedCourses.length > 0 && (
        <CourseGroup label="计划修读" count={row.plannedCourses.length}>
          {row.plannedCourses.map((c) => (
            <PlannedCoursePill
              key={`planned-${c.source}-${c.courseCode}-${c.courseName}`}
              course={c}
              onRefetch={onRefetch}
            />
          ))}
        </CourseGroup>
      )}
    </div>
  );
}

function CourseGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-3">
      <div className="text-2xs text-sub sm:pt-1">
        {label} <span className="num text-faint">{count}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

const pillBase =
  "inline-flex h-6 max-w-full items-center gap-1.5 rounded-sm border px-1.5 text-2xs transition-colors disabled:cursor-default";

// ── 成绩标签：编辑模式下点击弹出成绩输入 ─────────────────
function ScorePill({ course, onRefetch }: { course: EarnedCourse; onRefetch: () => Promise<void> }) {
  const { editing } = useEditMode();
  const [open, setOpen] = useState(false);
  const score = course.score;
  const hasScore = score != null;

  const pill = (
    <button
      type="button"
      disabled={!editing}
      className={cn(
        pillBase,
        "border-line bg-card text-ink enabled:hover:border-line-strong data-[state=open]:border-line-strong",
      )}
      title={course.source === "official" ? course.courseCode ?? "" : "自定课程"}
    >
      <span className="truncate">{course.courseName}</span>
      <span className="num text-sub">{formatCredits(course.credits)}</span>
      <span className={cn("num border-l border-line pl-1.5", hasScore ? "text-ink" : "text-faint")}>
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

function PlannedCoursePill({ course, onRefetch }: { course: PlannedCourse; onRefetch: () => Promise<void> }) {
  const { editing } = useEditMode();
  const [open, setOpen] = useState(false);

  const pill = (
    <button
      type="button"
      disabled={!editing}
      className={cn(
        pillBase,
        "border-transparent bg-fill-strong text-sub enabled:hover:text-ink data-[state=open]:text-ink",
      )}
      title={course.source === "official" ? course.courseCode ?? "" : "计划课程"}
    >
      <span className="truncate">{course.courseName}</span>
      <span className="num">{formatCredits(course.credits)}</span>
      <span className="text-faint">{course.plannedTerm == null ? "待安排" : TERM_LABEL[course.plannedTerm]}</span>
      {editing && (
        <span className="inline-flex items-center gap-0.5 border-l border-line-strong pl-1.5">
          <PenLine size={10} aria-hidden />
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
        <div className="num shrink-0 text-2xs text-sub">{formatCredits(course.credits)} 学分</div>
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
          <div className="text-2xs text-sub">保存后进入已修进度</div>
        ) : (
          <button
            type="button"
            onClick={() => void persist(null)}
            disabled={busy}
            className="text-2xs text-sub transition-colors hover:text-ink disabled:opacity-50"
          >
            清空分数
          </button>
        )}
        {err && <div className="text-right text-2xs text-danger">{err}</div>}
      </div>
    </div>
  );
}

function isPlannedCourse(course: ScoreEditableCourse): course is PlannedCourse {
  return !("score" in course);
}
