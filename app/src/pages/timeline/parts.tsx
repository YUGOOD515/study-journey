import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { Course, CourseCardDisplayOptions } from "../../types";
import { cn } from "../../lib/cn";
import { CATEGORY_STYLE } from "../../lib/categoryStyle";
import { COURSE_CARD_DISPLAY_ITEMS } from "../../lib/courseCardDisplay";
import { formatCredits } from "../../lib/credits";
import { TERM_LABEL } from "../../lib/offeredTerm";
import { CourseTile, tileMenuTriggerClass, type DragBinding } from "../../components/CourseTile";
import { courseSurface } from "../../components/CourseCard";
import {
  Badge,
  Button,
  IconButton,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  Tip,
} from "../../components/ui";
import { TERMS, type MovePayload } from "./model";

/* 拖拽绑定 ----------------------------------------------------------- */

export function DraggableItem({
  id,
  payload,
  course,
  disabled,
  children,
}: {
  id: string;
  payload: MovePayload;
  course: Course;
  disabled?: boolean;
  children: (drag: DragBinding | undefined) => React.ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, data: { payload, course }, disabled });
  if (disabled) return <>{children(undefined)}</>;
  return <>{children({ setNodeRef, listeners, attributes, isDragging })}</>;
}

/* 卡片菜单 ----------------------------------------------------------- */

export function CardMenu({
  payload,
  onMove,
  onTrash,
  openEdit,
}: {
  payload: MovePayload;
  onMove: (payload: MovePayload, term: number | null) => void;
  onTrash: (payload: MovePayload) => void;
  openEdit?: () => void;
}) {
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <button type="button" className={tileMenuTriggerClass} aria-label={`${payload.courseName} 的操作`}>
          <MoreHorizontal />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-44">
        {payload.lockedStatus ? (
          <MenuItem disabled icon={<Lock />}>
            {payload.lockedStatus}，不可移动
          </MenuItem>
        ) : (
          <MenuSub>
            <MenuSubTrigger icon={<ArrowRightLeft />}>移动到</MenuSubTrigger>
            <MenuSubContent className="w-40">
              {TERMS.map((term) => (
                <MenuItem
                  key={term}
                  disabled={payload.fromTerm === term}
                  icon={payload.fromTerm === term ? <Check /> : undefined}
                  shortcut={term}
                  onSelect={() => onMove(payload, term)}
                >
                  {TERM_LABEL[term]}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                disabled={payload.fromTerm == null}
                icon={payload.fromTerm == null ? <Check /> : <Inbox />}
                onSelect={() => onMove(payload, null)}
              >
                待安排
              </MenuItem>
            </MenuSubContent>
          </MenuSub>
        )}
        {openEdit && (
          <MenuItem icon={<Pencil />} onSelect={openEdit}>
            编辑信息
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 />} onSelect={() => onTrash(payload)}>
          移入垃圾篓
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/* 学期列 ------------------------------------------------------------- */

export function TermColumn({
  term,
  credits,
  count,
  isCurrent,
  droppable,
  dragActive,
  fromTerm,
  full = false,
  onOpenSchedule,
  onAdd,
  children,
}: {
  term: number;
  credits: number;
  count: number;
  isCurrent: boolean;
  personal?: boolean;
  droppable: boolean;
  dragActive: boolean;
  fromTerm?: number | null;
  full?: boolean;
  onOpenSchedule?: () => void;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `term:${term}`, disabled: !droppable });
  const isTarget = dragActive && droppable && fromTerm !== term;

  return (
    <section
      ref={setNodeRef}
      aria-label={TERM_LABEL[term]}
      data-term={term}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-md border bg-card transition-colors duration-100",
        isOver && isTarget ? "border-ink bg-fill" : isTarget ? "border-line-strong" : "border-line",
        full ? "min-h-[40vh]" : "min-h-[240px]",
      )}
    >
      <header
        className={cn("border-b border-line px-2.5 pb-2 pt-2.5", isCurrent && "shadow-[inset_0_2px_0_rgb(var(--brand))]")}
      >
        <div className="flex h-5 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-ink">{TERM_LABEL[term]}</h3>
            {isCurrent && (
              <Badge tone="brand" className="h-4 px-1">
                本学期
              </Badge>
            )}
          </span>
          {onOpenSchedule && (
            <Tip label="查看学期课表">
              <IconButton label={`查看${TERM_LABEL[term]}课表`} onClick={onOpenSchedule} className="-mr-1.5 h-6 w-6">
                <CalendarDays />
              </IconButton>
            </Tip>
          )}
        </div>
        <div className="mt-0.5 flex h-4 items-center justify-between gap-2 text-2xs text-sub">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span>
              学期 <span className="num">{term}</span>
            </span>
          </span>
          <span className="whitespace-nowrap">
            <span className="num font-medium text-ink">{formatCredits(credits)}</span> 学分
            <span className="mx-1 text-line-strong">|</span>
            <span className="num text-ink">{count}</span> 门
          </span>
        </div>
      </header>
      <div className={cn("flex-1 p-1.5", full ? "grid grid-cols-2 content-start gap-1.5" : "flex flex-col gap-1.5")}>
        {children}
      </div>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex h-8 shrink-0 items-center justify-center gap-1 border-t border-line text-xs text-sub transition-colors hover:bg-fill hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          添加课程
        </button>
      )}
    </section>
  );
}

