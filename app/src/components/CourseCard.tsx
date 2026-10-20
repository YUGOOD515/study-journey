import { TriangleAlert, Check } from "../lib/icons";
import type { CourseCardDisplayOptions, Course, PlanCoursePatch } from "../types";
import { CATEGORY_STYLE, categorySurface } from "../lib/categoryStyle";
import { DEFAULT_COURSE_CARD_DISPLAY_OPTIONS } from "../lib/courseCardDisplay";
import { formatCredits } from "../lib/credits";
import { TERM_LABEL } from "../lib/offeredTerm";
import { cn } from "../lib/cn";
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
  /** 手动添加 / 开课数据添加的自定义课程 */
  custom?: boolean;
}

/** 卡片底色：类别浅底 + 1px 类别描边（必修更实，选修更浅） */
export function courseSurface(course: Pick<Course, "categoryCode" | "requirementType">): React.CSSProperties {
  return categorySurface(course.categoryCode, course.requirementType === "必修");
}

/**
 * 课程卡（时间轴）。
 * - 类别浅底 + 1px 类别描边标识板块；必修更实，选修更浅。课程名用类别文字色。
 * - 第 1 行：课程号（等宽、弱）＋ 学分（等宽、右对齐）
 * - 第 2 行：课程名 12/500
 * - 第 3 行：性质 ＋ 成绩；警告单独一行
 */
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
  custom = false,
}: Props) {
  const score = completedScore ?? course.score ?? null;
  const item: Course = {
    ...course,
    plannedTerm: plannedTerm !== undefined ? plannedTerm : course.plannedTerm,
    score,
  };
  const customTerm = course.actualTerm ?? course.plannedTerm;
  const codeText = custom
    ? `${course.studyStatus === "计划修读" ? "计划" : "自定"} / ${customTerm == null ? "待安排" : TERM_LABEL[customTerm]}`
    : course.courseCode;

  const showTop = displayOptions.showCourseCode || displayOptions.showCredits;
  const showBottom = displayOptions.showNature || (displayOptions.showScore && score != null);

  return (
    <CourseTile
      item={item}
      surface={courseSurface(course)}
      editable={editable}
      onSave={onSave}
      menu={menu}
      detailActions={detailActions}
      drag={drag}
      overlay={overlay}
    >
      <div>
        {showTop && (
          <div className="flex h-4 items-center justify-between gap-2 text-2xs">
            <span className={cn("min-w-0 truncate text-faint", !custom && "num")}>
              {displayOptions.showCourseCode ? codeText : ""}
            </span>
            {displayOptions.showCredits && (
              <span className={cn("num shrink-0 text-sub", menu && "group-hover/tile:invisible coarse:invisible")}>
                {formatCredits(course.credits)}
              </span>
            )}
          </div>
        )}
        <div
          className={cn("text-xs font-medium", showTop && "mt-0.5", !showTop && menu && "pr-6")}
          style={{ color: (CATEGORY_STYLE[course.categoryCode] ?? CATEGORY_STYLE.general_education).text }}
        >
          {course.courseName}
        </div>
        {showBottom && (
          <div className="mt-1 flex h-4 items-center justify-between gap-2 text-2xs">
            <span className="text-sub">{displayOptions.showNature ? course.requirementType : ""}</span>
            {displayOptions.showScore && score != null && (
              <span className="num inline-flex items-center gap-0.5 font-medium text-brand">
                <Check className="h-3 w-3" />
                {score}
              </span>
            )}
          </div>
        )}
        {movedToTerm != null && (
          <div className="mt-1 text-2xs text-sub">
            实际在学期 <span className="num">{movedToTerm}</span>
          </div>
        )}
        {warning && (
          <div className="mt-1 flex items-start gap-1 text-2xs text-warn">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{warning}</span>
          </div>
        )}
      </div>
    </CourseTile>
  );
}

/** 自定义课程（手动添加 / 开课数据添加）：同一张卡，课程号位置显示来源与学期 */
export function ManualCourseCard(props: Omit<Props, "custom" | "completedScore" | "plannedTerm" | "movedToTerm" | "warning">) {
  return <CourseCard {...props} custom />;
}
