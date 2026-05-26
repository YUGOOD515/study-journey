import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CourseCardDisplayOptions } from "../types";
import type { CourseInstance } from "../lib/progress";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";

interface Props {
  course: CourseInstance;
  /** 培养方案课的开课建议（program 用 official_term，custom 没有） */
  officialTerm?: string | null;
  draggable?: boolean;
  warning?: string;
  displayOptions?: CourseCardDisplayOptions;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDelete?: () => void;
}

export function CourseCard({
  course,
  officialTerm,
  draggable = false,
  warning,
  displayOptions = DEFAULT_COURSE_CARD_DISPLAY_OPTIONS,
  onDragStart,
  onDragEnd,
  onDelete,
}: Props) {
  const style = CATEGORY_STYLE[course.category_code];
  const isRequired = course.requirement_type === "必修";
  const isCustom = course.source === "custom";
  const isCompleted = course.study_status === "已修读";

  const bg = isRequired ? style.bgSoft : style.bgGhost;
  // 实线=必修；虚线=选修/跨专业/经法管融通 或 用户自加
  const borderStyle = isRequired && !isCustom ? "solid" : "dashed";

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
          "relative rounded-md px-2.5 py-2 text-[11px] leading-tight transition-all hover:-translate-y-0.5 hover:shadow-sm " +
          (draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default")
        }
        style={{
          backgroundColor: bg,
          border: `1px ${borderStyle} ${style.border}`,
        }}
      >
        {displayOptions.showCourseCode && (
          <div className="text-[9px] text-sub/80 tabular-nums flex items-center gap-1">
            {isCustom && <span className="text-sub/70">自</span>}
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
                {course.requirement_type}
              </span>
            )}
          </div>
        )}
        {displayOptions.showScore && isCompleted && course.score != null && (
          <div className="mt-1 text-[10px] text-brand tabular-nums">
            ✓ {course.score}
          </div>
        )}
        {course.study_status === "正在修读" && (
          <div className="mt-1 text-[10px] text-sub tabular-nums">在修</div>
        )}
        {warning && (
          <div className="mt-1 text-[10px] text-brand leading-snug">
            {warning}
          </div>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-1 right-1 w-4 h-4 rounded-sm text-sub/60 hover:text-red-500 hover:bg-red-500/10 transition-colors text-[10px] leading-none"
            aria-label="删除"
          >
            ×
          </button>
        )}
      </div>

      {tip && createPortal(
        <Tooltip x={tip.x} y={tip.y} course={course} officialTerm={officialTerm} />,
        document.body
      )}
    </>
  );
}

function Tooltip({
  x,
  y,
  course,
  officialTerm,
}: {
  x: number;
  y: number;
  course: CourseInstance;
  officialTerm?: string | null;
}) {
  const style = CATEGORY_STYLE[course.category_code];

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
          {course.course_subcategory ?? `${categoryName(course.category_code)} · ${course.requirement_type}`}
        </span>
      </Row>
      <Row label="学分">
        <span className="tabular-nums">{course.credits}</span>
      </Row>
      <Row label="状态">
        <span>{course.study_status}{course.score != null ? ` · ${course.score}` : ""}</span>
      </Row>
      {officialTerm && (
        <Row label="开课建议">
          <span className="tabular-nums">{officialTerm}</span>
        </Row>
      )}
      {course.actual_term != null && (
        <Row label="实际修读">
          <span className="tabular-nums">第 {course.actual_term} 学期</span>
        </Row>
      )}
      {course.credit_count_to && (
        <Row label="学分流向">
          <span>{course.credit_count_to}</span>
        </Row>
      )}
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

function categoryName(code: string): string {
  return {
    general_education: "通识教育",
    major_platform: "大类平台",
    professional_education: "专业教育",
    quality_education: "素质教育",
    practice_education: "实践教育",
  }[code] ?? code;
}
