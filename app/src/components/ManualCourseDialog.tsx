import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import type { CategoryCode } from "../types";

const CATEGORY_OPTIONS: CategoryCode[] = [
  "general_education",
  "major_platform",
  "professional_education",
  "quality_education",
  "practice_education",
];

interface ManualCourseForm {
  course_name: string;
  credits: string;
  category_code: CategoryCode;
  course_nature: "必修" | "选修";
  score: string;
  note: string;
}

interface Props {
  termNumber: number;
  onClose: () => void;
  onSubmit: (input: {
    term_number: number;
    course_name: string;
    credits: number;
    category_code: CategoryCode;
    course_nature: "必修" | "选修";
    score?: number | null;
    note?: string | null;
  }) => Promise<void>;
}

export function ManualCourseDialog({
  termNumber,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<ManualCourseForm>({
    course_name: "",
    credits: "2",
    category_code: "general_education",
    course_nature: "选修",
    score: "",
    note: "手动添加",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof ManualCourseForm>(
    key: K,
    value: ManualCourseForm[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    const credits = Number(form.credits);
    const score = form.score.trim() === "" ? null : Number(form.score);

    if (!form.course_name.trim()) {
      setErr("课程名不能为空");
      return;
    }
    if (!Number.isFinite(credits) || credits < 0) {
      setErr("学分必须为非负数");
      return;
    }
    if (score != null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      setErr("分数需在 0–100 之间");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        term_number: termNumber,
        course_name: form.course_name.trim(),
        credits,
        category_code: form.category_code,
        course_nature: form.course_nature,
        score,
        note: form.note.trim() || null,
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
        className="w-[420px] max-w-full bg-card border border-sub/20 rounded-xl p-5"
        style={{
          boxShadow:
            "0 18px 54px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 4px 14px rgb(var(--shadow-rgb) / var(--shadow-soft))",
        }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-base text-ink">添加手动课程</h2>
            <div className="text-[11px] text-sub mt-0.5">
              计入第 {termNumber} 学期，可用于公选课、培养方案外课程
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md text-sub hover:text-ink hover:bg-sub/10 transition-colors"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <div className="text-[11px] text-sub mb-1">课程名</div>
            <input
              autoFocus
              value={form.course_name}
              onChange={(e) => set("course_name", e.target.value)}
              placeholder="例如：美学导论"
              className="w-full px-3 py-2 rounded-md bg-bg border border-sub/25 text-sm text-ink focus:outline-none focus:border-brand"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-[11px] text-sub mb-1">学分</div>
              <input
                type="number"
                min={0}
                step="0.5"
                value={form.credits}
                onChange={(e) => set("credits", e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-bg border border-sub/25 text-sm text-ink tabular-nums focus:outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-sub mb-1">成绩（可选）</div>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={form.score}
                onChange={(e) => set("score", e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 rounded-md bg-bg border border-sub/25 text-sm text-ink tabular-nums focus:outline-none focus:border-brand"
              />
            </label>
          </div>

          <div>
            <div className="text-[11px] text-sub mb-1">归属板块</div>
            <div className="grid grid-cols-5 gap-1">
              {CATEGORY_OPTIONS.map((code) => {
                const s = CATEGORY_STYLE[code];
                const active = form.category_code === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => set("category_code", code)}
                    className={
                      "h-9 rounded-md border text-[10px] transition-colors " +
                      (active
                        ? "border-sub/45 bg-sub/10 text-ink"
                        : "border-sub/15 text-sub hover:text-ink hover:bg-sub/5")
                    }
                    title={s.name}
                  >
                    <span
                      className="mx-auto mb-0.5 block w-2 h-2 rounded-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name.replace("教育", "")}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-sub mb-1">课程性质</div>
            <div className="grid grid-cols-2 gap-1">
              {(["选修", "必修"] as const).map((nature) => (
                <button
                  key={nature}
                  type="button"
                  onClick={() => set("course_nature", nature)}
                  className={
                    "h-8 rounded-md border text-xs transition-colors " +
                    (form.course_nature === nature
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-sub/15 text-sub hover:text-ink hover:bg-sub/5")
                  }
                >
                  {nature}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <div className="text-[11px] text-sub mb-1">备注（可选）</div>
            <input
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="例如：通选 / 跨专业 / 线下选修"
              className="w-full px-3 py-2 rounded-md bg-bg border border-sub/25 text-sm text-ink focus:outline-none focus:border-brand"
            />
          </label>

          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-red-500 min-h-[16px]">{err}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-xs text-sub hover:text-ink hover:bg-sub/10 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-xs text-white disabled:opacity-50"
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
