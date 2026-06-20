import type { CourseCardDisplayOptions, Course, PlanCoursePatch } from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";
import { formatCredits } from "../lib/credits";
import { TERM_LABEL } from "../lib/offeredTerm";
import { CourseHoverCard } from "./CourseHoverCard";
import { useHoverIntentTriangle } from "../hooks/useHoverIntentTriangle";

interface Props {
  course: Course;
  onDelete?: (courseCode: string) => void;
  draggable?: boolean;
  displayOptions?: CourseCardDisplayOptions;
  editable?: boolean;
  onSave?: (patch: PlanCoursePatch) => Promise<void>;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

export function ManualCourseCard({
  course,
  onDelete,
  draggable = false,
  displayOptions = DEFAULT_COURSE_CARD_DISPLAY_OPTIONS,
  editable = false,
  onSave,
  onDragStart,
  onDragEnd,
}: Props) {
  const termNumber = course.actualTerm ?? course.plannedTerm;
  const label = course.studyStatus === "计划修读" ? "计划" : "手动";
  const style = CATEGORY_STYLE[course.categoryCode] ?? CATEGORY_STYLE.general_education;
  const isRequired = course.requirementType === "必修";
  const score = course.score ?? null;
  const hover = useHoverIntentTriangle<HTMLDivElement>({ width: 280 });

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
          "motion-list-item relative rounded-md px-2.5 py-2 text-[11px] leading-tight transition-all hover:-translate-y-0.5 hover:shadow-sm " +
          (draggable ? "cursor-grab active:cursor-grabbing" : "")
        }
        style={{
          backgroundColor: isRequired ? style.bgSoft : style.bgGhost,
          border: `1px dashed ${style.border}`,
        }}
      >
        {displayOptions.showCourseCode && (
          <div className="text-[9px] text-sub/80 tabular-nums">
            {label} · {termNumber == null ? "待安排" : TERM_LABEL[termNumber]}
          </div>
        )}

        <div className="font-medium mt-0.5" style={{ color: style.text }}>
          {course.courseName}
        </div>

        {(displayOptions.showCredits || displayOptions.showNature) && (
          <div className="flex items-center justify-between mt-1 text-[10px]">
            {displayOptions.showCredits ? (
              <span className="tabular-nums" style={{ color: style.text }}>
                {formatCredits(course.credits)} 学分
              </span>
            ) : (
              <span />
            )}
            {displayOptions.showNature && (
              <span className="text-sub">{course.requirementType}</span>
            )}
          </div>
        )}

        {displayOptions.showScore && score != null && (
          <div className="mt-1 text-[10px] text-brand tabular-nums">
            ✓ {score}
          </div>
        )}

        {onDelete && (
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              hover.close();
              onDelete(course.courseCode);
            }}
            className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full bg-card border border-sub/25 text-sub hover:text-ink hover:border-sub/50 transition-colors text-[10px] leading-none"
            title="移入垃圾篓"
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
          item={course}
          editable={editable}
          onSave={onSave}
          onMouseEnter={hover.keepOpen}
          onMouseLeave={hover.scheduleClose}
        />
      )}
    </>
  );
}
