import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CategoryCode, CourseEditDraft, CourseNature, CreditAssignmentTarget, PlanCoursePatch } from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { assignmentLabel, canUseInterdisciplinary } from "../lib/courseOptions";
import { formatCredits } from "../lib/credits";
import { parseOfferedTerm } from "../lib/offeredTerm";
import { CourseEditFields } from "./CourseEditFields";

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
  creditCountTo: string | null | undefined
): CreditAssignmentTarget | null {
  if (creditCountTo === "通识教育-选修") return "elective";
  if (creditCountTo === "大类平台-选修") return "interdisciplinary";
  return null;
}

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
  const style = CATEGORY_STYLE[item.categoryCode] ?? CATEGORY_STYLE.general_education;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CourseEditDraft>(() => initialDraft(item));
  const [adjustedTop, setAdjustedTop] = useState(position.top);

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

  useLayoutEffect(() => {
    const margin = 12;
    const updatePosition = () => {
      const viewportHeight = window.innerHeight || 800;
      const maxUsableHeight = Math.max(180, viewportHeight - margin * 2);
      const currentHeight = Math.min(
        popoverRef.current?.getBoundingClientRect().height ?? maxUsableHeight,
        maxUsableHeight
      );
      const maxTop = Math.max(margin, viewportHeight - currentHeight - margin);
      setAdjustedTop(Math.max(margin, Math.min(position.top, maxTop)));
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
    };
  }, [editing, draft, item.courseCode, item.courseName, mode, popoverRef, position.top]);

  const offeredText = useMemo(() => formatOfferedTerm(item.officialTerm), [item.officialTerm]);
  const plannedText = item.plannedTerm == null ? "待安排 / 未设置" : `第 ${item.plannedTerm} 学期`;
  const scoreText = item.score == null ? "未填写" : String(item.score);
  const isInter = item.requirementType === "经法管融通" || Boolean(item.creditCountTo);
  const assignmentText = isInter ? assignmentLabel(creditCountToToAssignment(item.creditCountTo)) : null;

  const reset = () => {
    setDraft(initialDraft(item));
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    setError(null);
    try {
      const patch = buildPatch(draft, { allowInterdisciplinary: item.source === "custom" });
      await onSave(patch);
      setEditing(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const card = (
    <div
      ref={popoverRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 rounded-lg text-[11px] leading-relaxed text-ink bg-card transform-gpu transition-[opacity,transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        left: position.left,
        top: adjustedTop,
        width: position.width,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(5px) scale(0.985)",
        transformOrigin: position.placeLeft ? "right top" : "left top",
        pointerEvents: visible ? "auto" : "none",
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        overscrollBehavior: "contain",
        border: `1px solid ${style.border}`,
        boxShadow:
          "0 14px 36px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 2px 8px rgb(var(--shadow-rgb) / var(--shadow-soft))",
        padding: "10px 12px",
      }}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-sub/15 pb-2">
        <div className="min-w-0 text-[13px] font-medium" style={{ color: style.text }}>
          {editing ? "编辑课程" : item.courseName}
        </div>
        <div className="shrink-0 text-[10px] text-sub tabular-nums">
          {item.courseCode ?? "自定义"}
        </div>
      </div>

      {editing ? (
        <div className="space-y-1.5">
          <CourseEditFields
            draft={draft}
            onChange={setDraft}
            compact
            allowInterdisciplinary={item.source === "custom"}
            showCourseName
            showNote
          />
          {error && <div className="rounded-md bg-brand/10 px-2 py-1 text-[10px] text-brand">{error}</div>}
          <div className="flex gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => { void save(); }}
              disabled={saving}
              className="h-7 flex-1 rounded-md border border-sub/15 bg-sub/10 text-[11px] text-ink transition-colors hover:border-sub/35 disabled:opacity-60"
            >
              {saving ? "保存中" : "保存"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="h-7 flex-1 rounded-md border border-sub/15 bg-card/70 text-[11px] text-sub transition-colors hover:border-sub/35 hover:text-ink disabled:opacity-60"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <Row label="类别">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: style.color }} />
              {item.categoryName} · {item.requirementType}
            </span>
          </Row>
          {isInter && (
            <Row label="经融">
              <span className="text-sub">是 · 计入 {assignmentText}</span>
            </Row>
          )}
          <Row label="学分">
            <span className="tabular-nums">{formatCredits(item.credits)}</span>
          </Row>
          <Row label="学时">
            <span className="tabular-nums text-sub">
              讲 {item.lectureHours ?? 0} / 实 {item.experimentHours ?? 0} / 外 {item.extraHours ?? 0}
            </span>
          </Row>
          <Row label="计划学期">
            <span className="tabular-nums">{plannedText}</span>
          </Row>
          {item.officialTerm !== undefined && item.officialTerm !== null && (
            <Row label="开课学期">
              <span className="tabular-nums">{offeredText}</span>
            </Row>
          )}
          <Row label="先修">
            {item.prerequisiteCourseCode || item.prerequisiteCourseName ? (
              <span style={{ color: style.text }}>
                {item.prerequisiteCourseName ?? item.prerequisiteCourseCode}
              </span>
            ) : (
              <span className="text-sub/60">无</span>
            )}
          </Row>
          <Row label="成绩">
            <span className={item.score == null ? "text-sub/60" : "text-brand tabular-nums"}>{scoreText}</span>
          </Row>
          {item.note && (
            <Row label="备注">
              <span className="text-sub">{item.note}</span>
            </Row>
          )}
          {mode === "trash" && item.deletedAt && (
            <Row label="删除时间">
              <span className="text-sub/70 tabular-nums">{item.deletedAt}</span>
            </Row>
          )}

          {mode === "trash" ? (
            <div className="mt-2 flex gap-1.5 border-t border-sub/10 pt-2">
              <button
                type="button"
                onClick={() => { void onRestore?.(); }}
                className="h-7 flex-1 rounded-md border border-sub/15 bg-card/70 text-[11px] text-sub transition-colors hover:border-sub/35 hover:text-ink"
              >
                恢复
              </button>
              <button
                type="button"
                onClick={() => { void onPermanentDelete?.(); }}
                className="h-7 flex-1 rounded-md border border-sub/15 bg-card/70 text-[11px] text-sub transition-colors hover:border-brand/35 hover:text-brand"
              >
                永久删除
              </button>
            </div>
          ) : editable && onSave ? (
            <div className="mt-2 flex border-t border-sub/10 pt-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-7 flex-1 rounded-md border border-sub/15 bg-card/70 text-[11px] text-sub transition-colors hover:border-sub/35 hover:text-ink"
              >
                编辑
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  return createPortal(card, document.body);
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
  { allowInterdisciplinary }: { allowInterdisciplinary: boolean }
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
    ...(allowInterdisciplinary ? { is_interdisciplinary: isInter ? 1 : 0, assigned_to: draft.assigned_to } : {}),
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-0.5">
      <div className="w-14 shrink-0 text-[10px] text-sub">{label}</div>
      <div className="flex-1 text-ink">{children}</div>
    </div>
  );
}
