import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TrashEntry } from "../lib/api";
import { parseOfferedTerm, TERM_LABEL } from "../lib/offeredTerm";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import {
  COURSE_CARD_DISPLAY_ITEMS,
  loadCourseCardDisplayOptions,
  saveCourseCardDisplayOptions,
} from "../lib/courseCardDisplay";
import type {
  CourseCardDisplayOptions,
  PlanCustomCourse,
  PlanProgramCourse,
  ProgramRequirement,
} from "../types";
import { CourseCard } from "../components/CourseCard";
import { ManualCourseDialog } from "../components/ManualCourseDialog";
import { toInstances, type CourseInstance } from "../lib/progress";

const TERMS = [1, 2, 3, 4, 5, 6, 7, 8];

type ViewMode = "official" | "personal";

type DragPayload = {
  source: "program" | "custom";
  course_code: string;
  course_name: string;
  fromTerm: number | null;
};

const DRAWER_OPEN_KEY = "study-journey:drawer-open";
const TRASH_OPEN_KEY = "study-journey:trash-open";
type DrawerState = { official: boolean; personal: boolean };

/** 判定一门 program 课是否允许用户删除 */
function isUserDeletableProgram(c: CourseInstance): boolean {
  if (c.source !== "program") return false;
  if (c.category_code !== "general_education") return false;
  return ["选修", "跨专业", "经法管融通"].includes(c.requirement_type);
}

function loadDrawerState(): DrawerState {
  if (typeof window === "undefined") {
    return { official: false, personal: true };
  }
  try {
    const raw = window.localStorage.getItem(DRAWER_OPEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { official: !!parsed.official, personal: parsed.personal !== false };
    }
  } catch {
    // ignore
  }
  return { official: false, personal: true };
}

