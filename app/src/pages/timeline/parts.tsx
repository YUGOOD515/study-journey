import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
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

/* ------------------------------------------------------------------ */
/* 拖拽绑定                                                             */
/* ------------------------------------------------------------------ */

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
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id,
    data: { payload, course },
    disabled,
  });
  if (disabled) return <>{children(undefined)}</>;
  return <>{children({ setNodeRef, listeners, attributes, isDragging })}</>;
}

/* ------------------------------------------------------------------ */
/* 卡片菜单                                                             */
/* ------------------------------------------------------------------ */

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
        <button
          type="button"
          className={tileMenuTriggerClass}
          aria-label={`${payload.courseName} 的操作`}
        >
          <MoreHorizontal size={14} />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-44">
        {payload.lockedStatus ? (
          <MenuItem disabled icon={<Lock size={13} />}>
            {payload.lockedStatus}，不可移动
          </MenuItem>
        ) : (
          <MenuSub>
            <MenuSubTrigger icon={<ArrowRightLeft size={13} />}>移动到</MenuSubTrigger>
            <MenuSubContent className="w-36">
              {TERMS.map((term) => (
                <MenuItem
                  key={term}
                  disabled={payload.fromTerm === term}
                  icon={
                    payload.fromTerm === term ? (
                      <Check size={13} />
                    ) : (
                      <span className="num text-[10px]">{term}</span>
                    )
                  }
                  onSelect={() => onMove(payload, term)}
                >
                  {TERM_LABEL[term]}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                disabled={payload.fromTerm == null}
                icon={payload.fromTerm == null ? <Check size={13} /> : <Inbox size={13} />}
                onSelect={() => onMove(payload, null)}
              >
                待安排
              </MenuItem>
            </MenuSubContent>
          </MenuSub>
        )}
        {openEdit && (
          <MenuItem icon={<Pencil size={13} />} onSelect={openEdit}>
            编辑信息
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 size={13} />} onSelect={() => onTrash(payload)}>
          移入垃圾篓
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/* ------------------------------------------------------------------ */
/* 学期列                                                               */
/* ------------------------------------------------------------------ */

export function TermColumn({
  term,
  credits,
  count,
  isCurrent,
  personal,
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
  personal: boolean;
  droppable: boolean;
  dragActive: boolean;
  fromTerm?: number | null;
  /** 手机：整宽单列 */
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
        "flex min-w-0 flex-col rounded-xl border bg-card p-2 transition-[border-color,background-color,box-shadow] duration-150",
        isOver && isTarget
          ? "border-brand bg-brand/[0.06] shadow-[0_0_0_3px_rgb(var(--brand)/0.12)]"
          : isTarget
            ? "border-dashed border-brand/40"
            : personal
              ? "border-brand/20"
              : "border-sub/20",
        full ? "min-h-[40vh]" : "min-h-[220px]",
      )}
    >
      <header className="mb-2 flex items-start justify-between gap-1 px-0.5">
        <div className="min-w-0">
          <div className="num flex h-4 items-center gap-1.5 whitespace-nowrap text-[10px] leading-none text-sub">
            {personal && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />}
            <span className="shrink-0">学期 {term}</span>
            {isCurrent && (
              <Badge tone="brand" className="h-4 shrink-0 px-1 text-[9px]">
                本学期
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-sm text-ink">{TERM_LABEL[term]}</div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="num text-right text-[10px] leading-tight text-sub">
            <div className="text-[11px] text-ink">{formatCredits(credits)}</div>
            <div>{count} 门</div>
          </div>
          {onOpenSchedule && (
            <Tip label="查看学期课表">
              <IconButton
                label={`查看${TERM_LABEL[term]}课表`}
                size="xs"
                variant="ghost"
                onClick={onOpenSchedule}
              >
                <CalendarDays size={13} />
              </IconButton>
            </Tip>
          )}
        </div>
      </header>
      <div
        className={cn(
          "flex-1",
          full ? "grid grid-cols-2 content-start gap-1.5" : "flex flex-col gap-1.5",
        )}
      >
        {children}
      </div>
      {onAdd && (
        <Button
          variant="dashed"
          size="sm"
          icon={<Plus size={13} />}
          className="mt-2 w-full"
          onClick={onAdd}
        >
          添加课程
        </Button>
      )}
    </section>
  );
}

export function EmptyTerm({ editing }: { editing: boolean }) {
  return (
    <div className="col-span-full px-1 py-3 text-center text-[11px] text-faint">
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
  const { setNodeRef, isOver } = useDroppable({
    id: `chip:${term}`,
    disabled: !droppable || active,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active}
      onClick={onClick}
      className={cn(
        "relative flex h-12 min-w-[68px] shrink-0 flex-col items-center justify-center rounded-lg border px-2 text-xs transition-colors",
        active ? "border-brand/55 bg-card text-ink shadow-sm" : "border-sub/15 bg-card text-sub",
        dragActive && droppable && !active && "border-dashed border-brand/45",
        isOver && "border-brand bg-brand/10 text-brand",
      )}
    >
      <span className="flex items-center gap-1">
        {TERM_LABEL[term]}
        {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="本学期" />}
      </span>
      <span className="num mt-0.5 text-[10px] text-sub">
        {count} 门 · {formatCredits(credits)}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 横向看板（桌面 / 平板）                                              */
/* ------------------------------------------------------------------ */

export function BoardScroller({
  children,
  scrollToTerm,
}: {
  children: React.ReactNode;
  scrollToTerm?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
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
    if (!el || !target) return;
    if (el.scrollWidth <= el.clientWidth) return;
    const left = target.offsetLeft - el.clientWidth / 2 + target.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [scrollToTerm]);

  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 380, behavior: "smooth" });

  return (
    <div className="relative">
      <div
        ref={ref}
        className="no-scrollbar -mx-3 overflow-x-auto px-3 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        style={{
          maskImage: `linear-gradient(to right, ${edges.left ? "transparent" : "black"} 0, black 28px, black calc(100% - 28px), ${edges.right ? "transparent" : "black"} 100%)`,
        }}
      >
        <div className="grid auto-cols-[minmax(160px,1fr)] grid-flow-col items-stretch gap-2">
          {children}
        </div>
      </div>
      {(edges.left || edges.right) && (
        <div className="pointer-events-none absolute -top-10 right-0 flex gap-1">
          <IconButton
            label="向左滚动"
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            disabled={!edges.left}
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft size={15} />
          </IconButton>
          <IconButton
            label="向右滚动"
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            disabled={!edges.right}
            onClick={() => scrollBy(1)}
          >
            <ChevronRight size={15} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 底部坞站：待安排 / 垃圾篓                                            */
/* ------------------------------------------------------------------ */

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
        "flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 text-left text-xs transition-colors",
        active ? "bg-sub/10 text-ink" : "text-sub hover:bg-sub/5 hover:text-ink",
        dragActive && droppable && "bg-brand/[0.06] outline-dashed outline-1 outline-brand/45",
        isOver &&
          (id === "trash" ? "bg-danger/10 text-danger outline-danger" : "bg-brand/15 text-brand"),
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="shrink-0 text-[13px] text-ink">{title}</span>
      </span>
      <span className="num truncate text-[11px]">
        {count}
        <span className="hidden sm:inline"> 门 · {formatCredits(credits)} 学分</span>
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
          "pointer-events-auto flex w-full items-center gap-1 rounded-2xl border border-sub/15 bg-card/95 p-1 shadow-dock backdrop-blur-xl",
          showTrash ? "max-w-[460px]" : "max-w-[260px]",
        )}
      >
        <DockButton
          id="pending"
          icon={<Inbox size={15} className="shrink-0" />}
          title="待安排"
          count={pending.count}
          credits={pending.credits}
          active={active === "pending"}
          droppable={canDrop}
          dragActive={dragActive}
          onClick={() => onToggle("pending")}
        />
        {showTrash && (
          <DockButton
            id="trash"
            icon={<Trash2 size={15} className="shrink-0" />}
            title="垃圾篓"
            count={trash.count}
            credits={trash.credits}
            active={active === "trash"}
            droppable={canDrop}
            dragActive={dragActive}
            onClick={() => onToggle("trash")}
          />
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
  const { setNodeRef, isOver } = useDroppable({
    id: `${dropId}-panel`,
    data: { alias: dropId },
    disabled: !droppable,
  });

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
        "pointer-events-auto flex max-h-[min(46vh,520px)] w-full max-w-[1100px] animate-pop-in flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-pop backdrop-blur-xl",
        isOver
          ? dropId === "trash"
            ? "border-danger bg-danger/[0.06]"
            : "border-brand bg-brand/[0.06]"
          : dragActive && droppable
            ? "border-dashed border-brand/45"
            : "border-sub/15",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sub/10 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[13px] text-ink">{title}</div>
          <div className="truncate text-[10px] text-sub">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <IconButton label="收起" size="sm" variant="ghost" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">{children}</div>
    </div>
  );
}

export function DockGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]">
      {children}
    </div>
  );
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
  const style = CATEGORY_STYLE[item.categoryCode] ?? CATEGORY_STYLE.general_education;
  const isRequired = item.requirementType === "必修";
  return (
    <CourseTile
      item={item}
      mode="trash"
      surface={{
        backgroundColor: isRequired ? style.bgSoft : style.bgGhost,
        border: `1px ${isRequired ? "solid" : "dashed"} ${style.border}`,
      }}
      onRestore={editing ? onRestore : undefined}
      onPermanentDelete={editing ? onPermanentDelete : undefined}
    >
      <div className="num text-[9px] text-sub">
        {item.source === "program" ? item.courseCode : "自定义"}
      </div>
      <div className="mt-0.5 font-medium" style={{ color: style.text }}>
        {item.courseName}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className="num" style={{ color: style.text }}>
          {formatCredits(item.credits)} 学分
        </span>
        <span className="text-sub">{item.requirementType}</span>
      </div>
    </CourseTile>
  );
}

/* ------------------------------------------------------------------ */
/* 工具栏小件                                                           */
/* ------------------------------------------------------------------ */

export function Legend() {
  return (
    <div className="no-scrollbar -mx-3 mb-3 flex items-center gap-3 overflow-x-auto whitespace-nowrap px-3 text-[11px] text-sub sm:mx-0 sm:flex-wrap sm:px-0">
      {Object.entries(CATEGORY_STYLE).map(([code, s]) => (
        <span key={code} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: s.color }}
          />
          {s.name}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 sm:ml-2">
        <span className="inline-block h-2.5 w-4 rounded-sm border border-sub/50" />
        必修
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-sub/50" />
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
        <Button size="sm" variant="secondary" icon={<Eye size={13} />}>
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
