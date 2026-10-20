import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, PenLine, X } from "../lib/icons";
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
import { ProgressRing } from "../components/ProgressRing";
import { InterdisciplinaryFlow, type FlowItem } from "../components/InterdisciplinaryFlow";
import { myPlanTotalCredits } from "../lib/planTotal";
import { useEditMode } from "../lib/editMode";
import { cn } from "../lib/cn";
import {
  Button,
  inputClass,
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
import type { Course, ProgressResponse } from "../types";

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
  /** 当前展开的分项：`${categoryCode}:${requirementType}` */
  const [selected, setSelected] = useState<string | null>(null);

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
    [progress],
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
    [planInputs],
  );

  const select = (key: string) => {
    setSelected((prev) => (prev === key ? null : key));
    // 详情在板块网格下方；窄屏时滚动过去
    requestAnimationFrame(() => {
      const id = window.matchMedia("(min-width: 640px)").matches
        ? "trail-detail"
        : "trail-detail-inline";
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  // 经法管融通 流向图 items —— 全部来自后端进度结果（唯一真相源）
  // 注意：所有 hooks 必须在早 return 之前调用，否则违反 Rules of Hooks
  const flowItems: FlowItem[] = useMemo(
    () => (progress ? flowItemsFromProgress(progress, api.idForCourse) : []),
    [progress],
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
      const next = item.assignment === "interdisciplinary" ? "elective" : "interdisciplinary";
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
    [refetchTrailData],
  );

  if (err) return <PageError message={err} onRetry={() => window.location.reload()} />;
  if (loading) {
    return (
      <Page>
        <div className="border-b border-line pb-3 pt-6 sm:pt-8">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="mt-6 h-[132px] rounded-lg" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[300px] rounded-lg" />
          ))}
        </div>
      </Page>
    );
  }

  const interOverflow = progress?.overflow.interdisciplinary ?? null;
  const selectedBundle = selected
    ? bundles.find((b) => selected.startsWith(`${b.code}:`))
    : undefined;
  const selectedRow = selectedBundle?.rows.find(
    (r) => `${selectedBundle.code}:${r.requirementType}` === selected,
  );

  const renderDetail = (variant: "inline" | "below") =>
    selectedBundle && selectedRow ? (
      <DetailPanel
        variant={variant}
        bundle={selectedBundle}
        row={selectedRow}
        onClose={() => setSelected(null)}
        onRefetch={refetchTrailData}
      >
        {selectedRow.requirementType === "interdisciplinary" && flowItems.length > 0 && (
          <div className="mt-4 rounded bg-fill p-3 sm:p-4">
            <div className="text-xs font-medium text-ink">学分归属</div>
            <p className="mt-0.5 text-2xs text-sub">
              计入「大类平台」上限 <span className="num">{interOverflow?.cap ?? 6}</span>{" "}
              学分，超出部分自动计入「通识教育」选修。
              {!editing && "切换到编辑后可手动调整。"}
            </p>
            <div className="mt-3">
              <InterdisciplinaryFlow
                items={flowItems}
                onToggle={toggleItem}
                disabled={!editing}
                interdisciplinaryTotal={interdisciplinaryTotal}
                electiveTotalByCategory={electiveTotalByCategory}
              />
            </div>
            {interOverflow && interOverflow.overflowCredits > 0 && (
              <p className="mt-3 rounded bg-warn/10 px-2.5 py-2 text-2xs text-warn">
                已达 <span className="num">{interOverflow.cap}</span> 学分上限，超出的{" "}
                <span className="num">{formatCredits(interOverflow.overflowCredits)}</span>{" "}
                学分计入「通识教育」选修：
                {interOverflow.overflowCourses.map((c) => c.courseName).join("、")}
              </p>
            )}
          </div>
        )}
      </DetailPanel>
    ) : null;

  return (
    <Page>
      <PageHeader
        title="旅迹"
        meta={
          editing
            ? "培养方案五大板块的修读进度；点开分项可查看课程、填写成绩。"
            : "培养方案五大板块的修读进度；点开分项可查看课程。"
        }
      />

      <OverviewCard totals={totals} planTotal={planTotal} />

      <section className="mt-8" aria-labelledby="trail-bundles">
        <SectionHeader
          title={<span id="trail-bundles">培养方案板块</span>}
          aside={
            <span className="flex items-center gap-3 text-2xs text-sub">
              <LegendItem level={0} label="已修" />
              <LegendItem level={1} label="在修与计划" />
            </span>
          }
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {bundles.map((b) => (
            <Fragment key={b.code}>
              <BundleCard
                bundle={b}
                selected={selected}
                onSelect={select}
                overflowCourses={
                  b.code === "major_platform" ? (interOverflow?.overflowCourses.length ?? 0) : 0
                }
              />
              {/* 手机：详情紧跟在所属板块下面 */}
              {selectedBundle?.code === b.code && (
                <div className="sm:hidden">{renderDetail("inline")}</div>
              )}
            </Fragment>
          ))}
        </div>

        <div className="hidden sm:block">{renderDetail("below")}</div>
      </section>
    </Page>
  );
}

