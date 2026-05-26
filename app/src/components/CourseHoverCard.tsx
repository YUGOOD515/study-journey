import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CategoryCode, CourseEditDraft, CourseNature, CreditAssignmentTarget, PlanCoursePatch } from "../types";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { assignmentLabel, canUseInterdisciplinary, categoryNameOf } from "../lib/courseOptions";
import { parseOfferedTerm } from "../lib/offeredTerm";
import { CourseEditFields } from "./CourseEditFields";

export interface CourseHoverInfo {
  source: "program" | "custom";
  id?: number | null;
  course_code: string | null;
  course_name: string;
  credits: number;
  lecture_hours?: number | null;
  experiment_hours?: number | null;
  extra_hours?: number | null;
  prerequisite_course_code?: string | null;
  prerequisite_course_name?: string | null;
  category_code: CategoryCode;
  category_name: string;
  course_nature: CourseNature;
  offered_term?: string | null;
  planned_term?: number | null;
  score?: number | null;
  note?: string | null;
  is_interdisciplinary?: number | null;
  assigned_to?: CreditAssignmentTarget | null;
  credit_count_to?: string | null;
  deleted_at?: string | null;
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
  const style = CATEGORY_STYLE[item.category_code] ?? CATEGORY_STYLE.general_education;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CourseEditDraft>(() => initialDraft(item));
  const [adjustedTop, setAdjustedTop] = useState(position.top);

  useEffect(() => {
    if (!editing) setDraft(initialDraft(item));
  }, [
    editing,
    item.id,
    item.course_code,
    item.course_name,
    item.credits,
    item.lecture_hours,
    item.experiment_hours,
    item.extra_hours,
    item.planned_term,
    item.prerequisite_course_code,
    item.score,
    item.note,
    item.category_code,
    item.course_nature,
    item.is_interdisciplinary,
    item.assigned_to,
    item.credit_count_to,
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
  }, [editing, draft, item.course_code, item.course_name, mode, popoverRef, position.top]);

  const offeredText = useMemo(() => formatOfferedTerm(item.offered_term), [item.offered_term]);
  const plannedText = item.planned_term == null ? "待安排 / 未设置" : `第 ${item.planned_term} 学期`;
  const scoreText = item.score == null ? "未填写" : String(item.score);
  const isInter = Number(item.is_interdisciplinary ?? 0) === 1 || Boolean(item.credit_count_to);
  const assignmentText = isInter ? assignmentLabel(item.assigned_to) : null;

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
          {editing ? "编辑课程" : item.course_name}
        </div>
        <div className="shrink-0 text-[10px] text-sub tabular-nums">
          {item.course_code ?? "自定义"}
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
              {item.category_name} · {item.course_nature}
            </span>
          </Row>
          {isInter && (
            <Row label="经融">
              <span className="text-sub">是 · 计入 {assignmentText}</span>
            </Row>
          )}
          <Row label="学分">
            <span className="tabular-nums">{item.credits}</span>
          </Row>
          <Row label="学时">
            <span className="tabular-nums text-sub">
              讲 {item.lecture_hours ?? 0} / 实 {item.experiment_hours ?? 0} / 外 {item.extra_hours ?? 0}
            </span>
          </Row>
          <Row label="计划学期">
            <span className="tabular-nums">{plannedText}</span>
          </Row>
          {item.offered_term !== undefined && item.offered_term !== null && (
            <Row label="开课学期">
              <span className="tabular-nums">{offeredText}</span>
            </Row>
          )}
          <Row label="先修">
            {item.prerequisite_course_code || item.prerequisite_course_name ? (
              <span style={{ color: style.text }}>
                {item.prerequisite_course_name ?? item.prerequisite_course_code}
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
          {mode === "trash" && item.deleted_at && (
            <Row label="删除时间">
              <span className="text-sub/70 tabular-nums">{item.deleted_at}</span>
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
  const isInter = Number(item.is_interdisciplinary ?? 0) === 1 || Boolean(item.credit_count_to);
  return {
    course_name: item.course_name,
    category_code: item.category_code,
    course_nature: isInter ? "选修" : item.course_nature,
    is_interdisciplinary: isInter ? 1 : 0,
    assigned_to: item.assigned_to ?? "interdisciplinary",
    credits: String(item.credits ?? 0),
    lecture_hours: String(item.lecture_hours ?? 0),
    experiment_hours: String(item.experiment_hours ?? 0),
    extra_hours: String(item.extra_hours ?? 0),
    planned_term: item.planned_term ?? null,
    prerequisite_course_code: item.prerequisite_course_code ?? "",
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
