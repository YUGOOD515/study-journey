import { Check } from "lucide-react";
import type { CourseCardDisplayOptions, Course, PlanCoursePatch } from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";
import { formatCredits } from "../lib/credits";
import { TERM_LABEL } from "../lib/offeredTerm";
import { CourseTile, type DragBinding, type TileMenu } from "./CourseTile";

interface Props {
  course: Course;
  displayOptions?: CourseCardDisplayOptions;
  editable?: boolean;
  onSave?: (patch: PlanCoursePatch) => Promise<void>;
  menu?: TileMenu;
  detailActions?: React.ReactNode;
  drag?: DragBinding;
  overlay?: boolean;
}

export function ManualCourseCard({
  course,
  displayOptions = DEFAULT_COURSE_CARD_DISPLAY_OPTIONS,
  editable = false,
  onSave,
  menu,
  detailActions,
  drag,
  overlay,
}: Props) {
  const termNumber = course.actualTerm ?? course.plannedTerm;
  const label = course.studyStatus === "计划修读" ? "计划" : "手动";
  const style = CATEGORY_STYLE[course.categoryCode] ?? CATEGORY_STYLE.general_education;
  const isRequired = course.requirementType === "必修";
  const score = course.score ?? null;

  return (
    <CourseTile
      item={course}
      surface={{
        backgroundColor: isRequired ? style.bgSoft : style.bgGhost,
        border: `1px dashed ${style.border}`,
      }}
      editable={editable}
      onSave={onSave}
      menu={menu}
      detailActions={detailActions}
      drag={drag}
      overlay={overlay}
    >
      {displayOptions.showCourseCode && (
        <div className="num text-[9px] text-sub">
          {label} · {termNumber == null ? "待安排" : TERM_LABEL[termNumber]}
        </div>
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
          {displayOptions.showNature && <span className="text-sub">{course.requirementType}</span>}
        </div>
      )}
      {displayOptions.showScore && score != null && (
        <div className="num mt-1 flex items-center gap-0.5 text-[10px] text-brand">
          <Check size={11} strokeWidth={2.5} /> {score}
        </div>
      )}
    </CourseTile>
  );
}