/* 总览 ------------------------------------------------------------- */

function OverviewCard({
  totals,
  planTotal,
}: {
  totals: {
    required: number;
    earned: number;
    inProgress: number;
    planned: number;
    pending: number;
  };
  planTotal: number;
}) {
  const pct = pctOf(totals.earned, totals.required);
  return (
    <Panel className="mt-6 rounded-lg p-5 sm:px-6" aria-label="总览">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="text-2xs text-sub">已修学分</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="num text-xl font-semibold text-ink">
              {formatCredits(totals.earned)}
            </span>
            <span className="num text-sm text-sub">/ {formatCredits(totals.required)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xs text-sub">完成度</div>
          <div className="num mt-1 text-xl font-semibold text-brand">
            {pct.toFixed(0)}
            <span className="ml-0.5 text-sm font-medium">%</span>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <ProgressBar
          earned={totals.earned}
          inProgress={totals.inProgress}
          planned={totals.planned}
          required={totals.required}
          color="rgb(var(--brand))"
          height={10}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-sub">
        <StatItem level={0} label="已修" value={totals.earned} />
        <StatItem level={1} label="在修" value={totals.inProgress} />
        <StatItem level={1} label="计划" value={totals.planned} />
        {totals.pending > 0 && <StatItem level={3} label="未安排" value={totals.pending} />}
        <span className="ml-auto">
          我的计划合计 <span className="num text-ink">{formatCredits(planTotal)}</span> 学分
        </span>
      </div>
    </Panel>
  );
}

function StatItem({ level, label, value }: { level: 0 | 1 | 3; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ProgressLegendSwatch level={level} />
      {label}
      <span className="num text-ink">{formatCredits(value)}</span>
    </span>
  );
}

/* 板块卡片 --------------------------------------------------------- */

/** 分项顺序：必修 → 经法管融通 → 选修 */
const ROW_ORDER: Record<RequirementRow["requirementType"], number> = {
  required: 0,
  interdisciplinary: 1,
  elective: 2,
};

function pctOf(earned: number, required: number) {
  if (required > 0) return Math.min(100, (earned / required) * 100);
  return earned > 0 ? 100 : 0;
}

/** 一句话状态：已完成 / 在修与计划可补齐 / 还差 N 学分未安排 */
function statusText(earned: number, preview: number, required: number) {
  if (required <= 0) return earned > 0 ? "已修读" : "无学分要求";
  if (earned >= required) return "已完成";
  const left = roundCredits(required - earned - preview);
  if (left <= 0) return "在修与计划可补齐";
  return `还差 ${formatCredits(left)} 学分未安排`;
}

function LegendItem({ level, label }: { level: 0 | 1 | 3; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ProgressLegendSwatch level={level} />
      {label}
    </span>
  );
}

function BundleCard({
  bundle,
  selected,
  onSelect,
  overflowCourses,
}: {
  bundle: CategoryBundle;
  selected: string | null;
  onSelect: (key: string) => void;
  overflowCourses: number;
}) {
  const style = CATEGORY_STYLE[bundle.code];
  const preview = roundCredits(bundle.totalInProgress + bundle.totalPlanned);
  const pct = pctOf(bundle.totalEarned, bundle.totalRequired);
  const done = bundle.totalRequired > 0 && bundle.totalEarned >= bundle.totalRequired;

  return (
    <article
      className="flex flex-col rounded-lg border border-line bg-card p-4"
      aria-label={bundle.name}
    >
      <header className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: style.color }}
          aria-hidden
        />
        <h3 className="text-sm font-semibold text-ink">{bundle.name}</h3>
      </header>

      <div className="mt-4 flex items-center gap-4">
        <ProgressRing
          earned={bundle.totalEarned}
          preview={preview}
          required={bundle.totalRequired}
          color={style.color}
          size={84}
          stroke={8}
        >
          <span className="num text-base font-semibold leading-none" style={{ color: style.text }}>
            {pct.toFixed(0)}
            <span className="text-2xs font-medium">%</span>
          </span>
        </ProgressRing>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="num text-base font-semibold text-ink">
              {formatCredits(bundle.totalEarned)}
            </span>
            <span className="num text-xs text-faint">
              / {formatCredits(bundle.totalRequired)} 学分
            </span>
          </div>
          <div className={cn("mt-0.5 text-2xs", done ? "text-ink" : "text-sub")}>
            {statusText(bundle.totalEarned, preview, bundle.totalRequired)}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {[...bundle.rows]
          .sort((a, b) => ROW_ORDER[a.requirementType] - ROW_ORDER[b.requirementType])
          .map((row) => {
            const key = `${bundle.code}:${row.requirementType}`;
            return (
              <RowCard
                key={key}
                row={row}
                color={style.color}
                active={selected === key}
                onClick={() => onSelect(key)}
                note={
                  row.requirementType === "interdisciplinary" && overflowCourses > 0
                    ? `${overflowCourses} 门计入通识选修`
                    : undefined
                }
              />
            );
          })}
      </div>
    </article>
  );
}

