import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { parseOfferedTerm, TERM_LABEL } from "../lib/offeredTerm";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import {
  COURSE_CARD_DISPLAY_ITEMS,
  loadCourseCardDisplayOptions,
  saveCourseCardDisplayOptions,
} from "../lib/courseCardDisplay";
import type {
  CourseCardDisplayOptions,
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
      /** null = 来自抽屉 */
      fromTerm: number | null;
    }
  | {
      kind: "manual";
      id: number;
      courseName: string;
      /** null = 来自抽屉 */
      fromTerm: number | null;
    };

interface PlannedOfficial {
  course: CourseWithCategory;
  plannedTerm: number | null;
  warning: string | null;
}

const DRAWER_OPEN_KEY = "study-journey:drawer-open";
type DrawerState = { official: boolean; personal: boolean };

function loadDrawerState(): DrawerState {
  if (typeof window === "undefined") {
    return { official: false, personal: true };
  }
  try {
    const raw = window.localStorage.getItem(DRAWER_OPEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        official: !!parsed.official,
        personal: parsed.personal !== false,
      };
    }
  } catch {
    // ignore
  }
  return { official: false, personal: true };
}

export default function Timeline() {
  const [courses, setCourses] = useState<CourseWithCategory[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
  const [done, setDone] = useState<SemesterCourse[]>([]);
  const [personalPlan, setPersonalPlan] = useState<PersonalPlanItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("official");
  const [displayOptions, setDisplayOptions] = useState<CourseCardDisplayOptions>(
    loadCourseCardDisplayOptions
  );
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addTerm, setAddTerm] = useState<number | null | "drawer">(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<DrawerState>(loadDrawerState);

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

  useEffect(() => {
    saveCourseCardDisplayOptions(displayOptions);
  }, [displayOptions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAWER_OPEN_KEY, JSON.stringify(drawerOpen));
    } catch {
      // ignore
    }
  }, [drawerOpen]);

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

  // 官方视图：纯按 offered_term 分；灵活课进抽屉
  const officialBuckets = useMemo(() => {
    const byTerm = emptyTermBuckets<CourseWithCategory>();
    const drawer: CourseWithCategory[] = [];
    for (const c of courses) {
      const p = parseOfferedTerm(c.offered_term);
      if (p.isFlexible || p.primary == null) drawer.push(c);
      else byTerm[p.primary].push(c);
    }
    for (const t of TERMS) sortOfficial(byTerm[t]);
    sortOfficial(drawer);
    return { byTerm, drawer };
  }, [courses]);

  // 我的计划视图：plannedTerm==null 进抽屉
  const personalBuckets = useMemo(() => {
    const byTerm = emptyTermBuckets<PlannedOfficial>();
    const drawer: PlannedOfficial[] = [];
    const overrides = new Map(
      personalPlan
        .filter((p) => p.item_type === "official" && p.course_code)
        .map((p) => [p.course_code as string, p])
    );

    const plannedTermByCode = new Map<string, number | null>();
    for (const c of courses) {
      const override = overrides.get(c.course_code);
      const plannedTerm = override
        ? override.planned_term // 可能是 null（用户主动放入抽屉）
        : defaultTerm(c);
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
      if (plannedTerm == null) drawer.push(item);
      else byTerm[plannedTerm].push(item);
    }

    for (const t of TERMS) sortPlanned(byTerm[t]);
    sortPlanned(drawer);
    return { byTerm, drawer };
  }, [courses, personalPlan]);

  const manualPlanByTerm = useMemo(() => {
    const byTerm = emptyTermBuckets<PersonalPlanItem>();
    const drawer: PersonalPlanItem[] = [];
    for (const item of personalPlan) {
      if (item.item_type !== "manual") continue;
      if (item.planned_term == null) drawer.push(item);
      else byTerm[item.planned_term].push(item);
    }
    for (const t of TERMS) {
      byTerm[t].sort((a, b) => a.course_name.localeCompare(b.course_name, "zh"));
    }
    drawer.sort((a, b) => a.course_name.localeCompare(b.course_name, "zh"));
    return { byTerm, drawer };
  }, [personalPlan]);

  const totals = useMemo(() => {
    const requiredTotal = reqs.reduce((s, r) => s + r.required_credits, 0);
    const officialPlanTotal = courses.reduce((s, c) => s + c.credits, 0);
    const manualPlanTotal = personalPlan
      .filter((p) => p.item_type === "manual")
      .reduce((s, p) => s + p.credits, 0);
    const completedTotal = done.reduce(
      (s, d) => s + (d.score != null ? d.credits ?? 0 : 0),
      0
    );
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
    if (dragging.fromTerm === term) {
      setDragging(null);
      return;
    }
    try {
      if (dragging.kind === "official") {
        const course = courses.find((c) => c.course_code === dragging.courseCode);
        if (!course) return;
        const defaultPlannedTerm = defaultTerm(course);
        if (defaultPlannedTerm === term) {
          // 拖到默认学期 → 直接清掉个人 override，回到默认位置
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
      } else {
        await api.patchPersonalPlan(dragging.id, { planned_term: term });
        setHint(null);
      }
      await refetchPlan();
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    } finally {
      setDragging(null);
    }
  };

  const dropOnDrawer = async () => {
    if (!dragging || viewMode !== "personal") return;
    if (dragging.fromTerm == null) {
      setDragging(null);
      return;
    }
    try {
      if (dragging.kind === "official") {
        await api.upsertPersonalOfficial({
          course_code: dragging.courseCode,
          planned_term: null,
        });
        setHint(`已放入待安排：${dragging.courseName}`);
      } else {
        await api.patchPersonalPlan(dragging.id, { planned_term: null });
        setHint(`已放入待安排：${dragging.courseName}`);
      }
      await refetchPlan();
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    } finally {
      setDragging(null);
    }
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

  const isPersonal = viewMode === "personal";
  const drawerIsOpen = isPersonal ? drawerOpen.personal : drawerOpen.official;
  const toggleDrawer = () =>
    setDrawerOpen((prev) =>
      isPersonal
        ? { ...prev, personal: !prev.personal }
        : { ...prev, official: !prev.official }
    );

  const officialDrawerCount = officialBuckets.drawer.length;
  const officialDrawerCredits = officialBuckets.drawer.reduce(
    (s, c) => s + c.credits,
    0
  );
  const personalOfficialDrawer = personalBuckets.drawer;
  const personalManualDrawer = manualPlanByTerm.drawer;
  const personalDrawerCount =
    personalOfficialDrawer.length + personalManualDrawer.length;
  const personalDrawerCredits =
    personalOfficialDrawer.reduce((s, p) => s + p.course.credits, 0) +
    personalManualDrawer.reduce((s, p) => s + p.credits, 0);

  return (
    <div className="min-h-screen px-8 py-6">
      <header className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-lg text-ink">时间轴</h1>
          <div className="text-[11px] text-sub mt-0.5">
            官方计划只读 · 我的计划可拖拽，违规只提示不阻止
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-sub/15 bg-card p-0.5">
              <ModeButton active={viewMode === "official"} onClick={() => setViewMode("official")}>
                官方计划
              </ModeButton>
              <ModeButton active={viewMode === "personal"} onClick={() => setViewMode("personal")}>
                我的计划
              </ModeButton>
            </div>
            <DisplayOptionsMenu
              value={displayOptions}
              onChange={setDisplayOptions}
            />
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs pt-1">
          <Stat label="已修学分" value={totals.completedTotal} />
          <Stat
            label={isPersonal ? "我的计划合计" : "官方计划合计"}
            value={isPersonal ? totals.personalPlanTotal : totals.officialPlanTotal}
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
          isPersonal ? (
            <PersonalTermColumn
              key={term}
              term={term}
              officialItems={personalBuckets.byTerm[term]}
              manualItems={manualPlanByTerm.byTerm[term]}
              completedByCode={completedByCode}
              displayOptions={displayOptions}
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
          ) : (
            <OfficialTermColumn
              key={term}
              term={term}
              courses={officialBuckets.byTerm[term]}
              completedByCode={completedByCode}
              displayOptions={displayOptions}
            />
          )
        )}
      </div>

      <Drawer
        title="待安排"
        subtitle={isPersonal ? "灵活课程 / 未安排课程" : "灵活课程（按 offered_term 推断）"}
        countLabel={
          isPersonal
            ? `${personalDrawerCount} 门 · ${round1(personalDrawerCredits)} 学分`
            : `${officialDrawerCount} 门 · ${round1(officialDrawerCredits)} 学分`
        }
        open={drawerIsOpen}
        onToggle={toggleDrawer}
        dropActive={isPersonal && dragging != null && dragging.fromTerm != null}
        onDragOver={
          isPersonal
            ? (event) => {
                if (!dragging || dragging.fromTerm == null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            : undefined
        }
        onDrop={
          isPersonal
            ? (event) => {
                event.preventDefault();
                void dropOnDrawer();
              }
            : undefined
        }
      >
        {isPersonal ? (
          <PersonalDrawerContent
            officialItems={personalOfficialDrawer}
            manualItems={personalManualDrawer}
            completedByCode={completedByCode}
            displayOptions={displayOptions}
            onStartOfficialDrag={startOfficialDrag}
            onStartManualDrag={startManualDrag}
            onDragEnd={() => setDragging(null)}
            onAdd={() => setAddTerm("drawer")}
            onDeleteManual={async (id) => {
              await api.deletePersonalPlan(id);
              await refetchPlan();
            }}
          />
        ) : (
          <OfficialDrawerContent
            courses={officialBuckets.drawer}
            completedByCode={completedByCode}
            displayOptions={displayOptions}
          />
        )}
      </Drawer>

      {addTerm != null && (
        <ManualCourseDialog
          termNumber={addTerm === "drawer" ? null : addTerm}
          onClose={() => setAddTerm(null)}
          onSubmit={async (input) => {
            await api.createPersonalManual({
              planned_term: input.term_number,
              course_name: input.course_name,
              credits: input.credits,
              category_code: input.category_code,
              course_nature: input.course_nature,
              note: input.note,
              is_interdisciplinary: input.is_interdisciplinary,
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
  displayOptions,
}: {
  term: number;
  courses: CourseWithCategory[];
  completedByCode: Map<string, number | null>;
  displayOptions: CourseCardDisplayOptions;
}) {
  const credits = courses.reduce((s, c) => s + c.credits, 0);
  return (
    <TermFrame term={term} credits={credits}>
      {courses.map((course) => (
        <CourseCard
          key={`${term}-${course.course_code}`}
          course={course}
          completedScore={completedByCode.get(course.course_code)}
          displayOptions={displayOptions}
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
  displayOptions,
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
  displayOptions: CourseCardDisplayOptions;
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
      variant="personal"
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
          warning={item.warning ?? undefined}
          displayOptions={displayOptions}
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
              displayOptions={displayOptions}
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

function Drawer({
  title,
  subtitle,
  countLabel,
  open,
  onToggle,
  dropActive,
  onDragOver,
  onDrop,
  children,
}: {
  title: string;
  subtitle: string;
  countLabel: string;
  open: boolean;
  onToggle: () => void;
  dropActive?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "mt-2 rounded-lg border bg-card transition-colors " +
        (dropActive
          ? "border-brand bg-brand/5"
          : "border-dashed border-sub/30")
      }
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-sub/5 transition-colors rounded-t-lg"
      >
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-ink flex items-center gap-1.5">
            <span
              className={
                "inline-block transition-transform " +
                (open ? "rotate-90" : "")
              }
              style={{ fontSize: 10 }}
            >
              ▶
            </span>
            {title}
          </span>
          <span className="text-[11px] text-sub">{subtitle}</span>
        </div>
        <span className="text-[11px] text-sub tabular-nums">{countLabel}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 max-h-[280px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

function OfficialDrawerContent({
  courses,
  completedByCode,
  displayOptions,
}: {
  courses: CourseWithCategory[];
  completedByCode: Map<string, number | null>;
  displayOptions: CourseCardDisplayOptions;
}) {
  if (courses.length === 0) {
    return (
      <div className="text-[11px] text-sub/60 italic py-4 text-center">
        没有灵活安排的课程
      </div>
    );
  }
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
    >
      {courses.map((course) => (
        <CourseCard
          key={`official-drawer-${course.course_code}`}
          course={course}
          completedScore={completedByCode.get(course.course_code)}
          displayOptions={displayOptions}
        />
      ))}
    </div>
  );
}

function PersonalDrawerContent({
  officialItems,
  manualItems,
  completedByCode,
  displayOptions,
  onStartOfficialDrag,
  onStartManualDrag,
  onDragEnd,
  onAdd,
  onDeleteManual,
}: {
  officialItems: PlannedOfficial[];
  manualItems: PersonalPlanItem[];
  completedByCode: Map<string, number | null>;
  displayOptions: CourseCardDisplayOptions;
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
  const empty = officialItems.length === 0 && manualItems.length === 0;
  return (
    <div className="flex flex-col gap-2">
      {empty && (
        <div className="text-[11px] text-sub/60 italic py-4 text-center border border-dashed border-sub/20 rounded-md">
          把课程拖到这里 = 放入待安排；或点下方按钮直接添加
        </div>
      )}
      {!empty && (
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
        >
          {officialItems.map((item) => (
            <CourseCard
              key={`personal-drawer-${item.course.course_code}`}
              course={item.course}
              completedScore={completedByCode.get(item.course.course_code)}
              draggable
              displayOptions={displayOptions}
              onDragStart={(event) => onStartOfficialDrag(event, item)}
              onDragEnd={onDragEnd}
            />
          ))}
          {manualItems.map((item) => (
            <ManualCourseCard
              key={`drawer-manual-${item.id}`}
              course={item}
              draggable
              displayOptions={displayOptions}
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
      <button
        type="button"
        onClick={onAdd}
        className="self-start h-8 px-3 rounded-md border border-dashed border-sub/25 text-[11px] text-sub hover:text-ink hover:border-sub/45 hover:bg-sub/5 transition-colors"
      >
        + 添加课程到待安排
      </button>
    </div>
  );
}

function TermFrame({
  term,
  credits,
  children,
  variant = "official",
  dropActive = false,
  onDragOver,
  onDrop,
}: {
  term: number;
  credits: number;
  children: React.ReactNode;
  variant?: ViewMode;
  dropActive?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  const isPersonal = variant === "personal";
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "flex-shrink-0 w-[180px] bg-card border rounded-lg p-2.5 flex flex-col transition-colors " +
        (dropActive
          ? "border-brand bg-brand/5"
          : isPersonal
          ? "border-brand/25"
          : "border-sub/20")
      }
    >
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-sub tabular-nums">
            {isPersonal && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            )}
            学期 {term}
          </div>
          <div className="text-sm text-ink">{TERM_LABEL[term]}</div>
        </div>
        <div className="text-[11px] text-sub tabular-nums">{round1(credits)} 学分</div>
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

function DisplayOptionsMenu({
  value,
  onChange,
}: {
  value: CourseCardDisplayOptions;
  onChange: (next: CourseCardDisplayOptions) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedCount = COURSE_CARD_DISPLAY_ITEMS.filter((item) => value[item.key]).length;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const setOption = (
    key: (typeof COURSE_CARD_DISPLAY_ITEMS)[number]["key"],
    checked: boolean
  ) => {
    onChange({ ...value, [key]: checked });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="h-7 rounded-lg border border-sub/15 bg-card px-3 text-xs text-sub hover:text-ink hover:border-sub/30 hover:bg-sub/5 transition-colors"
      >
        显示内容 · {selectedCount}/{COURSE_CARD_DISPLAY_ITEMS.length}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 w-36 rounded-lg border border-sub/15 bg-card p-1"
          style={{
            boxShadow: "0 14px 34px rgb(var(--shadow-rgb) / var(--shadow-soft))",
          }}
        >
          {COURSE_CARD_DISPLAY_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-ink hover:bg-sub/5"
            >
              <input
                type="checkbox"
                checked={value[item.key]}
                onChange={(event) => setOption(item.key, event.currentTarget.checked)}
                className="h-3.5 w-3.5 accent-[rgb(var(--brand)/1)]"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      )}
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
