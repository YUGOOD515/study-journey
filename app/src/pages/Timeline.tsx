import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus, RotateCcw, Trash } from "../lib/icons";
import { api, type RequirementDto } from "../lib/api";
import { formatCredits } from "../lib/credits";
import { myPlanTotalCredits } from "../lib/planTotal";
import { parseOfferedTerm, TERM_LABEL } from "../lib/offeredTerm";
import {
  loadCourseCardDisplayOptions,
  saveCourseCardDisplayOptions,
} from "../lib/courseCardDisplay";
import { useEditMode } from "../lib/editMode";
import { useIsMobile } from "../hooks/useMediaQuery";
import type { CourseCardDisplayOptions, Course, PlanCoursePatch } from "../types";
import { CourseCard, ManualCourseCard } from "../components/CourseCard";
import { AddCourseDialog } from "../components/AddCourseDialog";
import {
  Button,
  EmptyState,
  Metric,
  notify,
  Page,
  PageError,
  PageHeader,
  Segmented,
  Skeleton,
  useConfirm,
} from "../components/ui";
import {
  TERMS,
  dropTargetFromId,
  emptyTermBuckets,
  isPlanLocked,
  placementWarning,
  sortOfficial,
  sortPlanned,
  sumCredits,
  type DropTarget,
  type MovePayload,
  type PlannedOfficial,
  type ViewMode,
} from "./timeline/model";
import {
  BoardScroller,
  CardMenu,
  ColumnDivider,
  DisplayOptionsMenu,
  Dock,
  DockGrid,
  DockPanel,
  DraggableItem,
  EmptyTerm,
  Legend,
  TermChip,
  TermColumn,
  TrashCard,
  type DockKey,
} from "./timeline/parts";

/** 优先命中指针所在的目标（坞站按钮、学期列），否则退回矩形相交 */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