function RowCard({
  row,
  color,
  active,
  onClick,
  note,
}: {
  row: RequirementRow;
  color: string;
  active: boolean;
  onClick: () => void;
  note?: string;
}) {
  const preview = roundCredits(row.inProgressCredits + row.plannedCredits);
  const done = row.requiredCredits > 0 && row.earnedCredits >= row.requiredCredits;
  const count = row.earnedCourses.length + row.plannedCourses.length;
  return (
    <button
      type="button"
      aria-expanded={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded px-2.5 py-2 text-left transition-colors",
        active ? "bg-card" : "bg-fill hover:bg-fill-strong",
      )}
      style={active ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
    >
      <ProgressRing
        earned={row.earnedCredits}
        preview={preview}
        required={row.requiredCredits}
        color={color}
        size={30}
        stroke={4}
      >
        {done && <Check className="h-3 w-3" style={{ color }} aria-hidden />}
      </ProgressRing>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium text-ink">{row.requirementName}</span>
          <span className="num shrink-0 text-xs text-ink">
            {formatCredits(row.earnedCredits)}
            <span className="text-faint"> / {formatCredits(row.requiredCredits)}</span>
          </span>
        </span>
        <span className="mt-0.5 block truncate text-2xs text-sub">
          {note ??
            (done
              ? `已完成 · ${count} 门`
              : preview > 0
                ? `在修与计划 +${formatCredits(preview)} · ${count} 门`
                : `${count} 门`)}
        </span>
      </span>
      <ChevronRight
        size={14}
        className={cn("shrink-0 text-faint transition-transform", active && "rotate-90")}
        aria-hidden
      />
    </button>
  );
}

/* 分项详情 --------------------------------------------------------- */

