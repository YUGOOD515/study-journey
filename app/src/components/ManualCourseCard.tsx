import type { PersonalPlanItem, SemesterCourse } from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { TERM_LABEL } from "../lib/offeredTerm";

type ManualLike = SemesterCourse | PersonalPlanItem;

interface Props {
  course: ManualLike;
  onDelete?: (id: number) => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

export function ManualCourseCard({
  course,
  onDelete,
  draggable = false,
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
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] text-sub/80 tabular-nums">
          {label} · {TERM_LABEL[termNumber]}
        </div>
        <div
          className="px-1 rounded-sm text-[9px] text-white"
          style={{ backgroundColor: style.color }}
        >
          自
        </div>
      </div>

      <div className="font-medium mt-0.5" style={{ color: style.text }}>
        {course.course_name}
      </div>

      <div className="flex items-center justify-between mt-1 text-[10px]">
        <span className="tabular-nums" style={{ color: style.text }}>
          {course.credits} 学分
        </span>
        <span className="text-sub">{course.course_nature}</span>
      </div>

      {("score" in course ? course.score != null : false) || course.note ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
          <span className="text-sub/70 truncate">{course.note}</span>
          {"score" in course && course.score != null && (
            <span className="text-brand tabular-nums">✓ {course.score}</span>
          )}
        </div>
      ) : null}

      {course.id != null && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(course.id as number)}
          className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full bg-card border border-sub/25 text-sub hover:text-ink hover:border-sub/50 transition-colors text-[10px] leading-none"
          title="删除手动课"
        >
          ×
        </button>
      )}
    </div>
  );
}
