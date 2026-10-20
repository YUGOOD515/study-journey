import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import type {
  CategoryCode,
  CourseEditDraft,
  CourseNature,
  CreditAssignmentTarget,
  PlanCoursePatch,
} from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { assignmentLabel, canUseInterdisciplinary } from "../lib/courseOptions";
import { formatCredits } from "../lib/credits";
import { parseOfferedTerm } from "../lib/offeredTerm";
import { CourseEditFields } from "./CourseEditFields";
import { Button, Dialog } from "./ui";

export interface CourseHoverInfo {
  source: "program" | "custom";
  courseCode?: string | null;
  courseName: string;
  credits: number;
  lectureHours?: number | null;
  experimentHours?: number | null;
  extraHours?: number | null;
  prerequisiteCourseCode?: string | null;
  prerequisiteCourseName?: string | null;
  categoryCode: CategoryCode;
  categoryName: string;
  requirementType: CourseNature;
  officialTerm?: string | null;
  plannedTerm?: number | null;
  score?: number | null;
  note?: string | null;
  creditCountTo?: string | null;
  deletedAt?: string | null;
}

type Mode = "normal" | "trash";

type Props = {
  position: {
    left: number;
    top: number;
    width: number;
    placeLeft?: boolean;
  };
  popoverRef: React.RefObject<HTMLDivElement>;
  visible?: boolean;
  item: CourseHoverInfo;
  mode?: Mode;
  editable?: boolean;
  onSave?: (patch: PlanCoursePatch) => Promise<void>;
  onRestore?: () => Promise<void> | void;
  onPermanentDelete?: () => Promise<void> | void;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
};

function creditCountToToAssignment(
  creditCountTo: string | null | undefined,
): CreditAssignmentTarget | null {
  if (creditCountTo === "通识教育-选修") return "elective";
  if (creditCountTo === "大类平台-选修") return "interdisciplinary";
  return null;
}

interface ContentProps {
  item: CourseHoverInfo;
  mode?: Mode;
  editable?: boolean;
  onSave?: (patch: PlanCoursePatch) => Promise<void>;
  onRestore?: () => Promise<void> | void;
  onPermanentDelete?: () => Promise<void> | void;
  /** 舒适布局（弹窗内） */
  comfortable?: boolean;
  /** 打开即进入编辑 */
  startEditing?: boolean;
  /** 保存成功 / 取消编辑后回调（弹窗用于关闭） */
  onDone?: () => void;
  /** 额外操作区（例如移动到、移入垃圾篓） */
  extraActions?: React.ReactNode;
  onLayoutChange?: () => void;
}

