import { useState } from "react";
import type React from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import type { PlanCoursePatch } from "../types";
import { cn } from "../lib/cn";
import { CourseDetailDialog, CourseHoverCard, type CourseHoverInfo } from "./CourseHoverCard";
import { useHoverIntentTriangle } from "../hooks/useHoverIntentTriangle";

export interface DragBinding {
  setNodeRef: (node: HTMLElement | null) => void;
  listeners?: DraggableSyntheticListeners;
  attributes?: DraggableAttributes;
  isDragging?: boolean;
}

export type TileMenu = React.ReactNode | ((ctx: { openEdit: () => void }) => React.ReactNode);

export interface CourseTileProps {
  item: CourseHoverInfo;
  /** 卡片背景 / 边框 */
  surface: React.CSSProperties;
  children: React.ReactNode;
  editable?: boolean;
  onSave?: (patch: PlanCoursePatch) => Promise<void>;
  /** 右上角操作菜单（仅编辑模式传入）；函数形式可拿到 openEdit */
  menu?: TileMenu;
  /** 详情弹窗中的额外操作 */
  detailActions?: React.ReactNode;
  drag?: DragBinding;
  /** 拖拽浮层中的静态副本 */
  overlay?: boolean;
  className?: string;
  mode?: "normal" | "trash";
  onRestore?: () => Promise<void> | void;
  onPermanentDelete?: () => Promise<void> | void;
}

/**
 * 课程卡片外壳：统一处理
 * - 鼠标悬停 → 悬浮详情；点击 / 触屏点按 → 详情弹窗（手机为底部抽屉）
 * - 编辑模式下的拖拽绑定（dnd-kit）与操作菜单
 */
export function CourseTile({
  item,
  surface,
  children,
  editable = false,
  onSave,
  menu,
  detailActions,
  drag,
  overlay = false,
  className,
  mode = "normal",
  onRestore,
  onPermanentDelete,
}: CourseTileProps) {
  const hover = useHoverIntentTriangle<HTMLDivElement>({ width: 280 });
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOnOpen, setEditOnOpen] = useState(false);
  const draggable = Boolean(drag) && !overlay;

  const setRef = (node: HTMLDivElement | null) => {
    hover.anchorRef.current = node;
    drag?.setNodeRef(node);
  };

  const openDetail = (edit = false) => {
    hover.close();
    setEditOnOpen(edit);
    setDetailOpen(true);
  };

  if (overlay) {
    return (
      <div
        className={cn(
          "relative w-[168px] cursor-grabbing rounded bg-card px-2 py-1.5 shadow-pop",
          className,
        )}
        style={{
          // 浮层下方是其他卡片：半透明底色叠在不透明卡片底上，避免“透视”
          ...surface,
          backgroundColor: undefined,
          backgroundImage: surface.backgroundColor
            ? `linear-gradient(${surface.backgroundColor}, ${surface.backgroundColor})`
            : undefined,
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <>
      <div
        ref={setRef}
        {...(drag?.attributes ?? {})}
        {...(drag?.listeners ?? {})}
        role="button"
        tabIndex={0}
        aria-label={`${item.courseName}，查看详情`}
        onMouseEnter={drag?.isDragging ? undefined : hover.open}
        onMouseLeave={hover.startGuardedClose}
        onPointerDown={(event) => {
          hover.close();
          drag?.listeners?.onPointerDown?.(event);
        }}
        onClick={(event) => {
          // 菜单等 portal 内容的合成事件会冒泡到这里，忽略
          if (!event.currentTarget.contains(event.target as Node)) return;
          openDetail(false);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openDetail(false);
          }
        }}
        className={cn(
          "group/tile relative select-none rounded px-2 py-1.5 outline-none transition-[filter,opacity] [-webkit-touch-callout:none]",
          "hover:brightness-[0.98] dark:hover:brightness-110",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          drag?.isDragging && "opacity-30",
          className,
        )}
        style={surface}
      >
        {children}
        {menu && (
          <div
            className="absolute right-0.5 top-0.5"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onMouseEnter={hover.close}
          >
            {typeof menu === "function" ? menu({ openEdit: () => openDetail(true) }) : menu}
          </div>
        )}
      </div>

      {hover.position && !drag?.isDragging && (
        <CourseHoverCard
          position={hover.position}
          popoverRef={hover.popoverRef}
          visible={hover.visible}
          item={item}
          mode={mode}
          editable={editable}
          onSave={onSave}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
          onMouseEnter={hover.keepOpen}
          onMouseLeave={hover.scheduleClose}
        />
      )}

      <CourseDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        item={item}
        mode={mode}
        editable={editable}
        startEditing={editOnOpen}
        onSave={onSave}
        onRestore={
          onRestore &&
          (async () => {
            setDetailOpen(false);
            await onRestore();
          })
        }
        onPermanentDelete={
          onPermanentDelete &&
          (async () => {
            setDetailOpen(false);
            await onPermanentDelete();
          })
        }
        extraActions={detailActions}
      />
    </>
  );
}

/** 卡片右上角“更多”按钮的统一样式 */
export const tileMenuTriggerClass =
  "flex h-6 w-6 items-center justify-center rounded-sm bg-card text-sub opacity-0 shadow-[0_0_0_1px_rgb(var(--line-strong))] transition-opacity hover:text-ink focus-visible:opacity-100 group-hover/tile:opacity-100 data-[state=open]:opacity-100 coarse:bg-transparent coarse:opacity-100 coarse:shadow-none [&_svg]:h-3.5 [&_svg]:w-3.5";