/** 列内分组标题（例如自定课程） */
export function ColumnDivider({ label }: { label: string }) {
  return (
    <div className="col-span-full flex items-center gap-2 px-0.5 pt-1 text-2xs text-faint" aria-hidden>
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function EmptyTerm({ editing }: { editing: boolean }) {
  return (
    <div className="col-span-full px-1 py-6 text-center text-2xs text-faint">
      {editing ? "暂无安排，可拖入课程" : "暂无安排"}
    </div>
  );
}

/** 手机：学期切换条（每个学期也是放置目标） */
export function TermChip({
  term,
  active,
  isCurrent,
  credits,
  count,
  droppable,
  dragActive,
  onClick,
}: {
  term: number;
  active: boolean;
  isCurrent: boolean;
  credits: number;
  count: number;
  droppable: boolean;
  dragActive: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `chip:${term}`, disabled: !droppable || active });
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active}
      onClick={onClick}
      className={cn(
        "relative flex h-12 min-w-[76px] shrink-0 flex-col justify-center rounded border bg-card px-2.5 text-left transition-colors",
        active ? "border-ink" : "border-line",
        dragActive && droppable && !active && "border-line-strong",
        isOver && "border-ink bg-fill",
        isCurrent && "shadow-[inset_0_2px_0_rgb(var(--brand))]",
      )}
    >
      <span className={cn("text-xs", active ? "font-semibold text-ink" : "text-sub")}>{TERM_LABEL[term]}</span>
      <span className="mt-0.5 text-2xs text-faint">
        <span className="num">{formatCredits(credits)}</span> 分 <span className="num">{count}</span> 门
      </span>
    </button>
  );
}

/* 横向看板 ----------------------------------------------------------- */

