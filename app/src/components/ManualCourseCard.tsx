import type {
  CourseCardDisplayOptions,
  PersonalPlanItem,
  PlanCoursePatch,
  SemesterCourse,
} from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";
import { formatCredits } from "../lib/credits";
import { TERM_LABEL } from "../lib/offeredTerm";
import { CourseHoverCard, type CourseHoverInfo } from "./CourseHoverCard";
import { useHoverIntentTriangle } from "../hooks/useHoverIntentTriangle";

type ManualLike = SemesterCourse | PersonalPlanItem;

interface Props {
  course: ManualLike;
  onDelete?: (id: number) => void;
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
  const termNumber =
    "planned_term" in course ? course.planned_term : course.term_number;
  const label = "planned_term" in course ? "计划" : "手动";
  const style = course.category_code
    ? CATEGORY_STYLE[course.category_code]
    : CATEGORY_STYLE.general_education;
  const isRequired = course.course_nature === "必修";
  const score = "score" in course ? course.score : null;
  const hover = useHoverIntentTriangle<HTMLDivElement>({ width: 280 });

  const hoverItem: CourseHoverInfo = {
    source: "custom",
    id: course.id,
    course_code: course.course_code ?? null,
    course_name: course.course_name,
    credits: course.credits,
    lecture_hours: "lecture_hours" in course ? course.lecture_hours : 0,
    experiment_hours: "experiment_hours" in course ? course.experiment_hours : 0,
    extra_hours: "extra_hours" in course ? course.extra_hours : 0,
    prerequisite_course_code: "prerequisite_course_code" in course ? course.prerequisite_course_code : null,
    prerequisite_course_name: "prerequisite_course_name" in course ? course.prerequisite_course_name : null,
    category_code: course.category_code ?? "general_education",
    category_name:
      "category_name" in course && course.category_name
        ? course.category_name
        : style.name,
    course_nature: (course.course_nature ?? "选修") as CourseHoverInfo["course_nature"],
    offered_term: "offered_term" in course ? course.offered_term : null,
    planned_term: termNumber,
    score,
    note: "note" in course ? course.note : null,
    is_interdisciplinary: "is_interdisciplinary" in course ? course.is_interdisciplinary ?? 0 : 0,
    assigned_to: "assigned_to" in course ? course.assigned_to ?? null : null,
    credit_count_to: "credit_count_to" in course ? course.credit_count_to ?? null : null,
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
          {course.course_name}
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
            {displayOptions.showNature && course.course_nature && (
              <span className="text-sub">{course.course_nature}</span>
            )}
          </div>
        )}

        {displayOptions.showScore && score != null && (
          <div className="mt-1 text-[10px] text-brand tabular-nums">
            ✓ {score}
          </div>
        )}

        {course.id != null && onDelete && (
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              hover.close();
              onDelete(course.id as number);
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
