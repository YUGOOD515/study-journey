import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatCredits } from "../lib/credits";
import { myPlanTotalCredits } from "../lib/planTotal";
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
  PlanCoursePatch,
  ProgramRequirement,
  SemesterCourse,
  TrashItem,
} from "../types";
import { CourseCard } from "../components/CourseCard";
import { ManualCourseCard } from "../components/ManualCourseCard";
import { ManualCourseDialog } from "../components/ManualCourseDialog";
import { CourseHoverCard, type CourseHoverInfo } from "../components/CourseHoverCard";
import { useHoverIntentTriangle } from "../hooks/useHoverIntentTriangle";

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

type ActiveDrawer = "pending" | "trash" | null;

export default function Timeline({
  onOpenSchedule,
}: {
  onOpenSchedule?: (term: number) => void;
}) {
  const [courses, setCourses] = useState<CourseWithCategory[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
  const [done, setDone] = useState<SemesterCourse[]>([]);
  const [personalPlan, setPersonalPlan] = useState<PersonalPlanItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("personal");
  const [displayOptions, setDisplayOptions] = useState<CourseCardDisplayOptions>(
    loadCourseCardDisplayOptions
  );
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addTerm, setAddTerm] = useState<number | null | "drawer">(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>(null);
  const viewportWidth = useViewportWidth();
  const clearHint = useCallback(() => setHint(null), []);

  useEffect(() => {
    Promise.all([
      api.coursesWithCategory(),
      api.programRequirements(),
      api.semesterCourses(),
      api.personalPlan(),
      api.trash(),
    ])
      .then(([c, r, d, p, t]) => {
        setCourses(c);
        setReqs(r);
        setDone(d);
        setPersonalPlan(p);
        setTrashItems(t);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    saveCourseCardDisplayOptions(displayOptions);
  }, [displayOptions]);


  const refetchPlan = async () => {
    const [p, t] = await Promise.all([api.personalPlan(), api.trash()]);
    setPersonalPlan(p);
    setTrashItems(t);
  };

  const refetchTimelineData = async () => {
    const [c, d, p, t] = await Promise.all([
      api.coursesWithCategory(),
      api.semesterCourses(),
      api.personalPlan(),
      api.trash(),
    ]);
    setCourses(c);
    setDone(d);
    setPersonalPlan(p);
    setTrashItems(t);
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
        : c.actual_term ?? c.planned_term ?? defaultTerm(c);
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
    const seenIds = new Set<number>();

    for (const item of personalPlan) {
      if (item.item_type !== "manual") continue;
      seenIds.add(item.id);
      if (item.planned_term == null) drawer.push(item);
      else byTerm[item.planned_term].push(item);
    }

    // 自定义课程不只存在于“计划修读”里；已修读/正在修读的 custom 课也应该出现在
    // “我的计划”时间轴上，否则时间轴合计和旅迹页口径会断开。
    for (const item of done) {
      if (
        item.source !== "manual" ||
        item.id == null ||
        item.category_code == null ||
        item.course_nature == null ||
        seenIds.has(item.id)
      ) {
        continue;
      }
      const normalized: PersonalPlanItem = {
        id: item.id,
        item_type: "manual",
        course_code: item.course_code,
        planned_term: item.term_number,
        course_name: item.course_name,
        credits: item.credits,
        lecture_hours: 0,
        experiment_hours: 0,
        extra_hours: 0,
        prerequisite_course_code: null,
        prerequisite_course_name: null,
        category_code: item.category_code,
        category_name: CATEGORY_STYLE[item.category_code]?.name ?? item.category_code,
        course_nature: item.course_nature,
        offered_term: null,
        course_category: null,
        score: item.score,
        note: item.note,
        is_interdisciplinary: item.is_interdisciplinary,
        assigned_to: item.assigned_to,
        credit_count_to: item.credit_count_to,
      };
      if (normalized.planned_term == null) drawer.push(normalized);
      else byTerm[normalized.planned_term].push(normalized);
    }

    for (const t of TERMS) {
      byTerm[t].sort((a, b) => a.course_name.localeCompare(b.course_name, "zh"));
    }
    drawer.sort((a, b) => a.course_name.localeCompare(b.course_name, "zh"));
    return { byTerm, drawer };
  }, [personalPlan, done]);

  const totals = useMemo(() => {
    const requiredTotal = reqs.reduce((s, r) => s + r.required_credits, 0);
    const officialPlanTotal = courses.reduce((s, c) => s + c.credits, 0);

    const completedTotal = done.reduce(
      (s, d) => s + (d.score != null ? d.credits ?? 0 : 0),
      0
    );
    return {
      requiredTotal,
      officialPlanTotal,
      // “我的计划合计”：与旅迹页共用同一套口径（lib/planTotal）
      personalPlanTotal: myPlanTotalCredits(courses, personalPlan, done),
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
  const pendingIsOpen = activeDrawer === "pending";
  const trashIsOpen = activeDrawer === "trash";
  const toggleActiveDrawer = (drawer: Exclude<ActiveDrawer, null>) =>
    setActiveDrawer((current) => (current === drawer ? null : drawer));

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
  const trashCount = trashItems.length;
  const trashCredits = trashItems.reduce((s, item) => s + item.credits, 0);
  const pendingItemCount = isPersonal ? personalDrawerCount : officialDrawerCount;
  const pendingPanelWidth = getDrawerPanelWidth(
    pendingItemCount,
    viewportWidth,
    isPersonal ? DRAWER_MIN_PANEL_WIDTH : DRAWER_EMPTY_PANEL_WIDTH
  );
  const trashPanelWidth = getDrawerPanelWidth(trashCount, viewportWidth, TRASH_DRAWER_MIN_PANEL_WIDTH);
  const pendingDrawerColumns = getDrawerColumns(pendingItemCount, viewportWidth);
  const trashDrawerColumns = getDrawerColumns(trashCount, viewportWidth);
  const anyDrawerOpen = isPersonal ? activeDrawer != null : pendingIsOpen;

  const moveOfficialToTrash = async (course: CourseWithCategory) => {
    if (!window.confirm(`将「${course.course_name}」移入垃圾篓？`)) return;
    try {
      await api.trashOfficial(course.course_code);
      await refetchTimelineData();
      setHint(`已移入垃圾篓：${course.course_name}`);
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    }
  };

  const dropOnTrash = async () => {
    if (!dragging || viewMode !== "personal") return;
    try {
      if (dragging.kind === "official") {
        await api.trashOfficial(dragging.courseCode);
      } else {
        await api.deletePersonalPlan(dragging.id);
      }
      await refetchTimelineData();
      setActiveDrawer("trash");
      setHint(`宸茬Щ鍏ュ瀮鍦剧瘬锛?{dragging.courseName}`);
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    } finally {
      setDragging(null);
    }
  };

  const saveProgramCourse = async (courseCode: string, patch: PlanCoursePatch) => {
    await api.updateProgramCourse(courseCode, patch);
    await refetchTimelineData();
    setHint("课程信息已保存");
  };

  const saveCustomCourse = async (id: number, patch: PlanCoursePatch) => {
    await api.updateCustomCourse(id, patch);
    await refetchTimelineData();
    setHint("课程信息已保存");
  };

  const restoreTrashItem = async (item: TrashItem) => {
    try {
      await api.restoreTrashItem(item);
      await refetchTimelineData();
      setHint(`已恢复：${item.course_name}`);
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    }
  };

  const permanentlyDeleteTrashItem = async (item: TrashItem) => {
    const label = item.source === "program" ? "从我的计划中永久移除" : "永久删除";
    if (!window.confirm(`${label}「${item.course_name}」？此操作无法从垃圾篓恢复。`)) return;
    try {
      await api.permanentlyDeleteTrashItem(item);
      await refetchTimelineData();
      setHint(`${label}：${item.course_name}`);
    } catch (e: any) {
      setHint(String(e?.message ?? e));
    }
  };

  return (
    <div className="min-h-screen px-8 py-6 pb-28">
      <header className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-lg text-ink">时间轴</h1>
          <div className="text-[11px] text-sub mt-0.5">
            我的计划可拖拽 · 官方计划只读，违规只提示不阻止
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-sub/15 bg-card p-0.5">
              <ModeButton active={viewMode === "personal"} onClick={() => setViewMode("personal")}>
                我的计划
              </ModeButton>
              <ModeButton active={viewMode === "official"} onClick={() => setViewMode("official")}>
                官方计划
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

      <FloatingHint message={hint} drawerOpen={anyDrawerOpen} onClose={clearHint} />

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
              onDeleteOfficial={moveOfficialToTrash}
              onSaveOfficial={saveProgramCourse}
              onSaveManual={saveCustomCourse}
              onDeleteManual={async (id) => {
                await api.deletePersonalPlan(id);
                await refetchPlan();
              }}
              onOpenSchedule={() => onOpenSchedule?.(term)}
            />
          ) : (
            <OfficialTermColumn
              key={term}
              term={term}
              courses={officialBuckets.byTerm[term]}
              completedByCode={completedByCode}
              displayOptions={displayOptions}
              onSaveCourse={saveProgramCourse}
              onOpenSchedule={() => onOpenSchedule?.(term)}
            />
          )
        )}
      </div>

      {isPersonal ? (
        <DualDrawer
          active={activeDrawer}
          onToggle={toggleActiveDrawer}
          pendingCountLabel={`${personalDrawerCount} 门 · ${formatCredits(personalDrawerCredits)} 学分`}
          trashCountLabel={`${trashCount} 门 · ${formatCredits(trashCredits)} 学分`}
          pendingPanelWidth={pendingPanelWidth}
          trashPanelWidth={trashPanelWidth}
          pendingDropActive={dragging != null && dragging.fromTerm != null}
          trashDropActive={dragging != null}
          onPendingDragOver={(event) => {
            if (!dragging || dragging.fromTerm == null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onPendingDrop={(event) => {
            event.preventDefault();
            void dropOnDrawer();
          }}
          onTrashDragOver={(event) => {
            if (!dragging) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onTrashDrop={(event) => {
            event.preventDefault();
            void dropOnTrash();
          }}
          pendingContent={
            <PersonalDrawerContent
              officialItems={personalOfficialDrawer}
              manualItems={personalManualDrawer}
              completedByCode={completedByCode}
              displayOptions={displayOptions}
              onStartOfficialDrag={startOfficialDrag}
              onStartManualDrag={startManualDrag}
              onDragEnd={() => setDragging(null)}
              onAdd={() => setAddTerm("drawer")}
              onDeleteOfficial={moveOfficialToTrash}
              onSaveOfficial={saveProgramCourse}
              onSaveManual={saveCustomCourse}
              onDeleteManual={async (id) => {
                await api.deletePersonalPlan(id);
                await refetchPlan();
              }}
              columns={pendingDrawerColumns}
            />
          }
          trashContent={
            <TrashDrawerContent
              items={trashItems}
              onRestore={restoreTrashItem}
              onPermanentDelete={permanentlyDeleteTrashItem}
              onRestoreAll={async () => {
                await api.restoreAllTrash();
                await refetchTimelineData();
                setHint("已恢复垃圾篓中的全部课程");
              }}
              onEmpty={async () => {
                if (!window.confirm("清空垃圾篓？官方课程会从我的计划中永久移除，自定义课程会被永久删除。")) return;
                await api.emptyTrash();
                await refetchTimelineData();
                setHint("垃圾篓已清空");
              }}
              columns={trashDrawerColumns}
            />
          }
        />
      ) : (
        <Drawer
          title="待安排"
          subtitle="灵活课程（按 offered_term 推断）"
          countLabel={`${officialDrawerCount} 门 · ${formatCredits(officialDrawerCredits)} 学分`}
          open={pendingIsOpen}
          panelWidth={pendingPanelWidth}
          onToggle={() => toggleActiveDrawer("pending")}
        >
          <OfficialDrawerContent
            courses={officialBuckets.drawer}
            completedByCode={completedByCode}
            displayOptions={displayOptions}
            onSaveCourse={saveProgramCourse}
            columns={pendingDrawerColumns}
          />
        </Drawer>
      )}

      {addTerm != null && (
        <ManualCourseDialog
          termNumber={addTerm === "drawer" ? null : addTerm}
          onClose={() => setAddTerm(null)}
          onSubmit={async (input) => {
            await api.createPersonalManual({
              planned_term: input.term_number,
              course_code: input.course_code,
              course_name: input.course_name,
              credits: input.credits,
              category_code: input.category_code,
              course_nature: input.course_nature,
              lecture_hours: input.lecture_hours,
              experiment_hours: input.experiment_hours,
              extra_hours: input.extra_hours,
              prerequisite_course_code: input.prerequisite_course_code,
              score: input.score,
              note: input.note,
              is_interdisciplinary: input.is_interdisciplinary,
              assigned_to: input.assigned_to,
            });
            await refetchPlan();
          }}
        />
      )}
    </div>
  );
}


function FloatingHint({
  message,
  drawerOpen,
  onClose,
}: {
  message: string | null;
  drawerOpen: boolean;
  onClose: () => void;
}) {
  const [displayMessage, setDisplayMessage] = useState<string | null>(message);
  const [visible, setVisible] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(FLOATING_HINT_DOCK_OFFSET);

  const updateBottomOffset = useCallback(() => {
    if (typeof window === "undefined") return;

    if (!drawerOpen) {
      setBottomOffset(FLOATING_HINT_DOCK_OFFSET);
      return;
    }

    const drawerPanel = document.querySelector<HTMLElement>(
      '[data-timeline-drawer-panel="active"]'
    );

    if (!drawerPanel) {
      setBottomOffset(FLOATING_HINT_DOCK_OFFSET);
      return;
    }

    const rect = drawerPanel.getBoundingClientRect();
    const nextOffset = Math.round(
      Math.max(
        FLOATING_HINT_DOCK_OFFSET,
        window.innerHeight - rect.top + FLOATING_HINT_DRAWER_GAP
      )
    );
    setBottomOffset(nextOffset);
  }, [drawerOpen]);

  useEffect(() => {
    const frames = [
      window.requestAnimationFrame(updateBottomOffset),
      window.requestAnimationFrame(() => window.requestAnimationFrame(updateBottomOffset)),
    ];
    const timers = [80, 180, 240].map((delay) =>
      window.setTimeout(updateBottomOffset, delay)
    );

    window.addEventListener("resize", updateBottomOffset);
    return () => {
      frames.forEach((frame) => window.cancelAnimationFrame(frame));
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", updateBottomOffset);
    };
  }, [drawerOpen, updateBottomOffset]);

  useEffect(() => {
    let showFrame = 0;
    let autoTimer = 0;
    let clearTimer = 0;

    if (!message) {
      setVisible(false);
      clearTimer = window.setTimeout(() => setDisplayMessage(null), 220);
      return () => window.clearTimeout(clearTimer);
    }

    setDisplayMessage(message);
    updateBottomOffset();
    showFrame = window.requestAnimationFrame(() => setVisible(true));

    const isError = isErrorHint(message);
    autoTimer = window.setTimeout(() => {
      setVisible(false);
      clearTimer = window.setTimeout(onClose, 220);
    }, isError ? 5200 : 2800);

    return () => {
      window.cancelAnimationFrame(showFrame);
      window.clearTimeout(autoTimer);
      window.clearTimeout(clearTimer);
    };
  }, [message, onClose, updateBottomOffset]);

  if (!displayMessage) return null;

  const variant = isErrorHint(displayMessage)
    ? "error"
    : isWarningHint(displayMessage)
    ? "warning"
    : "success";

  const tone =
    variant === "error"
      ? {
          panel: "border-red-500/20 bg-red-50/90 text-red-700 dark:bg-red-500/10 dark:text-red-200",
          dot: "bg-red-500/75",
          button: "text-red-700/60 hover:text-red-700 dark:text-red-200/60 dark:hover:text-red-100",
        }
      : variant === "warning"
      ? {
          panel: "border-amber-500/20 bg-amber-50/90 text-amber-800 dark:bg-amber-500/10 dark:text-amber-100",
          dot: "bg-amber-500/75",
          button: "text-amber-800/60 hover:text-amber-800 dark:text-amber-100/60 dark:hover:text-amber-50",
        }
      : {
          panel: "border-sub/15 bg-card/95 text-ink",
          dot: "bg-brand/80",
          button: "text-sub hover:text-ink",
        };

  return (
    <div
      className="fixed inset-x-6 z-[70] pointer-events-none transition-[bottom] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] sm:inset-x-8"
      style={{ bottom: `${bottomOffset}px` }}
    >
      <div
        className={
          "mx-auto flex max-w-[520px] items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-xs backdrop-blur-xl transform-gpu transition-[opacity,transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-auto " +
          tone.panel +
          " " +
          (visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.985] opacity-0")
        }
        style={{
          boxShadow:
            "0 18px 44px rgb(var(--shadow-rgb) / var(--shadow-soft)), 0 6px 16px rgb(var(--shadow-rgb) / 0.08)",
        }}
        role="status"
        aria-live="polite"
      >
        <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + tone.dot} />
        <div className="min-w-0 flex-1 truncate leading-5">{displayMessage}</div>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            window.setTimeout(onClose, 200);
          }}
          className={"shrink-0 rounded-full px-1.5 py-0.5 text-[13px] leading-none transition-colors " + tone.button}
          aria-label="关闭提示"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function isErrorHint(message: string) {
  return /error|http|失败|无法|约束|constraint|no such|异常/i.test(message);
}

function isWarningHint(message: string) {
  return /建议|先修|不早于|违规|警告/.test(message);
}

function OfficialTermColumn({
  term,
  courses,
  completedByCode,
  displayOptions,
  onSaveCourse,
  onOpenSchedule,
}: {
  term: number;
  courses: CourseWithCategory[];
  completedByCode: Map<string, number | null>;
  displayOptions: CourseCardDisplayOptions;
  onSaveCourse: (courseCode: string, patch: PlanCoursePatch) => Promise<void>;
  onOpenSchedule?: () => void;
}) {
  const credits = courses.reduce((s, c) => s + c.credits, 0);
  return (
    <TermFrame term={term} credits={credits} onOpenSchedule={onOpenSchedule}>
      {courses.map((course) => (
        <CourseCard
          key={`${term}-${course.course_code}`}
          course={course}
          completedScore={completedByCode.get(course.course_code)}
          plannedTerm={course.planned_term}
          displayOptions={displayOptions}
          editable
          onSave={(patch) => onSaveCourse(course.course_code, patch)}
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
  onDeleteOfficial,
  onSaveOfficial,
  onSaveManual,
  onDeleteManual,
  onOpenSchedule,
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
  onDeleteOfficial: (course: CourseWithCategory) => Promise<void>;
  onSaveOfficial: (courseCode: string, patch: PlanCoursePatch) => Promise<void>;
  onSaveManual: (id: number, patch: PlanCoursePatch) => Promise<void>;
  onDeleteManual: (id: number) => Promise<void>;
  onOpenSchedule?: () => void;
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
      onOpenSchedule={onOpenSchedule}
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
          plannedTerm={item.plannedTerm}
          displayOptions={displayOptions}
          editable
          onSave={(patch) => onSaveOfficial(item.course.course_code, patch)}
          onDragStart={(event) => onStartOfficialDrag(event, item)}
          onDragEnd={onDragEnd}
          onDelete={() => { void onDeleteOfficial(item.course); }}
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
              editable
              onSave={(patch) => onSaveManual(item.id, patch)}
              onDragStart={(event) => onStartManualDrag(event, item)}
              onDragEnd={onDragEnd}
              onDelete={async (id) => {
                if (!window.confirm(`将「${item.course_name}」移入垃圾篓？`)) return;
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
  panelWidth,
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
  panelWidth: number;
  onToggle: () => void;
  dropActive?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const transition =
    "transform-gpu transition-[opacity,transform,border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";
  const panelClass =
    "absolute bottom-14 left-1/2 max-h-[42vh] overflow-hidden rounded-2xl border bg-card/95 backdrop-blur-xl -translate-x-1/2 " +
    transition +
    " " +
    (open
      ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
      : "pointer-events-none translate-y-4 scale-[0.985] opacity-0") +
    " " +
    (dropActive ? "border-brand bg-brand/10" : "border-sub/15");

  return (
    <div className="fixed inset-x-6 bottom-5 z-50 pointer-events-none sm:inset-x-8">
      <div className="relative mx-auto w-full max-w-[1280px]">
        <div
          data-timeline-drawer-panel={open ? "active" : undefined}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={panelClass}
          style={{
            width: `${panelWidth}px`,
            minWidth: `${panelWidth}px`,
            maxWidth: `${panelWidth}px`,
            boxShadow:
              "0 24px 70px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 6px 18px rgb(var(--shadow-rgb) / var(--shadow-soft))",
          }}
        >
          <button
            type="button"
            onClick={onToggle}
            className="flex h-12 w-full min-w-0 items-center justify-between gap-2 border-b border-sub/10 px-2 text-left transition-colors hover:bg-sub/5"
            aria-expanded={open}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-1 w-8 rounded-full bg-sub/25" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink">{title}</span>
                  <span className="hidden truncate text-[11px] text-sub sm:inline">
                    {subtitle}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-sub/65">
                  灵活开课课程暂存在这里；点击标题栏收起
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-sub/10 bg-sub/5 px-2.5 py-1 text-[11px] text-sub tabular-nums">
              {countLabel}
            </span>
          </button>
          <div className="max-h-[calc(42vh_-_48px)] overflow-y-auto overflow-x-hidden px-2.5 pb-2.5 pt-2.5">
            {children}
          </div>
        </div>

        <div
          className="absolute bottom-0 left-1/2 flex w-full max-w-[560px] -translate-x-1/2 items-center gap-2 rounded-2xl border border-sub/15 bg-card/95 p-1 backdrop-blur-xl"
          style={{ boxShadow: "0 16px 40px rgb(var(--shadow-rgb) / var(--shadow-soft))" }}
        >
          <DockButton
            active={open}
            title={title}
            countLabel={countLabel}
            dropActive={dropActive}
            onClick={onToggle}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        </div>
      </div>
    </div>
  );
}

function DualDrawer({
  active,
  onToggle,
  pendingCountLabel,
  trashCountLabel,
  pendingPanelWidth,
  trashPanelWidth,
  pendingDropActive,
  trashDropActive,
  onPendingDragOver,
  onPendingDrop,
  onTrashDragOver,
  onTrashDrop,
  pendingContent,
  trashContent,
}: {
  active: ActiveDrawer;
  onToggle: (drawer: Exclude<ActiveDrawer, null>) => void;
  pendingCountLabel: string;
  trashCountLabel: string;
  pendingPanelWidth: number;
  trashPanelWidth: number;
  pendingDropActive?: boolean;
  trashDropActive?: boolean;
  onPendingDragOver?: React.DragEventHandler;
  onPendingDrop?: React.DragEventHandler;
  onTrashDragOver?: React.DragEventHandler;
  onTrashDrop?: React.DragEventHandler;
  pendingContent: React.ReactNode;
  trashContent: React.ReactNode;
}) {
  const [lastActive, setLastActive] = useState<Exclude<ActiveDrawer, null>>("pending");

  useEffect(() => {
    if (active != null) setLastActive(active);
  }, [active]);

  const displayedDrawer = active ?? lastActive;
  const isPending = displayedDrawer === "pending";
  const isTrash = displayedDrawer === "trash";
  const isOpen = active != null;
  const transition =
    "transform-gpu transition-[opacity,transform,border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";
  const panelClass =
    "absolute bottom-14 left-1/2 max-h-[42vh] overflow-hidden rounded-2xl border bg-card/95 backdrop-blur-xl -translate-x-1/2 " +
    transition +
    " " +
    (isOpen
      ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
      : "pointer-events-none translate-y-4 scale-[0.985] opacity-0") +
    " " +
    ((pendingDropActive && active === "pending") || (trashDropActive && active === "trash")
      ? "border-brand bg-brand/10"
      : "border-sub/15");

  const title = isTrash ? "垃圾篓" : "待安排";
  const subtitle = isTrash
    ? "可恢复，也可永久删除"
    : "灵活课程 / 未安排课程";
  const countLabel = isTrash ? trashCountLabel : pendingCountLabel;
  const panelWidth = isTrash ? trashPanelWidth : pendingPanelWidth;

  return (
    <div className="fixed inset-x-6 bottom-5 z-50 pointer-events-none sm:inset-x-8">
      <div className="relative mx-auto w-full max-w-[1280px]">
        <div
          data-timeline-drawer-panel={isOpen ? "active" : undefined}
          onDragOver={
            active === "pending"
              ? onPendingDragOver
              : active === "trash"
              ? onTrashDragOver
              : undefined
          }
          onDrop={
            active === "pending"
              ? onPendingDrop
              : active === "trash"
              ? onTrashDrop
              : undefined
          }
          className={panelClass}
          style={{
            width: `${panelWidth}px`,
            minWidth: `${panelWidth}px`,
            maxWidth: `${panelWidth}px`,
            boxShadow:
              "0 24px 70px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 6px 18px rgb(var(--shadow-rgb) / var(--shadow-soft))",
          }}
        >
          <button
            type="button"
            onClick={() => onToggle(displayedDrawer)}
            className="flex h-12 w-full min-w-0 items-center justify-between gap-2 border-b border-sub/10 px-2 text-left transition-colors hover:bg-sub/5"
            aria-expanded={isOpen}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-1 w-8 rounded-full bg-sub/25" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink">{title}</span>
                  <span className="hidden truncate text-[11px] text-sub sm:inline">
                    {subtitle}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-sub/65">
                  {isTrash ? "恢复后回到原位置；官方课永久删除为永久隐藏" : "拖入此处可暂存；点击标题栏收起"}
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-sub/10 bg-sub/5 px-2.5 py-1 text-[11px] text-sub tabular-nums">
              {countLabel}
            </span>
          </button>
          <div className="max-h-[calc(42vh_-_48px)] overflow-y-auto overflow-x-hidden px-2.5 pb-2.5 pt-2.5">
            {isTrash ? trashContent : pendingContent}
          </div>
        </div>

        <div
          className="absolute bottom-0 left-1/2 flex w-full max-w-[560px] -translate-x-1/2 items-center gap-2 rounded-2xl border border-sub/15 bg-card/95 p-1 backdrop-blur-xl"
          style={{ boxShadow: "0 16px 40px rgb(var(--shadow-rgb) / var(--shadow-soft))" }}
        >
          <DockButton
            active={active === "pending"}
            title="待安排"
            countLabel={pendingCountLabel}
            dropActive={pendingDropActive}
            onClick={() => onToggle("pending")}
            onDragOver={onPendingDragOver}
            onDrop={onPendingDrop}
          />
          <DockButton
            active={active === "trash"}
            title="垃圾篓"
            countLabel={trashCountLabel}
            dropActive={trashDropActive}
            onClick={() => onToggle("trash")}
            onDragOver={onTrashDragOver}
            onDrop={onTrashDrop}
          />
        </div>
      </div>
    </div>
  );
}

function DockButton({
  active,
  title,
  countLabel,
  dropActive,
  onClick,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  title: string;
  countLabel: string;
  dropActive?: boolean;
  onClick: () => void;
  onDragOver?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "pointer-events-auto flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 text-left text-xs transition-[background-color,border-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 " +
        (active
          ? "bg-sub/10 text-ink"
          : dropActive
          ? "bg-brand/10 text-brand"
          : "text-sub hover:bg-sub/5 hover:text-ink")
      }
      aria-pressed={active}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1 w-6 rounded-full bg-sub/25" />
        <span className="shrink-0 text-sm text-ink">{title}</span>
      </span>
      <span className="truncate text-[11px] tabular-nums">{countLabel}</span>
    </button>
  );
}

function TrashDrawerContent({
  items,
  onRestore,
  onPermanentDelete,
  onRestoreAll,
  onEmpty,
  columns,
}: {
  items: TrashItem[];
  onRestore: (item: TrashItem) => Promise<void>;
  onPermanentDelete: (item: TrashItem) => Promise<void>;
  onRestoreAll: () => Promise<void>;
  onEmpty: () => Promise<void>;
  columns: number;
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-sub/20 bg-sub/5 px-4 py-6 text-center">
        <div className="text-xs text-ink">垃圾篓为空</div>
        <div className="mt-1 max-w-[360px] text-[11px] leading-relaxed text-sub/70">
          移入垃圾篓的课程会保留在这里；只有执行永久删除后才不再显示。
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="min-w-0 space-y-1.5">
        <div className="text-[10px] leading-snug text-sub/75">
          恢复后回到原位置；永久删除不可撤销。
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => { void onRestoreAll(); }}
            className="h-7 rounded-md border border-sub/15 px-2.5 text-[11px] text-sub transition-colors hover:border-sub/35 hover:bg-sub/5 hover:text-ink"
          >
            全部恢复
          </button>
          <button
            type="button"
            onClick={() => { void onEmpty(); }}
            className="h-7 rounded-md border border-sub/15 px-2.5 text-[11px] text-sub transition-colors hover:border-brand/35 hover:bg-brand/10 hover:text-brand"
          >
            清空
          </button>
        </div>
      </div>
      <DrawerCourseGrid columns={columns}>
        {items.map((item) => (
          <DrawerCourseItem key={`${item.source}-${item.id}-${item.course_code ?? "custom"}`}>
            <TrashCourseCard
              item={item}
              onRestore={() => onRestore(item)}
              onPermanentDelete={() => onPermanentDelete(item)}
            />
          </DrawerCourseItem>
        ))}
      </DrawerCourseGrid>
    </div>
  );
}

function TrashCourseCard({
  item,
  onRestore,
  onPermanentDelete,
}: {
  item: TrashItem;
  onRestore: () => Promise<void>;
  onPermanentDelete: () => Promise<void>;
}) {
  const style = CATEGORY_STYLE[item.category_code];
  const isRequired = item.course_nature === "必修";
  const hover = useHoverIntentTriangle<HTMLDivElement>({ width: 280 });
  const hoverItem: CourseHoverInfo = {
    source: item.source,
    id: item.id,
    course_code: item.course_code,
    course_name: item.course_name,
    credits: item.credits,
    lecture_hours: item.lecture_hours ?? 0,
    experiment_hours: item.experiment_hours ?? 0,
    extra_hours: item.extra_hours ?? 0,
    prerequisite_course_code: item.prerequisite_course_code ?? null,
    prerequisite_course_name: item.prerequisite_course_name ?? null,
    category_code: item.category_code,
    category_name: item.category_name,
    course_nature: item.course_nature,
    offered_term: item.offered_term ?? null,
    planned_term: item.planned_term,
    score: item.score,
    note: item.note ?? null,
    is_interdisciplinary: item.is_interdisciplinary ?? 0,
    assigned_to: item.assigned_to ?? null,
    credit_count_to: item.credit_count_to ?? null,
    deleted_at: item.deleted_at,
  };

  return (
    <>
      <div
        ref={hover.anchorRef}
        onMouseEnter={hover.open}
        onMouseLeave={hover.startGuardedClose}
        className="rounded-md px-2.5 py-2 text-[11px] leading-tight transition-all hover:-translate-y-0.5 hover:shadow-sm"
        style={{
          backgroundColor: isRequired ? style.bgSoft : style.bgGhost,
          border: `1px ${isRequired ? "solid" : "dashed"} ${style.border}`,
        }}
      >
        <div className="text-[9px] text-sub/80 tabular-nums">
          {item.source === "program" ? item.course_code : "自定义"}
        </div>
        <div className="mt-0.5 font-medium" style={{ color: style.text }}>
          {item.course_name}
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className="tabular-nums" style={{ color: style.text }}>
            {formatCredits(item.credits)} 学分
          </span>
          <span
            className={isRequired ? "rounded-sm px-1 text-white" : "text-sub"}
            style={isRequired ? { backgroundColor: style.color } : undefined}
          >
            {item.course_nature}
          </span>
        </div>
        {item.score != null && (
          <div className="mt-1 text-[10px] text-brand tabular-nums">✓ {item.score}</div>
        )}
      </div>

      {hover.position && (
        <CourseHoverCard
          position={hover.position}
          popoverRef={hover.popoverRef}
          visible={hover.visible}
          item={hoverItem}
          mode="trash"
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
          onMouseEnter={hover.keepOpen}
          onMouseLeave={hover.scheduleClose}
        />
      )}
    </>
  );
}

function DrawerCourseGrid({
  children,
  columns,
}: {
  children: React.ReactNode;
  columns: number;
}) {
  const contentWidth = getDrawerCardsContentWidth(columns);
  return (
    <div
      className="mx-auto grid content-start gap-[6px]"
      style={{
        width: `${contentWidth}px`,
        maxWidth: "100%",
        gridTemplateColumns: `repeat(${columns}, ${DRAWER_CARD_WIDTH}px)`,
      }}
    >
      {children}
    </div>
  );
}

function DrawerCourseItem({ children }: { children: React.ReactNode }) {
  return <div className="w-[158px] min-w-0 shrink-0">{children}</div>;
}

function OfficialDrawerContent({
  courses,
  completedByCode,
  displayOptions,
  onSaveCourse,
  columns,
}: {
  courses: CourseWithCategory[];
  completedByCode: Map<string, number | null>;
  displayOptions: CourseCardDisplayOptions;
  onSaveCourse: (courseCode: string, patch: PlanCoursePatch) => Promise<void>;
  columns: number;
}) {
  if (courses.length === 0) {
    return (
      <div className="text-[11px] text-sub/60 italic py-4 text-center">
        没有灵活安排的课程
      </div>
    );
  }
  return (
    <DrawerCourseGrid columns={columns}>
      {courses.map((course) => (
        <DrawerCourseItem key={`official-drawer-${course.course_code}`}>
          <CourseCard
            course={course}
            completedScore={completedByCode.get(course.course_code)}
            plannedTerm={course.planned_term}
            displayOptions={displayOptions}
            editable
            onSave={(patch) => onSaveCourse(course.course_code, patch)}
          />
        </DrawerCourseItem>
      ))}
    </DrawerCourseGrid>
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
  onDeleteOfficial,
  onSaveOfficial,
  onSaveManual,
  onDeleteManual,
  columns,
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
  onDeleteOfficial: (course: CourseWithCategory) => Promise<void>;
  onSaveOfficial: (courseCode: string, patch: PlanCoursePatch) => Promise<void>;
  onSaveManual: (id: number, patch: PlanCoursePatch) => Promise<void>;
  onDeleteManual: (id: number) => Promise<void>;
  columns: number;
}) {
  const empty = officialItems.length === 0 && manualItems.length === 0;
  return (
    <div className="flex flex-col gap-2">
      {empty && (
        <div className="rounded-lg border border-dashed border-sub/20 px-3 py-3 text-center text-[11px] italic text-sub/60">
          把课程拖到这里 = 放入待安排；或点下方按钮直接添加
        </div>
      )}
      {!empty && (
        <DrawerCourseGrid columns={columns}>
          {officialItems.map((item) => (
            <DrawerCourseItem key={`personal-drawer-${item.course.course_code}`}>
              <CourseCard
                course={item.course}
                completedScore={completedByCode.get(item.course.course_code)}
                plannedTerm={item.plannedTerm}
                draggable
                displayOptions={displayOptions}
                editable
                onSave={(patch) => onSaveOfficial(item.course.course_code, patch)}
                onDragStart={(event) => onStartOfficialDrag(event, item)}
                onDragEnd={onDragEnd}
                onDelete={() => { void onDeleteOfficial(item.course); }}
              />
            </DrawerCourseItem>
          ))}
          {manualItems.map((item) => (
            <DrawerCourseItem key={`drawer-manual-${item.id}`}>
              <ManualCourseCard
                course={item}
                draggable
                displayOptions={displayOptions}
                editable
                onSave={(patch) => onSaveManual(item.id, patch)}
                onDragStart={(event) => onStartManualDrag(event, item)}
                onDragEnd={onDragEnd}
                onDelete={async (id) => {
                  if (!window.confirm(`将「${item.course_name}」移入垃圾篓？`)) return;
                  await onDeleteManual(id);
                }}
              />
            </DrawerCourseItem>
          ))}
        </DrawerCourseGrid>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="h-7 self-start rounded-md border border-dashed border-sub/25 px-3 text-[11px] text-sub transition-colors hover:border-sub/45 hover:bg-sub/5 hover:text-ink"
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
  onOpenSchedule,
  onDragOver,
  onDrop,
}: {
  term: number;
  credits: number;
  children: React.ReactNode;
  variant?: ViewMode;
  dropActive?: boolean;
  onOpenSchedule?: () => void;
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
        <div className="flex items-center gap-1.5">
          <div className="text-[11px] text-sub tabular-nums">{formatCredits(credits)} 学分</div>
          {onOpenSchedule && (
            <button
              type="button"
              onClick={onOpenSchedule}
              className="h-6 w-6 rounded-md text-[13px] leading-none text-sub transition-colors hover:bg-sub/10 hover:text-ink"
              aria-label={`展开${TERM_LABEL[term]}课表`}
              title="展开课表"
            >
              ↗
            </button>
          )}
        </div>
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
      <div className="text-lg text-ink tabular-nums">{formatCredits(value)}</div>
    </div>
  );
}


const FLOATING_HINT_DOCK_OFFSET = 80;
const FLOATING_HINT_DRAWER_GAP = 12;

const DRAWER_CARD_WIDTH = 158;
const DRAWER_CARD_GAP = 6;
// Total horizontal breathing room around the course-card grid.
// Match the term-card spacing: courses stay compact, but the panel keeps a small balanced inset.
const DRAWER_PANEL_PADDING_X = 20;
const DRAWER_EMPTY_PANEL_WIDTH = 280;
const DRAWER_MIN_PANEL_WIDTH = 560;
const TRASH_DRAWER_MIN_PANEL_WIDTH = DRAWER_MIN_PANEL_WIDTH;
const DRAWER_PANEL_MAX_WIDTH = 1500;

function useViewportWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth
  );

  useEffect(() => {
    const update = () => setWidth(window.innerWidth || 1024);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return width;
}

function getDrawerColumns(itemCount: number, viewportWidth: number) {
  if (itemCount <= 0) return 1;

  const safeWidth = Math.max(240, viewportWidth - 48);
  const panelLimit = Math.min(safeWidth, DRAWER_PANEL_MAX_WIDTH);
  const contentLimit = Math.max(0, panelLimit - DRAWER_PANEL_PADDING_X);
  const maxColumnsByAvailableWidth = Math.max(
    1,
    Math.floor(
      (contentLimit + DRAWER_CARD_GAP) /
        (DRAWER_CARD_WIDTH + DRAWER_CARD_GAP)
    )
  );

  // Let the drawer expand when there is room, but never create a grid wider
  // than the panel can actually contain. When the viewport is narrower, the
  // column count decreases and courses wrap to new rows instead of overflowing
  // horizontally.
  let columns = Math.max(1, Math.min(itemCount, maxColumnsByAvailableWidth, 8));

  // Avoid a visually awkward single-card orphan row when one fewer column still
  // keeps the panel reasonably wide.
  if (columns > 2 && itemCount > columns && itemCount % columns === 1) {
    columns -= 1;
  }

  return columns;
}

function getDrawerCardsContentWidth(columns: number) {
  return columns * DRAWER_CARD_WIDTH + (columns - 1) * DRAWER_CARD_GAP;
}

function getDrawerPanelWidth(
  itemCount: number,
  viewportWidth: number,
  minPanelWidth = DRAWER_EMPTY_PANEL_WIDTH
) {
  const safeWidth = Math.max(240, viewportWidth - 48);
  if (itemCount <= 0) {
    return Math.round(Math.min(safeWidth, minPanelWidth));
  }

  const columns = getDrawerColumns(itemCount, viewportWidth);
  const contentWidth = getDrawerCardsContentWidth(columns);
  return Math.round(
    Math.min(
      safeWidth,
      DRAWER_PANEL_MAX_WIDTH,
      Math.max(minPanelWidth, contentWidth + DRAWER_PANEL_PADDING_X)
    )
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