function DetailPanel({
  variant,
  bundle,
  row,
  onClose,
  onRefetch,
  children,
}: {
  variant: "inline" | "below";
  bundle: CategoryBundle;
  row: RequirementRow;
  onClose: () => void;
  onRefetch: () => Promise<void>;
  children?: React.ReactNode;
}) {
  const style = CATEGORY_STYLE[bundle.code];
  const inProgress = row.plannedCourses.filter((c) => c.origin === "record");
  const planned = row.plannedCourses.filter((c) => c.origin !== "record");
  const empty = row.earnedCourses.length === 0 && row.plannedCourses.length === 0;
  return (
    <Panel
      id={variant === "inline" ? "trail-detail-inline" : "trail-detail"}
      className={cn(
        "animate-fade scroll-mt-20 rounded-lg",
        variant === "below" && "mt-3",
        "p-4 sm:p-5",
      )}
      aria-label={`${bundle.name} ${row.requirementName}`}
    >
      <header className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: style.color }}
          aria-hidden
        />
        <h3 className="text-sm font-semibold text-ink">
          {bundle.name}
          <span className="mx-1.5 text-faint">·</span>
          {row.requirementName}
        </h3>
        <span className="num text-xs text-sub">
          {formatCredits(row.earnedCredits)} / {formatCredits(row.requiredCredits)} 学分
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          icon={<X />}
          onClick={onClose}
          aria-label="收起"
        >
          收起
        </Button>
      </header>
      {children}
      {empty ? (
        <div className="mt-4 text-2xs text-faint">暂无已修或计划课程</div>
      ) : (
        <div className="mt-4 space-y-3">
          {row.earnedCourses.length > 0 && (
            <CourseGroup label="已修" count={row.earnedCourses.length}>
              {row.earnedCourses.map((c) => (
                <ScorePill
                  key={`earned-${c.source}-${c.courseCode}`}
                  course={c}
                  onRefetch={onRefetch}
                />
              ))}
            </CourseGroup>
          )}
          {inProgress.length > 0 && (
            <CourseGroup label="在修" count={inProgress.length}>
              {inProgress.map((c) => (
                <PlannedCoursePill
                  key={`ip-${c.source}-${c.courseCode}-${c.courseName}`}
                  course={c}
                  onRefetch={onRefetch}
                />
              ))}
            </CourseGroup>
          )}
          {planned.length > 0 && (
            <CourseGroup label="计划" count={planned.length}>
              {planned.map((c) => (
                <PlannedCoursePill
                  key={`planned-${c.source}-${c.courseCode}-${c.courseName}`}
                  course={c}
                  onRefetch={onRefetch}
                />
              ))}
            </CourseGroup>
          )}
        </div>
      )}
    </Panel>
  );
}

function CourseGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-3">
      <div className="text-2xs text-sub sm:pt-1">
        {label} <span className="num text-faint">{count}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

const pillBase =
  "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-2xs transition-colors disabled:cursor-default";

// ── 成绩标签：编辑模式下点击弹出成绩输入 ─────────────────
function ScorePill({
  course,
  onRefetch,
}: {
  course: EarnedCourse;
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
      className={cn(
        pillBase,
        "border-line bg-card text-ink enabled:hover:border-line-strong data-[state=open]:border-line-strong",
      )}
      title={course.source === "official" ? (course.courseCode ?? "") : "自定课程"}
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

function PlannedCoursePill({
  course,
  onRefetch,
}: {
  course: PlannedCourse;
  onRefetch: () => Promise<void>;
}) {
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
      title={course.source === "official" ? (course.courseCode ?? "") : "计划课程"}
    >
      <span className="truncate">{course.courseName}</span>
      <span className="num">{formatCredits(course.credits)}</span>
      <span className="text-faint">
        {course.plannedTerm == null ? "待安排" : TERM_LABEL[course.plannedTerm]}
      </span>
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
      notify.success(
        newScore == null
          ? `已清空成绩：${course.courseName}`
          : `已保存成绩：${course.courseName} ${newScore}`,
      );
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
