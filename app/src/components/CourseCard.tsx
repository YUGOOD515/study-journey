import { Check } from "lucide-react";
import type { CourseCardDisplayOptions, Course, PlanCoursePatch } from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";
import { formatCredits } from "../lib/credits";
import { CourseTile, type DragBinding, type TileMenu } from "./CourseTile";

interface Props {
  course: Course;
  completedScore?: number | null;
  plannedTerm?: number | null;
  movedToTerm?: number;
  warning?: string;
  displayOptions?: CourseCardDisplayOptions;
  editable?: boolean;
  onSave?: (patch: PlanCoursePatch) => Promise<void>;
  menu?: TileMenu;
  detailActions?: React.ReactNode;
  drag?: DragBinding;
  overlay?: boolean;
}

export function CourseCard({
  course,
  completedScore,
  plannedTerm,
  movedToTerm,
  warning,
  displayOptions = DEFAULT_COURSE_CARD_DISPLAY_OPTIONS,
  editable = false,
  onSave,
  menu,
  detailActions,
  drag,
  overlay,
}: Props) {
  const style = CATEGORY_STYLE[course.categoryCode] ?? CATEGORY_STYLE.general_education;
  const isRequired = course.requirementType === "必修";
  const score = completedScore ?? course.score ?? null;
  const item: Course = {
    ...course,
    plannedTerm: plannedTerm !== undefined ? plannedTerm : course.plannedTerm,
  };

  return (
    <CourseTile
      item={item}
      surface={{
        backgroundColor: isRequired ? style.bgSoft : style.bgGhost,
        border: `1px ${isRequired ? "solid" : "dashed"} ${style.border}`,
      }}
      editable={editable}
      onSave={onSave}
      menu={menu}
      detailActions={detailActions}
      drag={drag}
      overlay={overlay}
    >
      {displayOptions.showCourseCode && (
        <div className="num text-[9px] text-sub">{course.courseCode}</div>
      )}
      <div className="mt-0.5 font-medium" style={{ color: style.text }}>
        {course.courseName}
      </div>
      {(displayOptions.showCredits || displayOptions.showNature) && (
        <div className="mt-1 flex items-center justify-between text-[10px]">
          {displayOptions.showCredits ? (
            <span className="num" style={{ color: style.text }}>
              {formatCredits(course.credits)} 学分
            </span>
          ) : (
            <span />
          )}
          {displayOptions.showNature && (
            <span
              className={isRequired ? "rounded-sm px-1 text-white" : "text-sub"}
              style={isRequired ? { backgroundColor: style.color } : undefined}
            >
              {course.requirementType}
            </span>
          )}
        </div>
      )}
      {displayOptions.showScore && score != null && (
        <div className="num mt-1 flex items-center gap-0.5 text-[10px] text-brand">
          <Check size={11} strokeWidth={2.5} /> {score}
        </div>
      )}
      {movedToTerm != null && (
        <div className="num mt-1 text-[10px] text-sub">实际在学期 {movedToTerm}</div>
      )}
      {warning && <div className="mt-1 text-[10px] leading-snug text-brand">{warning}</div>}
    </CourseTile>
  );
}
