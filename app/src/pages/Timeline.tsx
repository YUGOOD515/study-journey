import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { parseOfferedTerm, TERM_LABEL } from "../lib/offeredTerm";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import type {
  CourseWithCategory,
  PersonalPlanItem,
  ProgramRequirement,
  SemesterCourse,
} from "../types";
import { CourseCard } from "../components/CourseCard";
import { ManualCourseCard } from "../components/ManualCourseCard";
import { ManualCourseDialog } from "../components/ManualCourseDialog";

const TERMS = [1, 2, 3, 4, 5, 6, 7, 8];

type ViewMode = "official" | "personal";

type DragPayload =
  | {
      kind: "official";
      courseCode: string;
      courseName: string;
      fromTerm: number | null;
    }
  | {
      kind: "manual";
      id: number;
      courseName: string;
      fromTerm: number;
    };

interface PlannedOfficial {
  course: CourseWithCategory;
  plannedTerm: number | null;
  warning: string | null;
}

export default function Timeline() {
  const [courses, setCourses] = useState<CourseWithCategory[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
  const [done, setDone] = useState<SemesterCourse[]>([]);
  const [personalPlan, setPersonalPlan] = useState<PersonalPlanItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("official");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addTerm, setAddTerm] = useState<number | null>(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.coursesWithCategory(),
      api.programRequirements(),
      api.semesterCourses(),
      api.personalPlan(),
    ])
      .then(([c, r, d, p]) => {
        setCourses(c);
        setReqs(r);
        setDone(d);
        setPersonalPlan(p);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const refetchPlan = async () => {
    const p = await api.personalPlan();
    setPersonalPlan(p);
  };

  const completedByCode = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const d of done) {
      if (d.source === "official" && d.course_code) {
        m.set(d.course_code, d.score);
      }
    }
    return m;
  }, [done]);

  const officialBuckets = useMemo(() => {
    const byTerm = emptyTermBuckets<CourseWithCategory>();
    const flexible: CourseWithCategory[] = [];
    for (const c of courses) {
      const p = parseOfferedTerm(c.offered_term);
      if (p.isFlexible || p.primary == null) flexible.push(c);
      else byTerm[p.primary].push(c);
    }
    for (const t of TERMS) sortOfficial(byTerm[t]);
    sortOfficial(flexible);
    return { byTerm, flexible };
  }, [courses]);

  const personalBuckets = useMemo(() => {
    const byTerm = emptyTermBuckets<PlannedOfficial>();
    const flexible: PlannedOfficial[] = [];
    const overrides = new Map(
      personalPlan
        .filter((p) => p.item_type === "official" && p.course_code)
        .map((p) => [p.course_code as string, p])
    );

    const plannedTermByCode = new Map<string, number | null>();
    for (const c of courses) {
      const plannedTerm = overrides.get(c.course_code)?.planned_term ?? defaultTerm(c);
      plannedTermByCode.set(c.course_code, plannedTerm);
    }

    for (const c of courses) {
      const plannedTerm = plannedTermByCode.get(c.course_code) ?? null;
      const item: PlannedOfficial = {
        course: c,
        plannedTerm,
        warning:
          plannedTerm == null
            ? null
            : placementWarning(c, plannedTerm, plannedTermByCode, courses),
      };
      if (plannedTerm == null) flexible.push(item);
      else byTerm[plannedTerm].push(item);
    }

    for (const t of TERMS) sortPlanned(byTerm[t]);
    sortPlanned(flexible);
    return { byTerm, flexible };
  }, [courses, personalPlan]);

  const manualPlanByTerm = useMemo(() => {
    const byTerm = emptyTermBuckets<PersonalPlanItem>();
    for (const item of personalPlan) {
      if (item.item_type !== "manual") continue;
      byTerm[item.planned_term].push(item);
    }
    for (const t of TERMS) {
      byTerm[t].sort((a, b) => a.course_name.localeCompare(b.course_name, "zh"));
    }
    return byTerm;
  }, [personalPlan]);

  const totals = useMemo(() => {
    const requiredTotal = reqs.reduce((s, r) => s + r.required_credits, 0);
    const officialPlanTotal = courses.reduce((s, c) => s + c.credits, 0);
    const manualPlanTotal = personalPlan
      .filter((p) => p.item_type === "manual")
      .reduce((s, p) => s + p.credits, 0);
    const completedTotal = done.reduce((s, d) => s + (d.credits ?? 0), 0);
    return {
      requiredTotal,
      officialPlanTotal,
      personalPlanTotal: officialPlanTotal + manualPlanTotal,
      completedTotal,
    };
  }, [reqs, courses, done, personalPlan]);

  const startOfficialDrag = (
    event: React.DragEvent<HTMLDivElement>,
    item: PlannedOfficial
  ) => {
    if (viewMode !== "personal") return;
    const payload: DragPayload = {
      kind: "official",
      courseCode: item.course.course_code,
      courseName: item.course.course_name,
      fromTerm: item.plannedTerm,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-study-journey", JSON.stringify(payload));
    setDragging(payload);
    setHint(null);
  };

  const startManualDrag = (
    event: React.DragEvent<HTMLDivElement>,
    item: PersonalPlanItem
  ) => {
    const payload: DragPayload = {
      kind: "manual",
      id: item.id,
      courseName: item.course_name,
      fromTerm: item.planned_term,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-study-journey", JSON.stringify(payload));
    setDragging(payload);
    setHint(null);
  };

  const dropOnTerm = async (term: number) => {
    if (!dragging || viewMode !== "personal") return;
    if (dragging.kind === "official") {
      const course = courses.find((c) => c.course_code === dragging.courseCode);
      if (!course) return;
      const defaultPlannedTerm = defaultTerm(course);
      if (defaultPlannedTerm === term) {
        await api.resetPersonalOfficial(dragging.courseCode);
      } else {
        await api.upsertPersonalOfficial({
          course_code: dragging.courseCode,
          planned_term: term,
        });
      }
      const warning = placementWarning(
        course,
        term,
        new Map([[dragging.courseCode, term]]),
        courses
      );
      setHint(warning ? `已放入第 ${term} 学期：${warning}` : null);
    } else if (dragging.fromTerm !== term) {
      await api.patchPersonalPlan(dragging.id, { planned_term: term });
    }
    await refetchPlan();
    setDragging(null);
  };

  const resetOfficialToFlexible = async () => {
    if (!dragging || dragging.kind !== "official") return;
    await api.resetPersonalOfficial(dragging.courseCode);
    await refetchPlan();
    setDragging(null);
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

  return (
    <div className="min-h-screen px-8 py-6">
      <header className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-lg text-ink">时间轴</h1>
          <div className="text-[11px] text-sub mt-0.5">
            官方计划只读 · 我的计划可拖拽，违规只提示不阻止
          </div>
          <div className="mt-3 inline-flex rounded-lg border border-sub/15 bg-card p-0.5">
            <ModeButton active={viewMode === "official"} onClick={() => setViewMode("official")}>
              官方计划
            </ModeButton>
            <ModeButton active={viewMode === "personal"} onClick={() => setViewMode("personal")}>
              我的计划
            </ModeButton>
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs pt-1">
          <Stat label="已修学分" value={totals.completedTotal} />
          <Stat
            label={viewMode === "personal" ? "我的计划合计" : "官方计划合计"}
            value={viewMode === "personal" ? totals.personalPlanTotal : totals.officialPlanTotal}
          />
          <Stat label="培养方案要求" value={totals.requiredTotal} />
        </div>
      </header>

      {hint && (
        <div className="mb-4 rounded-lg border border-brand/25 bg-brand/10 px-3 py-2 text-xs text-brand">
          {hint}
        </div>
      )}

      <Legend />

      <div className="flex gap-3 overflow-x-auto pb-4">
        {TERMS.map((term) =>
          viewMode === "official" ? (
            <OfficialTermColumn
              key={term}
              term={term}
              courses={officialBuckets.byTerm[term]}
              completedByCode={completedByCode}
            />
          ) : (
            <PersonalTermColumn
              key={term}
              term={term}
              officialItems={personalBuckets.byTerm[term]}
              manualItems={manualPlanByTerm[term]}
              completedByCode={completedByCode}
              dragging={dragging}
              onDrop={dropOnTerm}
              onStartOfficialDrag={startOfficialDrag}
              onStartManualDrag={startManualDrag}
              onDragEnd={() => setDragging(null)}
              onAdd={() => setAddTerm(term)}
              onDeleteManual={async (id) => {
                await api.deletePersonalPlan(id);
                await refetchPlan();
              }}
            />
          )
        )}

        {viewMode === "official" ? (
          <OfficialFlexibleColumn courses={officialBuckets.flexible} />
        ) : (
          <PersonalFlexibleColumn
            items={personalBuckets.flexible}
            dragging={dragging}
            onDrop={resetOfficialToFlexible}
            onStartOfficialDrag={startOfficialDrag}
            onDragEnd={() => setDragging(null)}
          />
        )}
      </div>

      {addTerm != null && (
        <ManualCourseDialog
          termNumber={addTerm}
          onClose={() => setAddTerm(null)}
          onSubmit={async (input) => {
            await api.createPersonalManual({
              planned_term: input.term_number,
              course_name: input.course_name,
              credits: input.credits,
              category_code: input.category_code,
              course_nature: input.course_nature,
              note: input.note,
            });
            await refetchPlan();
          }}
        />
      )}
    </div>
  );
}

function OfficialTermColumn({
  term,
  courses,
  completedByCode,
}: {
  term: number;
  courses: CourseWithCategory[];
  completedByCode: Map<string, number | null>;
}) {
  const credits = courses.reduce((s, c) => s + c.credits, 0);
  return (
    <TermFrame term={term} credits={credits}>
      {courses.map((course) => (
        <CourseCard
          key={`${term}-${course.course_code}`}
          course={course}
          completedScore={completedByCode.get(course.course_code)}
        />
      ))}
      {courses.length === 0 && <EmptyTerm />}
    </TermFrame>
  );
}

function PersonalTermColumn({
  term,
  officialItems,
  manualItems,
  completedByCode,
  dragging,
  onDrop,
  onStartOfficialDrag,
  onStartManualDrag,
  onDragEnd,
  onAdd,
  onDeleteManual,
}: {
  term: number;
  officialItems: PlannedOfficial[];
  manualItems: PersonalPlanItem[];
  completedByCode: Map<string, number | null>;
  dragging: DragPayload | null;
  onDrop: (term: number) => void;
  onStartOfficialDrag: (
    event: React.DragEvent<HTMLDivElement>,
    item: PlannedOfficial
  ) => void;
  onStartManualDrag: (
    event: React.DragEvent<HTMLDivElement>,
    item: PersonalPlanItem
  ) => void;
  onDragEnd: () => void;
  onAdd: () => void;
  onDeleteManual: (id: number) => Promise<void>;
}) {
  const credits =
    officialItems.reduce((s, item) => s + item.course.credits, 0) +
    manualItems.reduce((s, item) => s + item.credits, 0);
  const isDropTarget = dragging != null && dragging.fromTerm !== term;

  return (
    <TermFrame
      term={term}
      credits={credits}
      dropActive={isDropTarget}
      onDragOver={(event) => {
        if (!dragging) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        void onDrop(term);
      }}
    >
      {officialItems.map((item) => (
        <CourseCard
          key={`personal-${item.course.course_code}`}
          course={item.course}
          completedScore={completedByCode.get(item.course.course_code)}
          draggable
          actualTag="计划"
          warning={item.warning ?? undefined}
          onDragStart={(event) => onStartOfficialDrag(event, item)}
          onDragEnd={onDragEnd}
        />
      ))}

      {manualItems.length > 0 && (
        <div className="pt-1 mt-1 border-t border-dashed border-sub/20 flex flex-col gap-1.5">
          {manualItems.map((item) => (
            <ManualCourseCard
              key={`plan-manual-${item.id}`}
              course={item}
              draggable
              onDragStart={(event) => onStartManualDrag(event, item)}
              onDragEnd={onDragEnd}
              onDelete={async (id) => {
                if (!window.confirm(`删除计划课程「${item.course_name}」？`)) return;
                await onDeleteManual(id);
              }}
            />
          ))}
        </div>
      )}

      {officialItems.length === 0 && manualItems.length === 0 && <EmptyTerm />}

      <button
        type="button"
        onClick={onAdd}
        className="mt-1 h-8 rounded-md border border-dashed border-sub/25 text-[11px] text-sub hover:text-ink hover:border-sub/45 hover:bg-sub/5 transition-colors"
      >
        + 添加课程
      </button>
    </TermFrame>
  );
}

function OfficialFlexibleColumn({ courses }: { courses: CourseWithCategory[] }) {
  return (
    <SideColumn title="灵活" subtitle="任意学期" count={`${courses.length} 门`}>
      {courses.map((course) => (
        <CourseCard key={`official-flex-${course.course_code}`} course={course} />
      ))}
    </SideColumn>
  );
}

function PersonalFlexibleColumn({
  items,
  dragging,
  onDrop,
  onStartOfficialDrag,
  onDragEnd,
}: {
  items: PlannedOfficial[];
  dragging: DragPayload | null;
  onDrop: () => void;
  onStartOfficialDrag: (
    event: React.DragEvent<HTMLDivElement>,
    item: PlannedOfficial
  ) => void;
  onDragEnd: () => void;
}) {
  const active = dragging?.kind === "official";
  return (
    <SideColumn
      title="待安排"
      subtitle="灵活课程"
      count={`${items.length} 门`}
      active={active}
      onDragOver={(event) => {
        if (!active) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (active) void onDrop();
      }}
    >
      {items.map((item) => (
        <CourseCard
          key={`personal-flex-${item.course.course_code}`}
          course={item.course}
          draggable
          actualTag="待安排"
          onDragStart={(event) => onStartOfficialDrag(event, item)}
          onDragEnd={onDragEnd}
        />
      ))}
    </SideColumn>
  );
}

function TermFrame({
  term,
  credits,
  children,
  dropActive = false,
  onDragOver,
  onDrop,
}: {
  term: number;
  credits: number;
  children: React.ReactNode;
  dropActive?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "flex-shrink-0 w-[180px] bg-card border rounded-lg p-2.5 flex flex-col transition-colors " +
        (dropActive ? "border-brand bg-brand/5" : "border-sub/20")
      }
    >
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <div>
          <div className="text-[11px] text-sub tabular-nums">学期 {term}</div>
          <div className="text-sm text-ink">{TERM_LABEL[term]}</div>
        </div>
        <div className="text-[11px] text-sub tabular-nums">{round1(credits)} 学分</div>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function SideColumn({
  title,
  subtitle,
  count,
  children,
  active = false,
  onDragOver,
  onDrop,
}: {
  title: string;
  subtitle: string;
  count: string;
  children: React.ReactNode;
  active?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "flex-shrink-0 w-[200px] bg-card border border-dashed rounded-lg p-2.5 flex flex-col transition-colors " +
        (active ? "border-brand bg-brand/5" : "border-sub/30")
      }
    >
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <div>
          <div className="text-[11px] text-sub">{title}</div>
          <div className="text-sm text-ink">{subtitle}</div>
        </div>
        <div className="text-[11px] text-sub tabular-nums">{count}</div>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 mb-5 text-[11px] text-sub">
      {Object.entries(CATEGORY_STYLE).map(([code, s]) => (
        <div key={code} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: s.color }}
          />
          {s.name}
        </div>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <span className="inline-block w-4 h-2.5 rounded-sm border border-sub/50" />
        必修（实线）
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-2.5 rounded-sm border border-dashed border-sub/50" />
        选修（虚线）
      </div>
    </div>
  );
}

function ModeButton({
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
      type="button"
      onClick={onClick}
      className={
        "px-3 py-1 text-xs rounded-md transition-colors " +
        (active ? "bg-sub/10 text-ink" : "text-sub hover:text-ink hover:bg-sub/5")
      }
    >
      {children}
    </button>
  );
}

function EmptyTerm() {
  return (
    <div className="text-[10px] text-sub/60 italic px-1 py-2">暂无安排</div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end">
      <div className="text-[10px] text-sub uppercase tracking-wide">{label}</div>
      <div className="text-lg text-ink tabular-nums">{round1(value)}</div>
    </div>
  );
}

function emptyTermBuckets<T>(): Record<number, T[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
}

function sortOfficial(arr: CourseWithCategory[]) {
  arr.sort((a, b) => {
    if (a.course_nature !== b.course_nature) {
      return a.course_nature === "必修" ? -1 : 1;
    }
    return a.category_name.localeCompare(b.category_name, "zh");
  });
}

function sortPlanned(arr: PlannedOfficial[]) {
  arr.sort((a, b) => {
    if (a.course.course_nature !== b.course.course_nature) {
      return a.course.course_nature === "必修" ? -1 : 1;
    }
    return a.course.category_name.localeCompare(b.course.category_name, "zh");
  });
}

function defaultTerm(course: CourseWithCategory): number | null {
  const parsed = parseOfferedTerm(course.offered_term);
  if (parsed.isFlexible || parsed.primary == null) return null;
  return parsed.primary;
}

function allowedTerms(course: CourseWithCategory): number[] {
  const parsed = parseOfferedTerm(course.offered_term);
  if (parsed.isFlexible || parsed.primary == null) return TERMS;
  if (parsed.rangeEnd != null) {
    return TERMS.filter((t) => t >= parsed.primary! && t <= parsed.rangeEnd!);
  }
  return [parsed.primary];
}

function placementWarning(
  course: CourseWithCategory,
  term: number,
  plannedTermByCode: Map<string, number | null>,
  allCourses: CourseWithCategory[]
): string | null {
  const warnings: string[] = [];
  const allowed = allowedTerms(course);
  if (!allowed.includes(term)) {
    warnings.push(`开课建议：${formatAllowedTerms(allowed)}`);
  }

  if (course.prerequisite_course_code) {
    const prereqTerm = plannedTermByCode.get(course.prerequisite_course_code);
    const prereq = allCourses.find(
      (c) => c.course_code === course.prerequisite_course_code
    );
    if (prereqTerm != null && prereqTerm >= term) {
      warnings.push(`先修「${prereq?.course_name ?? "未命名课程"}」不早于本课`);
    }
  }

  return warnings.length > 0 ? warnings.join("；") : null;
}

function formatAllowedTerms(terms: number[]) {
  if (terms.length === 8) return "任意学期";
  if (terms.length === 1) return `第 ${terms[0]} 学期`;
  return `第 ${terms[0]}–${terms[terms.length - 1]} 学期`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
