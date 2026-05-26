import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import type { CategoryCode } from "../types";

/**
 * 板块 + 是否经法管融通 的组合选项。
 * 仅 通识 / 大类平台 允许标记为经法管融通；
 * 标记后会被纳入「学分流向」桑基图，可在「大类·经法管融通」与「自身板块·选修」之间切换归属。
 */
interface CategoryChoice {
  code: CategoryCode;
  isInterdisciplinary: 0 | 1;
  label: string;
  shortLabel: string;
}

const CATEGORY_CHOICES: CategoryChoice[] = [
  { code: "general_education",      isInterdisciplinary: 0, label: "通识教育",          shortLabel: "通识" },
  { code: "general_education",      isInterdisciplinary: 1, label: "通识·经法管融通",  shortLabel: "通识·经融" },
  { code: "major_platform",         isInterdisciplinary: 0, label: "大类平台",          shortLabel: "大类" },
  { code: "major_platform",         isInterdisciplinary: 1, label: "大类·经法管融通",  shortLabel: "大类·经融" },
  { code: "professional_education", isInterdisciplinary: 0, label: "专业教育",          shortLabel: "专业" },
  { code: "quality_education",      isInterdisciplinary: 0, label: "素质教育",          shortLabel: "素质" },
  { code: "practice_education",     isInterdisciplinary: 0, label: "实践教育",          shortLabel: "实践" },
];

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
    course_nature: "必修" | "选修";
    note?: string | null;
    is_interdisciplinary?: 0 | 1;
  }) => Promise<void>;
}

export function ManualCourseDialog({
  termNumber,
  onClose,
  onSubmit,
}: Props) {
  const [choiceIdx, setChoiceIdx] = useState(0); // 默认：通识教育
  const [courseName, setCourseName] = useState("");
  const [credits, setCredits] = useState("2");
  const [nature, setNature] = useState<"必修" | "选修">("选修");
  const [note, setNote] = useState("我的计划");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const choice = CATEGORY_CHOICES[choiceIdx];

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

    const c = Number(credits);
    if (!courseName.trim()) {
      setErr("课程名不能为空");
      return;
    }
    if (!Number.isFinite(c) || c < 0) {
      setErr("学分必须为非负数");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        term_number: termNumber,
        course_name: courseName.trim(),
        credits: c,
        category_code: choice.code,
        course_nature: nature,
        note: note.trim() || null,
        is_interdisciplinary: choice.isInterdisciplinary,
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
        className="w-[440px] max-w-full bg-card border border-sub/20 rounded-xl p-5"
        style={{
          boxShadow:
            "0 18px 54px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 4px 14px rgb(var(--shadow-rgb) / var(--shadow-soft))",
        }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-base text-ink">添加计划课程</h2>
            <div className="text-[11px] text-sub mt-0.5">
              {termNumber == null
                ? "放入待安排抽屉，稍后再拖到学期"
                : `放入第 ${termNumber} 学期`}
              ，用于公选课、培养方案外课程
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
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
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
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-bg border border-sub/25 text-sm text-ink tabular-nums focus:outline-none focus:border-brand"
              />
            </label>
            <div className="rounded-md border border-sub/15 bg-sub/5 px-3 py-2">
              <div className="text-[11px] text-sub mb-1">状态</div>
              <div className="text-sm text-ink">计划中</div>
            </div>
          </div>

          <div>
            <div className="text-[11px] text-sub mb-1">
              归属板块{" "}
              <span className="text-sub/60">
                · 选「·经融」会进入桑基图，可在大类经融桶与原板块选修桶间切换
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {CATEGORY_CHOICES.map((c, i) => {
                const s = CATEGORY_STYLE[c.code];
                const active = i === choiceIdx;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setChoiceIdx(i)}
                    className={
                      "inline-flex items-center gap-1 h-8 px-2.5 rounded-md border text-[10px] transition-colors " +
                      (active
                        ? "border-sub/50 bg-sub/10 text-ink"
                        : "border-sub/15 text-sub hover:text-ink hover:bg-sub/5")
                    }
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    {c.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-sub mb-1">课程性质</div>
            <div className="grid grid-cols-2 gap-1">
              {(["选修", "必修"] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNature(n)}
                  className={
                    "h-8 rounded-md border text-xs transition-colors " +
                    (nature === n
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-sub/15 text-sub hover:text-ink hover:bg-sub/5")
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <div className="text-[11px] text-sub mb-1">备注（可选）</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
