import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

type HoverPosition = {
  left: number;
  top: number;
  width: number;
  placeLeft: boolean;
};

interface Options {
  width?: number;
  gap?: number;
  closeDelayMs?: number;
}

const EXIT_DURATION_MS = 180;

function triangleArea(a: Point, b: Point, c: Point) {
  return Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);
}

function pointInTriangle(p: Point, a: Point, b: Point, c: Point) {
  const area = triangleArea(a, b, c);
  const area1 = triangleArea(p, b, c);
  const area2 = triangleArea(a, p, c);
  const area3 = triangleArea(a, b, p);
  return Math.abs(area - (area1 + area2 + area3)) <= 1.2;
}

function pointInRect(p: Point, rect: DOMRect, pad = 0) {
  return (
    p.x >= rect.left - pad &&
    p.x <= rect.right + pad &&
    p.y >= rect.top - pad &&
    p.y <= rect.bottom + pad
  );
}

export function useHoverIntentTriangle<T extends HTMLElement>({
  width = 280,
  gap = 10,
  closeDelayMs = 520,
}: Options = {}) {
  const anchorRef = useRef<T | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const leavePointRef = useRef<Point | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const openFrameRef = useRef<number | null>(null);
  const mouseMoveRef = useRef<((event: MouseEvent) => void) | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const [position, setPosition] = useState<HoverPosition | null>(null);
  const [visible, setVisible] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const clearOpenFrame = useCallback(() => {
    if (openFrameRef.current != null) {
      window.cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
  }, []);

  const removeMouseMove = useCallback(() => {
    if (mouseMoveRef.current) {
      window.removeEventListener("mousemove", mouseMoveRef.current);
      mouseMoveRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearCloseTimer();
    clearHideTimer();
    clearOpenFrame();
    removeMouseMove();
    leavePointRef.current = null;
    setVisible(false);
    hideTimerRef.current = window.setTimeout(() => {
      setPosition(null);
      hideTimerRef.current = null;
    }, EXIT_DURATION_MS);
  }, [clearCloseTimer, clearHideTimer, clearOpenFrame, removeMouseMove]);

  const open = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    clearCloseTimer();
    clearHideTimer();
    clearOpenFrame();
    removeMouseMove();
    const rect = el.getBoundingClientRect();
    const screenW = window.innerWidth || 1920;
    const placeLeft = rect.right + gap + width + 16 > screenW;
    const left = placeLeft ? Math.max(12, rect.left - gap - width) : rect.right + gap;
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - 80));
    setPosition({ left, top, width, placeLeft });
    openFrameRef.current = window.requestAnimationFrame(() => {
      setVisible(true);
      openFrameRef.current = null;
    });
  }, [clearCloseTimer, clearHideTimer, clearOpenFrame, gap, removeMouseMove, width]);

  const shouldKeepOpen = useCallback(
    (point: Point) => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const popover = popoverRef.current?.getBoundingClientRect();
      const leavePoint = leavePointRef.current;
      if (anchor && pointInRect(point, anchor, 2)) return true;
      if (popover && pointInRect(point, popover, 8)) return true;
      if (!popover || !leavePoint) return false;

      const padY = 14;
      const padX = 18;
      const b = position?.placeLeft
        ? { x: popover.right + padX, y: popover.top - padY }
        : { x: popover.left - padX, y: popover.top - padY };
      const c = position?.placeLeft
        ? { x: popover.right + padX, y: popover.bottom + padY }
        : { x: popover.left - padX, y: popover.bottom + padY };
      return pointInTriangle(point, leavePoint, b, c);
    },
    [position?.placeLeft]
  );

  const startGuardedClose = useCallback(
    (event: React.MouseEvent) => {
      leavePointRef.current = { x: event.clientX, y: event.clientY };
      clearCloseTimer();
      clearHideTimer();
      clearOpenFrame();
      removeMouseMove();

      const onMove = (moveEvent: MouseEvent) => {
        const point = { x: moveEvent.clientX, y: moveEvent.clientY };
        lastPointRef.current = point;
        if (!shouldKeepOpen(point)) {
          close();
        }
      };
      mouseMoveRef.current = onMove;
      window.addEventListener("mousemove", onMove);
      closeTimerRef.current = window.setTimeout(() => {
        const last = lastPointRef.current ?? leavePointRef.current;
        if (!last || !shouldKeepOpen(last)) {
          close();
        }
      }, closeDelayMs);
    },
    [clearCloseTimer, clearHideTimer, clearOpenFrame, close, closeDelayMs, removeMouseMove, shouldKeepOpen]
  );

  const keepOpen = useCallback(() => {
    clearCloseTimer();
    clearHideTimer();
    clearOpenFrame();
    removeMouseMove();
    leavePointRef.current = null;
    if (position) setVisible(true);
  }, [clearCloseTimer, clearHideTimer, clearOpenFrame, removeMouseMove, position]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    removeMouseMove();
    closeTimerRef.current = window.setTimeout(close, 160);
  }, [clearCloseTimer, close, removeMouseMove]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
      clearHideTimer();
      clearOpenFrame();
      removeMouseMove();
    };
  }, [clearCloseTimer, clearHideTimer, clearOpenFrame, removeMouseMove]);

  return {
    anchorRef,
    popoverRef,
    position,
    visible,
    open,
    close,
    keepOpen,
    startGuardedClose,
    scheduleClose,
  };
}
