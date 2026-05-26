import type {
  CourseCardDisplayOptions,
  PersonalPlanItem,
  SemesterCourse,
} from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";
import { TERM_LABEL } from "../lib/offeredTerm";

type ManualLike = SemesterCourse | PersonalPlanItem;

interface Props {
  course: ManualLike;
  onDelete?: (id: number) => void;
  draggable?: boolean;
  displayOptions?: CourseCardDisplayOptions;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

export function ManualCourseCard({
  course,
  onDelete,
  draggable = false,
  displayOptions = DEFAULT_COURSE_CARD_DISPLAY_OPTIONS,
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

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
              {course.credits} 学分
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
          onClick={() => onDelete(course.id as number)}
          className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full bg-card border border-sub/25 text-sub hover:text-ink hover:border-sub/50 transition-colors text-[10px] leading-none"
          title="移入垃圾篓"
        >
          ×
        </button>
      )}
    </div>
  );
}
