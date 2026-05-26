import type { CourseCardDisplayOptions, CourseWithCategory, PlanCoursePatch } from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";
import { CourseHoverCard, type CourseHoverInfo } from "./CourseHoverCard";
import { useHoverIntentTriangle } from "../hooks/useHoverIntentTriangle";

interface Props {
  course: CourseWithCategory;
  completedScore?: number | null;
  draggable?: boolean;
  plannedTerm?: number | null;
  movedToTerm?: number;
  warning?: string;
  displayOptions?: CourseCardDisplayOptions;
  editable?: boolean;
  onSave?: (patch: PlanCoursePatch) => Promise<void>;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDelete?: () => void;
  deleteTitle?: string;
}

export function CourseCard({
  course,
  completedScore,
  draggable = false,
  plannedTerm,
  movedToTerm,
  warning,
  displayOptions = DEFAULT_COURSE_CARD_DISPLAY_OPTIONS,
  editable = false,
  onSave,
  onDragStart,
  onDragEnd,
  onDelete,
  deleteTitle = "移入垃圾篓",
}: Props) {
  const style = CATEGORY_STYLE[course.category_code];
  const isRequired = course.course_nature === "必修";

  const bg = isRequired ? style.bgSoft : style.bgGhost;
  const borderStyle = isRequired ? "solid" : "dashed";
  const hover = useHoverIntentTriangle<HTMLDivElement>({ width: 280 });
  const score = completedScore ?? course.score ?? null;

  const hoverItem: CourseHoverInfo = {
    source: "program",
    course_code: course.course_code,
    course_name: course.course_name,
    credits: course.credits,
    lecture_hours: course.lecture_hours,
    experiment_hours: course.experiment_hours,
    extra_hours: course.extra_hours,
    prerequisite_course_code: course.prerequisite_course_code,
    prerequisite_course_name: course.prerequisite_course_name,
    category_code: course.category_code,
    category_name: course.category_name,
    course_nature: course.course_nature,
    offered_term: course.offered_term,
    planned_term: plannedTerm !== undefined ? plannedTerm : course.planned_term,
    score,
  };

  return (
    <>
      <div
        ref={hover.anchorRef}
        draggable={draggable}
        onDragStart={(event) => {
          hover.close();
          onDragStart?.(event);
        }}
        onDragEnd={onDragEnd}
        onMouseEnter={hover.open}
        onMouseLeave={hover.startGuardedClose}
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
        {displayOptions.showScore && score != null && (
          <div className="mt-1 text-[10px] text-brand tabular-nums">
            ✓ {score}
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
        {onDelete && (
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              hover.close();
              onDelete();
            }}
            className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full border border-sub/25 bg-card text-[10px] leading-none text-sub transition-colors hover:border-sub/50 hover:text-ink"
            title={deleteTitle}
            aria-label={deleteTitle}
          >
            ×
          </button>
        )}
      </div>

      {hover.position && (
        <CourseHoverCard
          position={hover.position}
          popoverRef={hover.popoverRef}
          visible={hover.visible}
          item={hoverItem}
          editable={editable}
          onSave={onSave}
          onMouseEnter={hover.keepOpen}
          onMouseLeave={hover.scheduleClose}
        />
      )}
    </>
  );
}