/** 课程详情内容：悬浮卡与详情弹窗共用 */
export function CourseDetailContent({
  item,
  mode = "normal",
  editable = false,
  onSave,
  onRestore,
  onPermanentDelete,
  comfortable = false,
  startEditing = false,
  onDone,
  extraActions,
  onLayoutChange,
}: ContentProps) {
  const style = CATEGORY_STYLE[item.categoryCode] ?? CATEGORY_STYLE.general_education;
  const [editing, setEditing] = useState(startEditing && editable && Boolean(onSave));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CourseEditDraft>(() => initialDraft(item));

  useEffect(() => {
    if (!editing) setDraft(initialDraft(item));
  }, [
    editing,
    item.courseCode,
    item.courseName,
    item.credits,
    item.lectureHours,
    item.experimentHours,
    item.extraHours,
    item.plannedTerm,
    item.prerequisiteCourseCode,
    item.score,
    item.note,
    item.categoryCode,
    item.requirementType,
    item.creditCountTo,
  ]);

  useEffect(() => {
    onLayoutChange?.();
  }, [editing, draft, mode, onLayoutChange]);

  const offeredText = useMemo(() => formatOfferedTerm(item.officialTerm), [item.officialTerm]);
  const plannedText = item.plannedTerm == null ? "待安排 / 未设置" : `第 ${item.plannedTerm} 学期`;
  const isInter = item.requirementType === "经法管融通" || Boolean(item.creditCountTo);
  const assignmentText = isInter
    ? assignmentLabel(creditCountToToAssignment(item.creditCountTo))
    : null;

  const reset = () => {
    setDraft(initialDraft(item));
    setError(null);
    setEditing(false);
    if (startEditing) onDone?.();
  };

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    setError(null);
    try {
      const patch = buildPatch(draft, { allowInterdisciplinary: item.source === "custom" });
      await onSave(patch);
      setEditing(false);
      onDone?.();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const size = comfortable ? "md" : "sm";

  return (
    <div className={comfortable ? "text-xs" : "text-2xs"}>
      {!comfortable && (
        <div className="-mx-3 -mt-2 mb-2 flex items-baseline justify-between gap-3 border-b border-line px-3 py-2">
          <div className="min-w-0 text-xs font-semibold text-ink">
            {editing ? "编辑课程" : item.courseName}
          </div>
          <div className="num shrink-0 text-2xs text-faint">{item.courseCode ?? "自定义"}</div>
        </div>
      )}

      {editing ? (
        <div className="space-y-1.5">
          <CourseEditFields
            draft={draft}
            onChange={setDraft}
            compact={!comfortable}
            allowInterdisciplinary={item.source === "custom"}
            showCourseName
            showNote
          />
          {error && (
            <div className="border-l-2 border-danger pl-2 text-2xs text-danger">{error}</div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              size={size}
              variant="primary"
              className="flex-1"
              loading={saving}
              onClick={() => void save()}
            >
              保存
            </Button>
            <Button
              size={size}
              variant="secondary"
              className="flex-1"
              disabled={saving}
              onClick={reset}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Row label="类别" comfortable={comfortable}>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: style.color }}
              />
              {item.categoryName}
              <span className="text-faint">/</span>
              {item.requirementType}
            </span>
          </Row>
          {isInter && (
            <Row label="经融" comfortable={comfortable}>
              <span>计入 {assignmentText}</span>
            </Row>
          )}
          <Row label="学分" comfortable={comfortable}>
            <span className="num">{formatCredits(item.credits)}</span>
          </Row>
          <Row label="学时" comfortable={comfortable}>
            <span className="inline-flex gap-3">
              <span>
                讲课 <span className="num">{item.lectureHours ?? 0}</span>
              </span>
              <span>
                实践 <span className="num">{item.experimentHours ?? 0}</span>
              </span>
              <span>
                课外 <span className="num">{item.extraHours ?? 0}</span>
              </span>
            </span>
          </Row>
          <Row label="计划学期" comfortable={comfortable}>
            <span>{plannedText}</span>
          </Row>
          {item.officialTerm !== undefined && item.officialTerm !== null && (
            <Row label="开课学期" comfortable={comfortable}>
              <span>{offeredText}</span>
            </Row>
          )}
          <Row label="先修" comfortable={comfortable}>
            {item.prerequisiteCourseCode || item.prerequisiteCourseName ? (
              <span>{item.prerequisiteCourseName ?? item.prerequisiteCourseCode}</span>
            ) : (
              <span className="text-faint">无</span>
            )}
          </Row>
          <Row label="成绩" comfortable={comfortable}>
            {item.score == null ? (
              <span className="text-faint">未填写</span>
            ) : (
              <span className="num font-medium">{item.score}</span>
            )}
          </Row>
          {item.note && (
            <Row label="备注" comfortable={comfortable}>
              <span className="whitespace-pre-wrap text-sub">{item.note}</span>
            </Row>
          )}
          {mode === "trash" && item.deletedAt && (
            <Row label="删除时间" comfortable={comfortable}>
              <span className="num text-sub">{item.deletedAt}</span>
            </Row>
          )}

          {mode === "trash" ? (
            (onRestore || onPermanentDelete) && (
              <div className="-mx-3 -mb-2 mt-2 flex gap-2 border-t border-line px-3 py-2">
                {onRestore && (
                  <Button
                    size={size}
                    variant="secondary"
                    className="flex-1"
                    icon={<RotateCcw size={13} />}
                    onClick={() => void onRestore()}
                  >
                    恢复
                  </Button>
                )}
                {onPermanentDelete && (
                  <Button
                    size={size}
                    variant="danger"
                    className="flex-1"
                    icon={<Trash2 size={13} />}
                    onClick={() => void onPermanentDelete()}
                  >
                    永久删除
                  </Button>
                )}
              </div>
            )
          ) : (editable && onSave) || extraActions ? (
            <div className="-mx-3 -mb-2 mt-2 flex flex-wrap gap-2 border-t border-line px-3 py-2">
              {editable && onSave && (
                <Button
                  size={size}
                  variant="secondary"
                  className="flex-1"
                  icon={<Pencil size={13} />}
                  onClick={() => setEditing(true)}
                >
                  编辑
                </Button>
              )}
              {extraActions}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** 桌面端悬浮详情卡 */
export function CourseHoverCard({
  position,
  popoverRef,
  visible = true,
  item,
  mode = "normal",
  editable = false,
  onSave,
  onRestore,
  onPermanentDelete,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const [adjustedTop, setAdjustedTop] = useState(position.top);

  const updatePosition = useCallback(() => {
    const margin = 12;
    const viewportHeight = window.innerHeight || 800;
    const maxUsableHeight = Math.max(180, viewportHeight - margin * 2);
    const currentHeight = Math.min(
      popoverRef.current?.getBoundingClientRect().height ?? maxUsableHeight,
      maxUsableHeight,
    );
    const maxTop = Math.max(margin, viewportHeight - currentHeight - margin);
    setAdjustedTop(Math.max(margin, Math.min(position.top, maxTop)));
  }, [popoverRef, position.top]);

  useLayoutEffect(() => {
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition, item.courseCode, item.courseName, mode]);

  const card = (
    <div
      ref={popoverRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="tooltip"
      className="fixed z-popover rounded-md border border-line bg-card text-ink shadow-pop transition-opacity duration-150"
      style={{
        left: position.left,
        top: adjustedTop,
        width: position.width,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        overscrollBehavior: "contain",
        padding: "8px 12px",
      }}
    >
      <CourseDetailContent
        item={item}
        mode={mode}
        editable={editable}
        onSave={onSave}
        onRestore={onRestore}
        onPermanentDelete={onPermanentDelete}
        onLayoutChange={updatePosition}
      />
    </div>
  );

  return createPortal(card, document.body);
}

/** 课程详情弹窗：触屏点按 / 点击卡片打开；手机为底部抽屉 */
export function CourseDetailDialog({
  open,
  onOpenChange,
  item,
  mode = "normal",
  editable = false,
  startEditing = false,
  onSave,
  onRestore,
  onPermanentDelete,
  extraActions,
}: Omit<ContentProps, "comfortable" | "onDone" | "onLayoutChange"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const style = CATEGORY_STYLE[item.categoryCode] ?? CATEGORY_STYLE.general_education;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: style.color }}
          />
          <span className="min-w-0 truncate">{item.courseName}</span>
        </span>
      }
      description={
        <span className="num">
          {item.courseCode ?? "自定义课程"}
          {mode === "trash" ? "（垃圾篓）" : ""}
        </span>
      }
    >
      {open && (
        <CourseDetailContent
          key={`${item.courseCode ?? item.courseName}-${startEditing}`}
          item={item}
          mode={mode}
          editable={editable}
          startEditing={startEditing}
          onSave={onSave}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
          extraActions={extraActions}
          comfortable
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function initialDraft(item: CourseHoverInfo): CourseEditDraft {
  const isInter = item.requirementType === "经法管融通" || Boolean(item.creditCountTo);
  return {
    course_name: item.courseName,
    category_code: item.categoryCode,
    course_nature: isInter ? "选修" : item.requirementType,
    is_interdisciplinary: isInter ? 1 : 0,
    assigned_to: creditCountToToAssignment(item.creditCountTo) ?? "interdisciplinary",
    credits: String(item.credits ?? 0),
    lecture_hours: String(item.lectureHours ?? 0),
    experiment_hours: String(item.experimentHours ?? 0),
    extra_hours: String(item.extraHours ?? 0),
    planned_term: item.plannedTerm ?? null,
    prerequisite_course_code: item.prerequisiteCourseCode ?? "",
    score: item.score == null ? "" : String(item.score),
    note: item.note ?? "",
  };
}

function buildPatch(
  draft: CourseEditDraft,
  { allowInterdisciplinary }: { allowInterdisciplinary: boolean },
): PlanCoursePatch {
  const score = draft.score.trim() === "" ? null : Number(draft.score);
  const category = draft.category_code;
  const canKeepInter = allowInterdisciplinary && canUseInterdisciplinary(category);
  const isInter = canKeepInter && draft.is_interdisciplinary === 1;
  const nature = isInter ? "选修" : draft.course_nature;
  return {
    course_name: draft.course_name.trim(),
    category_code: category,
    course_nature: nature,
    ...(allowInterdisciplinary
      ? { is_interdisciplinary: isInter ? 1 : 0, assigned_to: draft.assigned_to }
      : {}),
    credits: Number(draft.credits),
    lecture_hours: Number(draft.lecture_hours),
    experiment_hours: Number(draft.experiment_hours),
    extra_hours: Number(draft.extra_hours),
    planned_term: draft.planned_term,
    prerequisite_course_code: draft.prerequisite_course_code.trim() || null,
    score,
    note: draft.note.trim() || null,
  };
}

function formatOfferedTerm(term: string | null | undefined) {
  if (!term) return "未设置";
  const parsed = parseOfferedTerm(term);
  if (parsed.isFlexible) return "灵活（任意学期）";
  if (parsed.primary == null) return term;
  if (parsed.rangeEnd != null) return `第 ${parsed.primary} – ${parsed.rangeEnd} 学期`;
  return `第 ${parsed.primary} 学期`;
}

function Row({
  label,
  children,
  comfortable,
}: {
  label: string;
  children: React.ReactNode;
  comfortable?: boolean;
}) {
  return (
    <div
      className={
        comfortable
          ? "grid grid-cols-[64px_1fr] items-baseline gap-3 border-b border-line py-2 first:pt-0 last:border-0"
          : "grid grid-cols-[52px_1fr] items-baseline gap-2 py-0.5"
      }
    >
      <div
        className={
          comfortable ? "text-2xs text-sub" : "text-2xs text-faint"
        }
      >
        {label}
      </div>
      <div className="min-w-0 text-ink">{children}</div>
    </div>
  );
}