export default function Timeline({
  currentTerm,
  onOpenSchedule,
}: {
  currentTerm?: number;
  onOpenSchedule?: (term: number) => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [reqs, setReqs] = useState<RequirementDto[]>([]);
  const [done, setDone] = useState<Course[]>([]);
  const [personalPlan, setPersonalPlan] = useState<Course[]>([]);
  const [trashItems, setTrashItems] = useState<Course[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("personal");
  const [displayOptions, setDisplayOptions] = useState<CourseCardDisplayOptions>(
    loadCourseCardDisplayOptions,
  );
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addTerm, setAddTerm] = useState<number | null | "drawer">(null);
  const [dragging, setDragging] = useState<{ payload: MovePayload; course: Course } | null>(null);
  const [activeDock, setActiveDock] = useState<DockKey | null>(null);
  const [mobileTerm, setMobileTerm] = useState(currentTerm ?? 1);
  const { editing } = useEditMode();
  const isMobile = useIsMobile();
  const confirm = useConfirm();
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [mobileTerm, isMobile, loading]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  useEffect(() => {
    setErr(null);
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
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  useEffect(() => {
    saveCourseCardDisplayOptions(displayOptions);
  }, [displayOptions]);

  const refetchPlan = useCallback(async () => {
    const [p, t] = await Promise.all([api.personalPlan(), api.trash()]);
    setPersonalPlan(p);
    setTrashItems(t);
  }, []);

  const refetchTimelineData = useCallback(async () => {
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
  }, []);

  // 已修读/正在修读等状态的课程不能通过 /plan 改学期
  const lockedStatusByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of [...personalPlan, ...done]) {
      if (item.courseCode && isPlanLocked(item.studyStatus))
        m.set(item.courseCode, item.studyStatus);
    }
    return m;
  }, [personalPlan, done]);

  const completedByCode = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const d of done) {
      if (d.originType === "official" && d.courseCode) m.set(d.courseCode, d.score);
    }
    return m;
  }, [done]);

  // 官方视图：纯按 offered_term 分；灵活课进待安排
  const officialBuckets = useMemo(() => {
    const byTerm = emptyTermBuckets<Course>();
    const drawer: Course[] = [];
    for (const c of courses) {
      const p = parseOfferedTerm(c.officialTerm);
      if (p.isFlexible || p.primary == null) drawer.push(c);
      else byTerm[p.primary].push(c);
    }
    for (const t of TERMS) sortOfficial(byTerm[t]);
    sortOfficial(drawer);
    return { byTerm, drawer };
  }, [courses]);

  const plannedTermByCode = useMemo(() => {
    const overrides = new Map(
      personalPlan
        .filter((p) => p.originType === "official" && p.courseCode)
        .map((p) => [p.courseCode, p]),
    );
    const map = new Map<string, number | null>();
    for (const c of courses) {
      const override = overrides.get(c.courseCode);
      if (override) map.set(c.courseCode, override.actualTerm ?? override.plannedTerm);
    }
    return map;
  }, [courses, personalPlan]);

  // 我的计划视图：plannedTerm==null 进待安排
  const personalBuckets = useMemo(() => {
    const byTerm = emptyTermBuckets<PlannedOfficial>();
    const drawer: PlannedOfficial[] = [];
    for (const c of courses) {
      if (!plannedTermByCode.has(c.courseCode)) continue;
      const plannedTerm = plannedTermByCode.get(c.courseCode) ?? null;
      const item: PlannedOfficial = {
        course: c,
        plannedTerm,
        warning:
          plannedTerm == null ? null : placementWarning(c, plannedTerm, plannedTermByCode, courses),
      };
      if (plannedTerm == null) drawer.push(item);
      else byTerm[plannedTerm].push(item);
    }
    for (const t of TERMS) sortPlanned(byTerm[t]);
    sortPlanned(drawer);
    return { byTerm, drawer };
  }, [courses, plannedTermByCode]);

  const manualPlanByTerm = useMemo(() => {
    const byTerm = emptyTermBuckets<Course>();
    const drawer: Course[] = [];
    const seenCodes = new Set<string>();
    for (const item of personalPlan) {
      if (item.originType === "official") continue;
      seenCodes.add(item.courseCode);
      const term = item.actualTerm ?? item.plannedTerm;
      if (term == null) drawer.push(item);
      else byTerm[term].push(item);
    }
    // 已修读/正在修读的自定义课也应出现在“我的计划”时间轴上，与旅迹页口径一致
    for (const item of done) {
      if (item.originType === "official" || seenCodes.has(item.courseCode)) continue;
      const term = item.actualTerm ?? item.plannedTerm;
      if (term == null) drawer.push(item);
      else byTerm[term].push(item);
    }
    for (const t of TERMS) byTerm[t].sort((a, b) => a.courseName.localeCompare(b.courseName, "zh"));
    drawer.sort((a, b) => a.courseName.localeCompare(b.courseName, "zh"));
    return { byTerm, drawer };
  }, [personalPlan, done]);

  const totals = useMemo(() => {
    const requiredTotal = reqs.reduce((s, r) => s + r.requiredCredits, 0);
    const officialPlanTotal = courses.reduce((s, c) => s + c.credits, 0);
    const completedTotal = done.reduce((s, d) => s + (d.score != null ? (d.credits ?? 0) : 0), 0);
    return {
      requiredTotal,
      officialPlanTotal,
      personalPlanTotal: myPlanTotalCredits(courses, personalPlan, done),
      completedTotal,
    };
  }, [reqs, courses, done, personalPlan]);

  const isPersonal = viewMode === "personal";
  const canEdit = editing && isPersonal;

  // 退出编辑时收起垃圾篓
  useEffect(() => {
    if (!canEdit && activeDock === "trash") setActiveDock(null);
  }, [canEdit, activeDock]);

  /* ---------------------------- 操作 ---------------------------- */

  const moveCourse = useCallback(
    async (payload: MovePayload, term: number | null, opts: { silent?: boolean } = {}) => {
      if (payload.fromTerm === term) return;
      if (payload.lockedStatus) {
        notify.info(
          `「${payload.courseName}」${payload.lockedStatus}，不可移动`,
          "如需调整学期，请在课程详情中修改修读记录",
        );
        return;
      }
      try {
        if (payload.kind === "official") {
          await api.upsertPersonalOfficial({ course_code: payload.courseCode, planned_term: term });
        } else {
          await api.patchPersonalPlan(payload.courseCode, { planned_term: term });
        }
        await refetchPlan();
        if (opts.silent) return;
        const label = term == null ? "待安排" : TERM_LABEL[term];
        const undo = () =>
          void moveCourse({ ...payload, fromTerm: term }, payload.fromTerm, { silent: true });
        const course =
          payload.kind === "official"
            ? courses.find((c) => c.courseCode === payload.courseCode)
            : null;
        const warning =
          course && term != null
            ? placementWarning(
                course,
                term,
                new Map([...plannedTermByCode, [payload.courseCode, term]]),
                courses,
              )
            : null;
        if (warning) notify.warning(`「${payload.courseName}」已移到${label}`, warning, undo);
        else notify.undo(`「${payload.courseName}」已移到${label}`, undo);
      } catch (e) {
        notify.error(e, "移动失败");
      }
    },
    [courses, plannedTermByCode, refetchPlan],
  );

  const trashCourse = useCallback(
    async (payload: MovePayload) => {
      try {
        if (payload.kind === "official") await api.trashOfficial(payload.courseCode);
        else await api.deletePersonalPlan(payload.courseCode);
        await refetchTimelineData();
        notify.undo(`已移入垃圾篓：${payload.courseName}`, async () => {
          try {
            await api.restoreTrashItem({ courseCode: payload.courseCode } as Course);
            await refetchTimelineData();
          } catch (e) {
            notify.error(e, "恢复失败");
          }
        });
      } catch (e) {
        notify.error(e, "移入垃圾篓失败");
      }
    },
    [refetchTimelineData],
  );

  const saveProgramCourse = async (courseCode: string, patch: PlanCoursePatch) => {
    await api.updateProgramCourse(courseCode, patch);
    await refetchTimelineData();
    notify.success("课程信息已保存");
  };

  const saveCustomCourse = async (courseCode: string, patch: PlanCoursePatch) => {
    await api.updateCustomCourse(courseCode, patch);
    await refetchTimelineData();
    notify.success("课程信息已保存");
  };

  const restoreTrashItem = async (item: Course) => {
    try {
      await api.restoreTrashItem(item);
      await refetchTimelineData();
      notify.success(`已恢复：${item.courseName}`);
    } catch (e) {
      notify.error(e, "恢复失败");
    }
  };

  const permanentlyDeleteTrashItem = async (item: Course) => {
    const label = item.source === "program" ? "从我的计划中永久移除" : "永久删除";
    const ok = await confirm({
      title: `${label}「${item.courseName}」？`,
      description: "此操作无法从垃圾篓恢复。",
      confirmLabel: label,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.permanentlyDeleteTrashItem(item);
      await refetchTimelineData();
      notify.success(`${label}：${item.courseName}`);
    } catch (e) {
      notify.error(e, "删除失败");
    }
  };

  const restoreAll = async () => {
    try {
      await api.restoreAllTrash();
      await refetchTimelineData();
      notify.success("已恢复垃圾篓中的全部课程");
    } catch (e) {
      notify.error(e, "恢复失败");
    }
  };

  const emptyTrash = async () => {
    const ok = await confirm({
      title: "清空垃圾篓？",
      description: "官方课程会从我的计划中永久移除，自定义课程会被永久删除。此操作不可撤销。",
      confirmLabel: "清空",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.emptyTrash();
      await refetchTimelineData();
      notify.success("垃圾篓已清空");
    } catch (e) {
      notify.error(e, "清空失败");
    }
  };

  /* ---------------------------- 拖拽 ---------------------------- */

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { payload: MovePayload; course: Course } | undefined;
    if (!data) return;
    setDragging(data);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.(8);
      } catch {
        /* ignore */
      }
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current as { payload: MovePayload } | undefined;
    setDragging(null);
    if (!data || !canEdit) return;
    const target: DropTarget | null = dropTargetFromId(event.over?.id);
    if (!target) return;
    if (target.type === "trash") void trashCourse(data.payload);
    else if (target.type === "pending") void moveCourse(data.payload, null);
    else {
      void moveCourse(data.payload, target.term);
      if (isMobile) setMobileTerm(target.term);
    }
  };

  /* ---------------------------- 渲染 ---------------------------- */

  if (err) return <PageError message={err} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (loading) return <TimelineSkeleton />;

  const renderOfficialPlanned = (item: PlannedOfficial) => {
    const payload: MovePayload = {
      kind: "official",
      courseCode: item.course.courseCode,
      courseName: item.course.courseName,
      fromTerm: item.plannedTerm,
      lockedStatus: lockedStatusByCode.get(item.course.courseCode),
    };
    return (
      <DraggableItem
        key={`o-${item.course.courseCode}`}
        id={`official:${item.course.courseCode}`}
        payload={payload}
        course={item.course}
        disabled={!canEdit || Boolean(payload.lockedStatus)}
      >
        {(drag) => (
          <CourseCard
            course={item.course}
            completedScore={completedByCode.get(item.course.courseCode)}
            warning={item.warning ?? undefined}
            plannedTerm={item.plannedTerm}
            displayOptions={displayOptions}
            editable={editing}
            onSave={(patch) => saveProgramCourse(item.course.courseCode, patch)}
            drag={drag}
            menu={
              canEdit
                ? ({ openEdit }) => (
                    <CardMenu
                      payload={payload}
                      onMove={moveCourse}
                      onTrash={trashCourse}
                      openEdit={openEdit}
                    />
                  )
                : undefined
            }
          />
        )}
      </DraggableItem>
    );
  };

  const renderManual = (item: Course) => {
    const payload: MovePayload = {
      kind: "manual",
      courseCode: item.courseCode,
      courseName: item.courseName,
      fromTerm: item.actualTerm ?? item.plannedTerm,
      lockedStatus: isPlanLocked(item.studyStatus) ? item.studyStatus : undefined,
    };
    return (
      <DraggableItem
        key={`m-${item.courseCode}`}
        id={`manual:${item.courseCode}`}
        payload={payload}
        course={item}
        disabled={!canEdit || Boolean(payload.lockedStatus)}
      >
        {(drag) => (
          <ManualCourseCard
            course={item}
            displayOptions={displayOptions}
            editable={editing}
            onSave={(patch) => saveCustomCourse(item.courseCode, patch)}
            drag={drag}
            menu={
              canEdit
                ? ({ openEdit }) => (
                    <CardMenu
                      payload={payload}
                      onMove={moveCourse}
                      onTrash={trashCourse}
                      openEdit={openEdit}
                    />
                  )
                : undefined
            }
          />
        )}
      </DraggableItem>
    );
  };

  const renderOfficialReadonly = (course: Course) => (
    <CourseCard
      key={`r-${course.courseCode}`}
      course={course}
      completedScore={completedByCode.get(course.courseCode)}
      plannedTerm={course.plannedTerm}
      displayOptions={displayOptions}
      editable={editing}
      onSave={(patch) => saveProgramCourse(course.courseCode, patch)}
    />
  );

  const termStats = (term: number) => {
    if (isPersonal) {
      const o = personalBuckets.byTerm[term];
      const m = manualPlanByTerm.byTerm[term];
      return {
        count: o.length + m.length,
        credits: sumCredits(o, (i) => i.course.credits) + sumCredits(m, (i) => i.credits),
      };
    }
    const list = officialBuckets.byTerm[term];
    return { count: list.length, credits: sumCredits(list, (c) => c.credits) };
  };

  const renderColumn = (term: number, full = false) => {
    const stats = termStats(term);
    const officialItems = personalBuckets.byTerm[term];
    const manualItems = manualPlanByTerm.byTerm[term];
    return (
      <TermColumn
        key={term}
        term={term}
        credits={stats.credits}
        count={stats.count}
        isCurrent={term === currentTerm}
        personal={isPersonal}
        droppable={canEdit}
        dragActive={dragging != null}
        fromTerm={dragging?.payload.fromTerm}
        full={full}
        onOpenSchedule={onOpenSchedule ? () => onOpenSchedule(term) : undefined}
        onAdd={canEdit ? () => setAddTerm(term) : undefined}
      >
        {isPersonal ? (
          <>
            {officialItems.map(renderOfficialPlanned)}
            {manualItems.length > 0 && officialItems.length > 0 && <ColumnDivider label="自定课程" />}
            {manualItems.map(renderManual)}
            {stats.count === 0 && <EmptyTerm editing={canEdit} />}
          </>
        ) : (
          <>
            {officialBuckets.byTerm[term].map(renderOfficialReadonly)}
            {stats.count === 0 && <EmptyTerm editing={false} />}
          </>
        )}
      </TermColumn>
    );
  };

  const pendingOfficial = personalBuckets.drawer;
  const pendingManual = manualPlanByTerm.drawer;
  const pendingStats = isPersonal
    ? {
        count: pendingOfficial.length + pendingManual.length,
        credits:
          sumCredits(pendingOfficial, (p) => p.course.credits) +
          sumCredits(pendingManual, (p) => p.credits),
      }
    : {
        count: officialBuckets.drawer.length,
        credits: sumCredits(officialBuckets.drawer, (c) => c.credits),
      };
  const trashStats = {
    count: trashItems.length,
    credits: sumCredits(trashItems, (c) => c.credits),
  };

  const dockPanel =
    activeDock === "trash" ? (
      <DockPanel
        dropId="trash"
        droppable={canEdit}
        dragActive={dragging != null}
        title="垃圾篓"
        subtitle="恢复后回到原位置；永久删除不可撤销"
        onClose={() => setActiveDock(null)}
        actions={
          trashItems.length > 0 && canEdit ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw />}
                onClick={() => void restoreAll()}
              >
                全部恢复
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger hover:text-danger"
                icon={<Trash />}
                onClick={() => void emptyTrash()}
              >
                清空
              </Button>
            </>
          ) : null
        }
      >
        {trashItems.length === 0 ? (
          <EmptyState title="垃圾篓为空" description="移入垃圾篓的课程会保留在这里，可随时恢复。" />
        ) : (
          <DockGrid>
            {trashItems.map((item) => (
              <TrashCard
                key={`${item.source}-${item.courseCode}`}
                item={item}
                editing={canEdit}
                onRestore={() => restoreTrashItem(item)}
                onPermanentDelete={() => permanentlyDeleteTrashItem(item)}
              />
            ))}
          </DockGrid>
        )}
      </DockPanel>
    ) : activeDock === "pending" ? (
      <DockPanel
        dropId="pending"
        droppable={canEdit}
        dragActive={dragging != null}
        title="待安排"
        subtitle={isPersonal ? "灵活课程 / 尚未安排学期的课程" : "灵活开课的课程（按开课学期推断）"}
        onClose={() => setActiveDock(null)}
        actions={
          canEdit ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              onClick={() => setAddTerm("drawer")}
            >
              添加
            </Button>
          ) : null
        }
      >
        {pendingStats.count === 0 ? (
          <EmptyState
            title={isPersonal ? "没有待安排的课程" : "没有灵活安排的课程"}
            description={
              canEdit ? "把课程拖到这里，或在卡片菜单中选择「移动到 → 待安排」。" : undefined
            }
          />
        ) : (
          <DockGrid>
            {isPersonal ? (
              <>
                {pendingOfficial.map(renderOfficialPlanned)}
                {pendingManual.map(renderManual)}
              </>
            ) : (
              officialBuckets.drawer.map(renderOfficialReadonly)
            )}
          </DockGrid>
        )}
      </DockPanel>
    ) : null;

  const overlayCard = dragging ? (
    dragging.payload.kind === "official" ? (
      <CourseCard course={dragging.course} displayOptions={displayOptions} overlay />
    ) : (
      <ManualCourseCard course={dragging.course} displayOptions={displayOptions} overlay />
    )
  ) : null;

  const subtitle = isPersonal
    ? canEdit
      ? isMobile
        ? "长按卡片拖动，或用卡片菜单移动；违反先修或开课学期只提示、不阻止"
        : "拖拽或用卡片菜单调整学期；违反先修或开课学期只提示、不阻止"
      : "查看模式：切换到编辑后可调整计划"
    : "按培养方案的开课学期排列（只读）";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      autoScroll={{ threshold: { x: 0.12, y: 0.12 } }}
    >
      <Page className="pb-40 sm:pb-28">
        <PageHeader
          title="时间轴"
          meta={subtitle}
          metrics={
            <>
              <Metric label="已修学分" value={formatCredits(totals.completedTotal)} />
              <Metric
                label={isPersonal ? "我的计划合计" : "官方计划合计"}
                value={formatCredits(isPersonal ? totals.personalPlanTotal : totals.officialPlanTotal)}
              />
              <Metric label="培养方案要求" value={formatCredits(totals.requiredTotal)} />
            </>
          }
          toolbar={
            <>
              <Segmented
                ariaLabel="视图"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: "personal", label: "我的计划" },
                  { value: "official", label: "官方计划" },
                ]}
              />
              <DisplayOptionsMenu value={displayOptions} onChange={setDisplayOptions} />
              <Legend className="order-last w-full pt-1 lg:order-none lg:ml-auto lg:w-auto lg:pt-0" />
            </>
          }
        />

        <div className="mt-6">
          {isMobile ? (
            <>
              <div
                ref={chipsRef}
                role="tablist"
                aria-label="选择学期"
                className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4"
              >
                {TERMS.map((term) => {
                  const stats = termStats(term);
                  return (
                    <TermChip
                      key={term}
                      term={term}
                      active={term === mobileTerm}
                      isCurrent={term === currentTerm}
                      credits={stats.credits}
                      count={stats.count}
                      droppable={canEdit}
                      dragActive={dragging != null}
                      onClick={() => setMobileTerm(term)}
                    />
                  );
                })}
              </div>
              {renderColumn(mobileTerm, true)}
            </>
          ) : (
            <BoardScroller scrollToTerm={currentTerm}>{TERMS.map((term) => renderColumn(term))}</BoardScroller>
          )}
        </div>
      </Page>

      <Dock
        active={activeDock}
        onToggle={(key) => setActiveDock((cur) => (cur === key ? null : key))}
        showTrash={canEdit}
        pending={pendingStats}
        trash={trashStats}
        canDrop={canEdit}
        dragActive={dragging != null}
        panel={dockPanel}
      />

      <DragOverlay dropAnimation={null}>{overlayCard}</DragOverlay>

      {addTerm != null && (
        <AddCourseDialog
          termNumber={addTerm === "drawer" ? null : addTerm}
          onClose={() => setAddTerm(null)}
          onSubmitManual={async (input) => {
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
            await refetchTimelineData();
            notify.success(`已添加课程：${input.course_name}`);
          }}
          onSubmitRaw={async (input) => {
            await api.createPersonalFromRaw(input);
            await refetchTimelineData();
            notify.success(
              input.existsInCustom
                ? `已更新我的计划课程：${input.courseName}`
                : input.existsInProgram
                  ? `已替换官方占位课程：${input.courseName}`
                  : `已添加课程：${input.courseName}`,
            );
          }}
        />
      )}
    </DndContext>
  );
}

function TimelineSkeleton() {
  return (
    <Page>
      <div className="border-b border-line pb-3 pt-8">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="mt-2 h-4 w-72" />
        <Skeleton className="mt-4 h-8 w-56" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {TERMS.map((t) => (
          <Skeleton key={t} className="h-[360px] rounded-md" />
        ))}
      </div>
    </Page>
  );
}