export function BoardScroller({ children, scrollToTerm }: { children: React.ReactNode; scrollToTerm?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!scrollToTerm) return;
    const el = ref.current;
    const target = el?.querySelector<HTMLElement>(`[data-term='${scrollToTerm}']`);
    if (!el || !target || el.scrollWidth <= el.clientWidth) return;
    const left = target.offsetLeft - el.clientWidth / 2 + target.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [scrollToTerm]);

  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 352, behavior: "smooth" });

  return (
    <div>
      {(edges.left || edges.right) && (
        <div className="mb-2 flex justify-end gap-1">
          <IconButton label="向左滚动" variant="secondary" disabled={!edges.left} onClick={() => scrollBy(-1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="向右滚动" variant="secondary" disabled={!edges.right} onClick={() => scrollBy(1)}>
            <ChevronRight />
          </IconButton>
        </div>
      )}
      <div ref={ref} className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        <div className="grid auto-cols-[minmax(168px,1fr)] grid-flow-col items-stretch gap-2">{children}</div>
      </div>
    </div>
  );
}

/* 底部坞站：待安排 / 垃圾篓 ------------------------------------------- */

export type DockKey = "pending" | "trash";

function DockButton({
  id,
  icon,
  title,
  count,
  credits,
  active,
  droppable,
  dragActive,
  onClick,
}: {
  id: DockKey;
  icon: React.ReactNode;
  title: string;
  count: number;
  credits: number;
  active: boolean;
  droppable: boolean;
  dragActive: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "flex h-9 min-w-0 flex-1 items-center justify-between gap-3 rounded px-3 text-left text-xs transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
        active ? "bg-fill-strong text-ink" : "text-sub hover:bg-fill hover:text-ink",
        dragActive && droppable && "bg-fill",
        isOver && (id === "trash" ? "bg-danger/10 text-danger" : "bg-fill-strong text-ink"),
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="shrink-0 font-medium text-ink">{title}</span>
      </span>
      <span className="truncate text-2xs">
        <span className="num text-ink">{count}</span> 门
        <span className="hidden sm:inline">
          {" "}
          <span className="num text-ink">{formatCredits(credits)}</span> 学分
        </span>
      </span>
    </button>
  );
}

export function Dock({
  active,
  onToggle,
  showTrash,
  pending,
  trash,
  canDrop,
  dragActive,
  panel,
}: {
  active: DockKey | null;
  onToggle: (key: DockKey) => void;
  showTrash: boolean;
  pending: { count: number; credits: number };
  trash: { count: number; credits: number };
  canDrop: boolean;
  dragActive: boolean;
  panel: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-dock flex flex-col items-center gap-2 px-3 sm:bottom-4">
      {active && panel}
      <div
        className={cn(
          "pointer-events-auto flex w-full items-center gap-1 rounded-md border border-line bg-card p-1 shadow-pop",
          showTrash ? "max-w-[440px]" : "max-w-[240px]",
        )}
      >
        <DockButton
          id="pending"
          icon={<Inbox className="shrink-0" />}
          title="待安排"
          count={pending.count}
          credits={pending.credits}
          active={active === "pending"}
          droppable={canDrop}
          dragActive={dragActive}
          onClick={() => onToggle("pending")}
        />
        {showTrash && (
          <>
            <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
            <DockButton
              id="trash"
              icon={<Trash2 className="shrink-0" />}
              title="垃圾篓"
              count={trash.count}
              credits={trash.credits}
              active={active === "trash"}
              droppable={canDrop}
              dragActive={dragActive}
              onClick={() => onToggle("trash")}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function DockPanel({
  dropId,
  droppable,
  dragActive,
  title,
  subtitle,
  actions,
  onClose,
  children,
}: {
  dropId: DockKey;
  droppable: boolean;
  dragActive: boolean;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${dropId}-panel`, data: { alias: dropId }, disabled: !droppable });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={title}
      className={cn(
        "animate-fade pointer-events-auto flex max-h-[min(46vh,520px)] w-full max-w-[1100px] flex-col overflow-hidden rounded-md border bg-card shadow-pop",
        isOver ? (dropId === "trash" ? "border-danger" : "border-ink") : dragActive && droppable ? "border-line-strong" : "border-line",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line pl-4 pr-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <div className="shrink-0 text-sm font-semibold text-ink">{title}</div>
          <div className="truncate text-2xs text-sub">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <IconButton label="收起" onClick={onClose}>
            <X />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">{children}</div>
    </div>
  );
}

export function DockGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">{children}</div>;
}

export function TrashCard({
  item,
  editing,
  onRestore,
  onPermanentDelete,
}: {
  item: Course;
  editing: boolean;
  onRestore: () => Promise<void>;
  onPermanentDelete: () => Promise<void>;
}) {
  return (
    <CourseTile
      item={item}
      mode="trash"
      surface={courseSurface(item)}
      onRestore={editing ? onRestore : undefined}
      onPermanentDelete={editing ? onPermanentDelete : undefined}
    >
      <div className="pl-1">
        <div className="flex h-4 items-center justify-between gap-2 text-2xs">
          <span className={cn("truncate text-faint", item.source === "program" && "num")}>
            {item.source === "program" ? item.courseCode : "自定"}
          </span>
          <span className="num shrink-0 text-sub">{formatCredits(item.credits)}</span>
        </div>
        <div className="mt-0.5 text-xs font-medium text-ink">{item.courseName}</div>
        <div className="mt-1 text-2xs text-sub">{item.requirementType}</div>
      </div>
    </CourseTile>
  );
}

/* 工具栏小件 --------------------------------------------------------- */

export function Legend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "no-scrollbar flex items-center gap-4 overflow-x-auto whitespace-nowrap text-2xs text-sub",
        className,
      )}
    >
      {Object.entries(CATEGORY_STYLE).map(([code, s]) => (
        <span key={code} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.name}
        </span>
      ))}
      <span className="h-3 w-px bg-line-strong" aria-hidden />
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-4 rounded-sm"
          style={{ backgroundColor: "rgb(var(--sub) / 0.14)", boxShadow: "inset 2px 0 0 rgb(var(--sub))" }}
        />
        必修
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-4 rounded-sm bg-card"
          style={{ boxShadow: "inset 2px 0 0 rgb(var(--sub)), inset 0 0 0 1px rgb(var(--line-strong))" }}
        />
        选修
      </span>
    </div>
  );
}

export function DisplayOptionsMenu({
  value,
  onChange,
}: {
  value: CourseCardDisplayOptions;
  onChange: (next: CourseCardDisplayOptions) => void;
}) {
  const selectedCount = COURSE_CARD_DISPLAY_ITEMS.filter((item) => value[item.key]).length;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" icon={<SlidersHorizontal />}>
          显示
          <span className="num text-faint">
            {selectedCount}/{COURSE_CARD_DISPLAY_ITEMS.length}
          </span>
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuLabel>卡片显示内容</MenuLabel>
        {COURSE_CARD_DISPLAY_ITEMS.map((item) => (
          <MenuCheckboxItem
            key={item.key}
            checked={value[item.key]}
            onCheckedChange={(checked) => onChange({ ...value, [item.key]: Boolean(checked) })}
            onSelect={(event) => event.preventDefault()}
          >
            {item.label}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
