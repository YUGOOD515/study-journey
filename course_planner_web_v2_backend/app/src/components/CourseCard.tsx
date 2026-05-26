import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CourseCardDisplayOptions, CourseWithCategory } from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { parseOfferedTerm } from "../lib/offeredTerm";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";

interface Props {
  course: CourseWithCategory;
  completedScore?: number | null;
  draggable?: boolean;
  movedToTerm?: number;
  warning?: string;
  displayOptions?: CourseCardDisplayOptions;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

export function CourseCard({
  course,
  completedScore,
  draggable = false,
  movedToTerm,
  warning,
  displayOptions = DEFAULT_COURSE_CARD_DISPLAY_OPTIONS,
  onDragStart,
  onDragEnd,
}: Props) {
  const style = CATEGORY_STYLE[course.category_code];
  const isRequired = course.course_nature === "必修";

  const bg = isRequired ? style.bgSoft : style.bgGhost;
  const borderStyle = isRequired ? "solid" : "dashed";

  const cardRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const showTip = () => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTip({ x: r.right + 10, y: r.top });
  };

  return (
    <>
      <div
        ref={cardRef}
        draggable={draggable}
        onDragStart={(event) => {
          setTip(null);
          onDragStart?.(event);
        }}
        onDragEnd={onDragEnd}
        onMouseEnter={showTip}
        onMouseLeave={() => setTip(null)}
        className={
          "rounded-md px-2.5 py-2 text-[11px] leading-tight transition-all hover:-translate-y-0.5 hover:shadow-sm " +
          (draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default")
        }
        style={{
          backgroundColor: bg,
          border: `1px ${borderStyle} ${style.border}`,
        }}
      >
        {displayOptions.showCourseCode && (
          <div className="text-[9px] text-sub/80 tabular-nums">
            {course.course_code}
          </div>
        )}
        <div className="font-medium mt-0.5" style={{ color: style.text }}>
          {course.course_name}
        </div>
        {(displayOptions.showCredits || displayOptions.showNature) && (
          <div className="flex items-center justify-between mt-1 text-[10px]">
            {displayOptions.showCredits ? (
              <span className="tabular-nums" style={{ color: style.text }}>
                {course.credits} 学分
              </span>
            ) : (
              <span />
            )}
            {displayOptions.showNature && (
              <span
                className={isRequired ? "px-1 rounded-sm text-white" : "text-sub"}
                style={isRequired ? { backgroundColor: style.color } : undefined}
              >
                {course.course_nature}
              </span>
            )}
          </div>
        )}
        {displayOptions.showScore && completedScore != null && (
          <div className="mt-1 text-[10px] text-brand tabular-nums">
            ✓ {completedScore}
          </div>
        )}
        {movedToTerm != null && (
          <div className="mt-1 text-[10px] text-sub tabular-nums">
            实际 → 学期 {movedToTerm}
          </div>
        )}
        {warning && (
          <div className="mt-1 text-[10px] text-brand leading-snug">
            {warning}
          </div>
        )}
      </div>

      {tip && createPortal(<Tooltip x={tip.x} y={tip.y} course={course} />, document.body)}
    </>
  );
}

function Tooltip({
  x,
  y,
  course,
}: {
  x: number;
  y: number;
  course: CourseWithCategory;
}) {
  const style = CATEGORY_STYLE[course.category_code];
  const parsed = parseOfferedTerm(course.offered_term);

  // 若浮窗右边会超出屏幕，则改放左侧
  const w = 260;
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const placeLeft = x + w + 16 > screenW;
  const left = placeLeft ? x - w - 20 : x;

  return (
    <div
      className="fixed z-50 rounded-lg text-[11px] leading-relaxed pointer-events-none text-ink bg-card"
      style={{
        left,
        top: y,
        width: w,
        border: `1px solid ${style.border}`,
        boxShadow:
          "0 14px 36px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 2px 8px rgb(var(--shadow-rgb) / var(--shadow-soft))",
        padding: "10px 12px",
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2 pb-2 border-b border-sub/15">
        <div className="text-[13px] font-medium" style={{ color: style.text }}>
          {course.course_name}
        </div>
        <div className="text-[10px] text-sub tabular-nums shrink-0">
          {course.course_code}
        </div>
      </div>

      <Row label="类别">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{ backgroundColor: style.color }}
          />
          {course.category_name} · {course.course_nature}
        </span>
      </Row>
      <Row label="学分">
        <span className="tabular-nums">{course.credits}</span>
      </Row>
      <Row label="学时">
        <span className="tabular-nums text-sub">
          讲 {course.lecture_hours} / 实 {course.experiment_hours} / 外 {course.extra_hours}
        </span>
      </Row>
      <Row label="开课学期">
        <span className="tabular-nums">
          {parsed.isFlexible
            ? "灵活（任意学期）"
            : parsed.rangeEnd != null
            ? `第 ${parsed.primary} – ${parsed.rangeEnd} 学期`
            : `第 ${parsed.primary} 学期`}
        </span>
      </Row>
      <Row label="先修">
        {course.prerequisite_course_name ? (
          <span style={{ color: style.text }}>
            {course.prerequisite_course_name}
          </span>
        ) : (
          <span className="text-sub/60">无</span>
        )}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-0.5">
      <div className="w-14 text-[10px] text-sub shrink-0">{label}</div>
      <div className="flex-1 text-ink">{children}</div>
    </div>
  );
}
