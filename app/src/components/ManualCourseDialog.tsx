import type React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CategoryCode, CourseEditDraft, CourseNature, CreditAssignmentTarget } from "../types";
import { CourseEditFields } from "./CourseEditFields";
import { canUseInterdisciplinary } from "../lib/courseOptions";

interface Props {
  /** null = 添加到"待安排"抽屉 */
  termNumber: number | null;
  onClose: () => void;
  onSubmit: (input: {
    /** null = 添加到"待安排"抽屉 */
    term_number: number | null;
    course_name: string;
    credits: number;
    category_code: CategoryCode;
    course_nature: CourseNature;
    lecture_hours?: number;
    experiment_hours?: number;
    extra_hours?: number;
    prerequisite_course_code?: string | null;
    score?: number | null;
    note?: string | null;
    is_interdisciplinary?: 0 | 1;
    assigned_to?: CreditAssignmentTarget;
  }) => Promise<void>;
}

export function ManualCourseDialog({
  termNumber,
  onClose,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<CourseEditDraft>(() => ({
    course_name: "",
    category_code: "general_education",
    course_nature: "选修",
    is_interdisciplinary: 0,
    assigned_to: "interdisciplinary",
    credits: "2",
    lecture_hours: "0",
    experiment_hours: "0",
    extra_hours: "0",
    planned_term: termNumber,
    prerequisite_course_code: "",
    score: "",
    note: "我的计划",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    const courseName = draft.course_name.trim();
    const credits = Number(draft.credits);
    const lectureHours = Number(draft.lecture_hours);
    const experimentHours = Number(draft.experiment_hours);
    const extraHours = Number(draft.extra_hours);
    const score = draft.score.trim() === "" ? null : Number(draft.score);
    const interAllowed = canUseInterdisciplinary(draft.category_code);
    const isInter = interAllowed && draft.is_interdisciplinary === 1;

    if (!courseName) {
      setErr("课程名不能为空");
      return;
    }
    for (const [label, value] of [
      ["学分", credits],
      ["讲课学时", lectureHours],
      ["实践学时", experimentHours],
      ["课外学时", extraHours],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        setErr(`${label}必须为非负数`);
        return;
      }
    }
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      setErr("成绩必须为 0-100，或留空");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        term_number: draft.planned_term,
        course_name: courseName,
        credits,
        category_code: draft.category_code,
        course_nature: isInter ? "选修" : draft.course_nature,
        lecture_hours: lectureHours,
        experiment_hours: experimentHours,
        extra_hours: extraHours,
        prerequisite_course_code: draft.prerequisite_course_code.trim() || null,
        score,
        note: draft.note.trim() || null,
        is_interdisciplinary: isInter ? 1 : 0,
        assigned_to: draft.assigned_to,
      });
      onClose();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div
        className="max-h-[calc(100vh-32px)] w-[520px] max-w-full overflow-y-auto rounded-xl border border-sub/20 bg-card p-5"
        style={{
          boxShadow:
            "0 18px 54px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 4px 14px rgb(var(--shadow-rgb) / var(--shadow-soft))",
        }}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h2 className="text-base text-ink">添加计划课程</h2>
            <div className="mt-0.5 text-[11px] text-sub">
              {draft.planned_term == null
                ? "放入待安排抽屉，稍后再拖到学期"
                : `放入第 ${draft.planned_term} 学期`}
              ，用于公选课、跨专业课、培养方案外课程
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-md text-sub transition-colors hover:bg-sub/10 hover:text-ink"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <CourseEditFields
            draft={draft}
            onChange={setDraft}
            compact={false}
            allowInterdisciplinary
            showCourseName
            showNote
          />

          <div className="flex items-center justify-between pt-2">
            <div className="min-h-[16px] text-[11px] text-red-500">{err}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-xs text-sub transition-colors hover:bg-sub/10 hover:text-ink disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-xs text-white disabled:opacity-50"
                style={{ backgroundColor: "rgb(var(--brand) / 1)" }}
              >
                {busy ? "保存中…" : "添加课程"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