export default function Timeline() {
  const [programCourses, setProgramCourses] = useState<PlanProgramCourse[]>([]);
  const [customCourses, setCustomCourses] = useState<PlanCustomCourse[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
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
  const [trashOpen, setTrashOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(TRASH_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [trash, setTrash] = useState<TrashEntry[]>([]);

  const refetchAll = async () => {
    const [p, c, t] = await Promise.all([
      api.planCourses(),
      api.customCourses(),
      api.trash(),
    ]);
    setProgramCourses(p);
    setCustomCourses(c);
    setTrash(t);
  };

  useEffect(() => {
    Promise.all([
      api.planCourses(),
      api.customCourses(),
      api.programRequirements(),
      api.trash(),
    ])
      .then(([p, c, r, t]) => {
        setProgramCourses(p);
        setCustomCourses(c);
        setReqs(r);
        setTrash(t);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRASH_OPEN_KEY, trashOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [trashOpen]);

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

  // ── Official 视图分桶（按 official_term）────────────
  const officialBuckets = useMemo(() => {
    const byTerm = emptyTermBuckets<CourseInstance>();
    const drawer: CourseInstance[] = [];
    const instances = toInstances(programCourses, []);
    for (const c of instances) {
      const officialTerm = programCourses.find(
        (p) => p.course_code === c.course_code
      )?.official_term;
      const parsed = parseOfferedTerm(officialTerm ?? null);
      if (parsed.isFlexible || parsed.primary == null) drawer.push(c);
      else byTerm[parsed.primary].push(c);
    }
    for (const t of TERMS) sortInstances(byTerm[t]);
    sortInstances(drawer);
    return { byTerm, drawer };
  }, [programCourses]);

  // ── Personal 视图分桶（按 planned_term，包含 custom）──
  const personalBuckets = useMemo(() => {
    const byTerm = emptyTermBuckets<CourseInstance>();
    const drawer: CourseInstance[] = [];
    const instances = toInstances(programCourses, customCourses);
    for (const c of instances) {
      if (c.planned_term == null) drawer.push(c);
      else byTerm[c.planned_term].push(c);
    }
    for (const t of TERMS) sortInstances(byTerm[t]);
    sortInstances(drawer);
    return { byTerm, drawer };
  }, [programCourses, customCourses]);

  // ── 头部统计 ───────────────────────────────────
  const totals = useMemo(() => {
    const requiredTotal = reqs.reduce((s, r) => s + r.required_credits, 0);

    // 官方计划合计：所有 plan_program_courses 学分，剔除"跨专业"
    const officialPlanTotal = programCourses
      .filter((p) => p.requirement_type !== "跨专业")
      .reduce((s, p) => s + p.credits, 0);

    // 我的计划合计：仅时间线上的课（planned_term != null）—— 含 program 与 custom，剔除跨专业
    const personalOnTimeline =
      programCourses
        .filter((p) => p.requirement_type !== "跨专业" && p.planned_term != null)
        .reduce((s, p) => s + p.credits, 0) +
      customCourses
        .filter((c) => c.requirement_type !== "跨专业" && c.term_number != null)
        .reduce((s, c) => s + c.credits, 0);

    // 已修学分：study_status='已修读'
    const completedTotal =
      programCourses
        .filter((p) => p.study_status === "已修读" && p.requirement_type !== "跨专业")
        .reduce((s, p) => s + p.credits, 0) +
      customCourses
        .filter((c) => c.study_status === "已修读" && c.requirement_type !== "跨专业")
        .reduce((s, c) => s + c.credits, 0);

    return {
      requiredTotal: round1(requiredTotal),
      officialPlanTotal: round1(officialPlanTotal),
      personalPlanTotal: round1(personalOnTimeline),
      completedTotal: round1(completedTotal),
    };
  }, [reqs, programCourses, customCourses]);

  // ── 拖拽 ────────────────────────────────────────
  const startDrag = (
    event: React.DragEvent<HTMLDivElement>,
    instance: CourseInstance
  ) => {
    if (viewMode !== "personal") return;
    const payload: DragPayload = {
      source: instance.source,
      course_code: instance.course_code,
      course_name: instance.course_name,
      fromTerm: instance.planned_term,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-study-journey", JSON.stringify(payload));
    setDragging(payload);
    setHint(null);
  };

  const writeTerm = async (
    payload: DragPayload,
    nextTerm: number | null
  ): Promise<void> => {
    if (payload.source === "program") {
      await api.patchPlanCourse(payload.course_code, { planned_term: nextTerm });
    } else {
      await api.patchCustomCourse(payload.course_code, { term_number: nextTerm });
    }
  };

  const dropOnTerm = async (term: number) => {
    if (!dragging || viewMode !== "personal") return;
    if (dragging.fromTerm === term) {
      setDragging(null);
      return;
    }
    try {
      await writeTerm(dragging, term);
      setHint(`已放入第 ${term} 学期：${dragging.course_name}`);
      await refetchAll();
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
      await writeTerm(dragging, null);
      setHint(`已放入待安排：${dragging.course_name}`);
      await refetchAll();
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    } finally {
      setDragging(null);
    }
  };

  const deleteInstance = async (c: CourseInstance) => {
    if (!window.confirm(`将课程「${c.course_name}」移入垃圾篓？`)) return;
    try {
      if (c.source === "custom") {
        await api.deleteCustomCourse(c.course_code);
      } else if (isUserDeletableProgram(c)) {
        await api.deletePlanCourse(c.course_code);
      } else {
        setHint("该课程不可删除");
        return;
      }
      setHint(`已移入垃圾篓：${c.course_name}`);
      await refetchAll();
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    }
  };

  const restoreFromTrash = async (entry: TrashEntry) => {
    try {
      await api.restoreTrash(entry.id);
      setHint(`已还原：${entry.course_name}`);
      await refetchAll();
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    }
  };

  const permanentDelete = async (entry: TrashEntry) => {
    if (!window.confirm(`彻底删除「${entry.course_name}」？此操作不可撤销。`)) return;
    try {
      await api.permanentDeleteTrash(entry.id);
      await refetchAll();
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    }
  };

  const emptyTrash = async () => {
    if (trash.length === 0) return;
    if (!window.confirm(`清空垃圾篓（共 ${trash.length} 项）？此操作不可撤销。`)) return;
    try {
      await api.emptyTrash();
      await refetchAll();
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sub">加载中…</div>;
  }
  if (err) {
    return <div className="min-h-screen flex items-center justify-center text-red-500">加载失败：{err}</div>;
  }

  const isPersonal = viewMode === "personal";
  const drawerIsOpen = isPersonal ? drawerOpen.personal : drawerOpen.official;
  const toggleDrawer = () =>
    setDrawerOpen((prev) =>
      isPersonal ? { ...prev, personal: !prev.personal } : { ...prev, official: !prev.official }
    );

  const drawerItems = isPersonal ? personalBuckets.drawer : officialBuckets.drawer;
  const drawerCredits = drawerItems.reduce((s, c) => s + c.credits, 0);

  // 用于卡片 tooltip 显示开课建议
  const officialTermByCode = new Map(
    programCourses.map((p) => [p.course_code, p.official_term])
  );

  return (
    <div className="min-h-screen px-8 py-6">
      <header className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-lg text-ink">时间轴</h1>
          <div className="text-[11px] text-sub mt-0.5">
            官方计划只读 · 我的计划可拖拽 · 跨专业不计入学分合计
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-sub/15 bg-card p-0.5">
              <ModeButton active={!isPersonal} onClick={() => setViewMode("official")}>官方计划</ModeButton>
              <ModeButton active={isPersonal} onClick={() => setViewMode("personal")}>我的计划</ModeButton>
            </div>
            <DisplayOptionsMenu value={displayOptions} onChange={setDisplayOptions} />
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
        {TERMS.map((term) => (
          <TermColumn
            key={term}
            term={term}
            items={isPersonal ? personalBuckets.byTerm[term] : officialBuckets.byTerm[term]}
            officialTermByCode={officialTermByCode}
            displayOptions={displayOptions}
            dragging={dragging}
            interactive={isPersonal}
            onDrop={dropOnTerm}
            onStartDrag={startDrag}
            onDragEnd={() => setDragging(null)}
            onAdd={isPersonal ? () => setAddTerm(term) : undefined}
            onDelete={isPersonal ? deleteInstance : undefined}
          />
        ))}
      </div>

      <Drawer
        title="待安排"
        subtitle={isPersonal ? "灵活课程 / 未安排课程" : "灵活课程（按 official_term 推断）"}
        countLabel={`${drawerItems.length} 门 · ${round1(drawerCredits)} 学分`}
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
        <DrawerContent
          items={drawerItems}
          officialTermByCode={officialTermByCode}
          displayOptions={displayOptions}
          interactive={isPersonal}
          onStartDrag={startDrag}
          onDragEnd={() => setDragging(null)}
          onAdd={isPersonal ? () => setAddTerm("drawer") : undefined}
          onDelete={isPersonal ? deleteInstance : undefined}
        />
      </Drawer>

      <Drawer
        title="垃圾篓"
        subtitle="被删除的课程，可还原或永久删除"
        countLabel={`${trash.length} 项`}
        open={trashOpen}
        onToggle={() => setTrashOpen((v) => !v)}
        rightAction={
          trash.length > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void emptyTrash();
              }}
              className="text-[11px] text-sub hover:text-red-500 transition-colors"
            >
              清空
            </button>
          ) : null
        }
      >
        <TrashContent
          entries={trash}
          onRestore={restoreFromTrash}
          onPermanentDelete={permanentDelete}
        />
      </Drawer>

      {addTerm != null && (
        <ManualCourseDialog
          termNumber={addTerm === "drawer" ? null : addTerm}
          onClose={() => setAddTerm(null)}
          onSubmit={async (input) => {
            await api.createCustomCourse({
              course_code: input.course_code,
              course_name: input.course_name,
              category_code: input.category_code,
              requirement_type: input.requirement_type,
              credits: input.credits,
              term_number: input.term_number,
              credit_count_to: input.credit_count_to,
              study_status: "计划修读",
              note: input.note,
            });
            await refetchAll();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 学期列
// ─────────────────────────────────────────────
function TermColumn({
  term,
  items,
  officialTermByCode,
  displayOptions,
  dragging,
  interactive,
  onDrop,
  onStartDrag,
  onDragEnd,
  onAdd,
  onDelete,
}: {
  term: number;
  items: CourseInstance[];
  officialTermByCode: Map<string, string | null>;
  displayOptions: CourseCardDisplayOptions;
  dragging: DragPayload | null;
  interactive: boolean;
  onDrop: (term: number) => void;
  onStartDrag: (
    event: React.DragEvent<HTMLDivElement>,
    instance: CourseInstance
  ) => void;
  onDragEnd: () => void;
  onAdd?: () => void;
  onDelete?: (instance: CourseInstance) => void;
}) {
  const credits = items.reduce((s, c) => s + c.credits, 0);
  const isDropTarget = interactive && dragging != null && dragging.fromTerm !== term;

  return (
    <div
      onDragOver={
        interactive
          ? (event) => {
              if (!dragging) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDrop={
        interactive
          ? (event) => {
              event.preventDefault();
              void onDrop(term);
            }
          : undefined
      }
      className={
        "flex-shrink-0 w-[180px] bg-card border rounded-lg p-2.5 flex flex-col transition-colors " +
        (isDropTarget
          ? "border-brand bg-brand/5"
          : interactive
          ? "border-brand/25"
          : "border-sub/20")
      }
    >
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-sub tabular-nums">
            {interactive && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            )}
            学期 {term}
          </div>
          <div className="text-sm text-ink">{TERM_LABEL[term]}</div>
        </div>
        <div className="text-[11px] text-sub tabular-nums">{round1(credits)} 学分</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.length === 0 && (
          <div className="text-[10px] text-sub/60 italic px-1 py-2">暂无安排</div>
        )}
        {items.map((c) => (
          <CourseCard
            key={`${term}-${c.source}-${c.course_code}`}
            course={c}
            officialTerm={officialTermByCode.get(c.course_code) ?? null}
            draggable={interactive}
            displayOptions={displayOptions}
            onDragStart={(e) => onStartDrag(e, c)}
            onDragEnd={onDragEnd}
            onDelete={
              onDelete && (c.source === "custom" || isUserDeletableProgram(c))
                ? () => onDelete(c)
                : undefined
            }
          />
        ))}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="mt-1 h-8 rounded-md border border-dashed border-sub/25 text-[11px] text-sub hover:text-ink hover:border-sub/45 hover:bg-sub/5 transition-colors"
          >
            + 添加课程
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 抽屉
// ─────────────────────────────────────────────
function Drawer({
  title,
  subtitle,
  countLabel,
  open,
  onToggle,
  dropActive,
  onDragOver,
  onDrop,
  rightAction,
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
  rightAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "mt-2 rounded-lg border bg-card transition-colors " +
        (dropActive ? "border-brand bg-brand/5" : "border-dashed border-sub/30")
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
              className={"inline-block transition-transform " + (open ? "rotate-90" : "")}
              style={{ fontSize: 10 }}
            >
              ▶
            </span>
            {title}
          </span>
          <span className="text-[11px] text-sub">{subtitle}</span>
        </div>
        <span className="flex items-center gap-2 text-[11px] text-sub tabular-nums">
          {rightAction}
          <span>{countLabel}</span>
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 max-h-[280px] overflow-y-auto">{children}</div>}
    </div>
  );
}

function DrawerContent({
  items,
  officialTermByCode,
  displayOptions,
  interactive,
  onStartDrag,
  onDragEnd,
  onAdd,
  onDelete,
}: {
  items: CourseInstance[];
  officialTermByCode: Map<string, string | null>;
  displayOptions: CourseCardDisplayOptions;
  interactive: boolean;
  onStartDrag: (e: React.DragEvent<HTMLDivElement>, c: CourseInstance) => void;
  onDragEnd: () => void;
  onAdd?: () => void;
  onDelete?: (instance: CourseInstance) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && (
        <div className="text-[11px] text-sub/60 italic py-4 text-center border border-dashed border-sub/20 rounded-md">
          {interactive ? "把课程拖到这里 = 放入待安排" : "没有灵活安排的课程"}
        </div>
      )}
      {items.length > 0 && (
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
        >
          {items.map((c) => (
            <CourseCard
              key={`drawer-${c.source}-${c.course_code}`}
              course={c}
              officialTerm={officialTermByCode.get(c.course_code) ?? null}
              draggable={interactive}
              displayOptions={displayOptions}
              onDragStart={(e) => onStartDrag(e, c)}
              onDragEnd={onDragEnd}
              onDelete={
                onDelete && (c.source === "custom" || isUserDeletableProgram(c))
                  ? () => onDelete(c)
                  : undefined
              }
            />
          ))}
        </div>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="self-start h-8 px-3 rounded-md border border-dashed border-sub/25 text-[11px] text-sub hover:text-ink hover:border-sub/45 hover:bg-sub/5 transition-colors"
        >
          + 添加课程到待安排
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 垃圾篓内容
// ─────────────────────────────────────────────
function TrashContent({
  entries,
  onRestore,
  onPermanentDelete,
}: {
  entries: TrashEntry[];
  onRestore: (entry: TrashEntry) => void;
  onPermanentDelete: (entry: TrashEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="text-[11px] text-sub/60 italic py-4 text-center">
        垃圾篓是空的
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((e) => {
        const credits = (e.snapshot as any)?.credits ?? null;
        const category = (e.snapshot as any)?.category_name ?? "";
        const reqType = (e.snapshot as any)?.requirement_type ?? "";
        return (
          <div
            key={e.id}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-sub/15 bg-sub/5"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-ink truncate">{e.course_name}</div>
              <div className="text-[10px] text-sub mt-0.5">
                {e.course_code}
                {category && ` · ${category}`}
                {reqType && ` · ${reqType}`}
                {credits != null && ` · ${credits} 学分`}
                <span className="ml-2 text-sub/60">删于 {e.deleted_at}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onRestore(e)}
                className="h-7 px-2 rounded-md text-[11px] text-sub hover:text-ink hover:bg-sub/10 transition-colors"
              >
                还原
              </button>
              <button
                type="button"
                onClick={() => onPermanentDelete(e)}
                className="h-7 px-2 rounded-md text-[11px] text-sub hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                永久删除
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// 小组件
// ─────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex flex-wrap gap-3 mb-5 text-[11px] text-sub">
      {Object.entries(CATEGORY_STYLE).map(([code, s]) => (
        <div key={code} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.name}
        </div>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <span className="inline-block w-4 h-2.5 rounded-sm border border-sub/50" />
        必修（实线）
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-2.5 rounded-sm border border-dashed border-sub/50" />
        选修/经融/自加（虚线）
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
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
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

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((c) => !c)}
        className="h-7 rounded-lg border border-sub/15 bg-card px-3 text-xs text-sub hover:text-ink hover:border-sub/30 hover:bg-sub/5 transition-colors"
      >
        显示内容 · {selectedCount}/{COURSE_CARD_DISPLAY_ITEMS.length}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 w-36 rounded-lg border border-sub/15 bg-card p-1"
          style={{ boxShadow: "0 14px 34px rgb(var(--shadow-rgb) / var(--shadow-soft))" }}
        >
          {COURSE_CARD_DISPLAY_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-ink hover:bg-sub/5"
            >
              <input
                type="checkbox"
                checked={value[item.key]}
                onChange={(event) => onChange({ ...value, [item.key]: event.currentTarget.checked })}
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end">
      <div className="text-[10px] text-sub uppercase tracking-wide">{label}</div>
      <div className="text-lg text-ink tabular-nums">{round1(value)}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────
function emptyTermBuckets<T>(): Record<number, T[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
}

function sortInstances(arr: CourseInstance[]) {
  arr.sort((a, b) => {
    // 必修在前
    const ar = a.requirement_type === "必修" ? 0 : 1;
    const br = b.requirement_type === "必修" ? 0 : 1;
    if (ar !== br) return ar - br;
    return a.course_name.localeCompare(b.course_name, "zh");
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
