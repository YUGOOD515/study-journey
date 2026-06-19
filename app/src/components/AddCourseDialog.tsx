import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { canUseInterdisciplinary } from "../lib/courseOptions";
import type {
  CategoryCode,
  CourseEditDraft,
  CourseNature,
  CreditAssignmentTarget,
  RawCourseSearchResult,
} from "../types";
import { CourseEditFields } from "./CourseEditFields";
import { CustomSelect } from "./CustomSelect";

type StudyStatus = "未修读" | "计划修读" | "正在修读" | "已修读" | "未通过";

type ManualSubmitInput = {
  term_number: number | null;
  course_code?: string | null;
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
};

type RawSubmitInput = {
  sourceType: "section" | "added";
  batchId: number;
  sourceRow: number;
  courseCode: string;
  sectionCode: string | null;
  termNumber: number;
  categoryCode: CategoryCode;
  courseNature: CourseNature;
  isInterdisciplinary: boolean;
  assignedTo: CreditAssignmentTarget;
  credits: number;
  totalHours: number;
  lectureHours: number;
  experimentHours: number;
  extraHours: number;
  studyStatus: StudyStatus;
  score: number | null;
  note?: string | null;
};

interface Props {
  /** null = 添加到“待安排”抽屉。搜索添加必须选择具体学期。 */
  termNumber: number | null;
  onClose: () => void;
  onSubmitManual: (input: ManualSubmitInput) => Promise<void>;
  onSubmitRaw: (input: RawSubmitInput) => Promise<void>;
}

type Mode = "search" | "manual";
type SourceFilter = "all" | "section" | "added";

const SOURCE_OPTIONS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "全部来源" },
  { value: "section", label: "正式开课表" },
  { value: "added", label: "补选新增课" },
];

const STUDY_STATUS_OPTIONS: Array<{ value: StudyStatus; label: string }> = [
  { value: "计划修读", label: "计划修读" },
  { value: "正在修读", label: "正在修读" },
  { value: "已修读", label: "已修读" },
  { value: "未通过", label: "未通过" },
  { value: "未修读", label: "未修读" },
];

const TERM_FILTER_OPTIONS = [
  { value: "", label: "全部学期" },
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `第 ${i + 1} 学期` })),
];

function emptyDraft(termNumber: number | null): CourseEditDraft {
  return {
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
  };
}

function inferDraftFromRaw(raw: RawCourseSearchResult, fallbackTerm: number | null): CourseEditDraft {
  const moduleText = [raw.module2024, raw.module2022, raw.courseAttribute, raw.enrollmentRestriction]
    .filter(Boolean)
    .join(" ");
  const isInter = moduleText.includes("经法管融通");
  const category: CategoryCode = raw.sourceType === "added" || raw.courseCode.startsWith("M188")
    ? "general_education"
    : raw.courseAttribute?.includes("专业")
    ? "professional_education"
    : "general_education";
  const hours = Math.max(0, Math.round(Number(raw.hours ?? 0)));
  return {
    course_name: raw.courseName,
    category_code: category,
    course_nature: "选修",
    is_interdisciplinary: isInter && canUseInterdisciplinary(category) ? 1 : 0,
    assigned_to: "interdisciplinary",
    credits: String(raw.credits ?? 2),
    lecture_hours: String(hours),
    experiment_hours: "0",
    extra_hours: "0",
    planned_term: fallbackTerm ?? raw.termNumber,
    prerequisite_course_code: "",
    score: "",
    note: raw.sourceType === "section" ? "搜索添加：正式开课表" : "搜索添加：补选新增课",
  };
}

function sourceLabel(raw: RawCourseSearchResult): string {
  return raw.sourceType === "section" ? "正式开课表" : "补选新增课";
}

function phaseLabel(phase: RawCourseSearchResult["phase"]): string {
  if (phase === "final") return "预选/正选";
  if (phase === "beginning_add") return "补选";
  return "实际课表";
}

function compactText(parts: Array<string | null | undefined>, separator = " · "): string {
  return parts.map((x) => x?.trim()).filter(Boolean).join(separator);
}

function parseNonNegativeNumber(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label}必须为非负数`);
  return n;
}

export function AddCourseDialog({ termNumber, onClose, onSubmitManual, onSubmitRaw }: Props) {
  const [mode, setMode] = useState<Mode>("search");
  const [manualDraft, setManualDraft] = useState<CourseEditDraft>(() => emptyDraft(termNumber));
  const [manualCode, setManualCode] = useState("");

  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [termFilter, setTermFilter] = useState<number | null>(termNumber);
  const [results, setResults] = useState<RawCourseSearchResult[]>([]);
  const [selected, setSelected] = useState<RawCourseSearchResult | null>(null);
  const [rawDraft, setRawDraft] = useState<CourseEditDraft>(() => emptyDraft(termNumber));
  const [studyStatus, setStudyStatus] = useState<StudyStatus>("计划修读");

  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (termFilter == null && query.trim() === "") {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api.searchRawCourses({ q: query, term: termFilter, source, limit: 60 })
        .then((items) => {
          if (!cancelled) setResults(items);
        })
        .catch((e) => {
          if (!cancelled) setErr(String(e?.message ?? e));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, source, termFilter]);

  useEffect(() => {
    if (!selected) return;
    setRawDraft(inferDraftFromRaw(selected, termNumber));
    setStudyStatus("计划修读");
  }, [selected, termNumber]);

  const manualSubtitle = manualDraft.planned_term == null
    ? "放入待安排抽屉，稍后再拖到学期"
    : `放入第 ${manualDraft.planned_term} 学期`;

  const selectedSummary = useMemo(() => {
    if (!selected) return "先在左侧选择一条课程记录";
    return compactText([
      `第 ${selected.termNumber} 学期`,
      selected.sectionCode ? `课序号 ${selected.sectionCode}` : "无课序号",
      sourceLabel(selected),
      phaseLabel(selected.phase),
    ]);
  }, [selected]);

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const courseName = manualDraft.course_name.trim();
    const normalizedCourseCode = manualCode.trim();
    if (!courseName) {
      setErr("课程名不能为空");
      return;
    }
    if (normalizedCourseCode && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(normalizedCourseCode)) {
      setErr("课程号只能包含英文字母、数字、下划线、短横线和点号，且长度不超过 64");
      return;
    }
    try {
      const credits = parseNonNegativeNumber(manualDraft.credits, "学分");
      const lectureHours = parseNonNegativeNumber(manualDraft.lecture_hours, "讲课学时");
      const experimentHours = parseNonNegativeNumber(manualDraft.experiment_hours, "实践学时");
      const extraHours = parseNonNegativeNumber(manualDraft.extra_hours, "课外学时");
      const score = manualDraft.score.trim() === "" ? null : parseNonNegativeNumber(manualDraft.score, "成绩");
      if (score != null && score > 100) throw new Error("成绩必须为 0-100，或留空");
      const interAllowed = canUseInterdisciplinary(manualDraft.category_code);
      const isInter = interAllowed && manualDraft.is_interdisciplinary === 1;
      setBusy(true);
      await onSubmitManual({
        term_number: manualDraft.planned_term,
        course_code: normalizedCourseCode || null,
        course_name: courseName,
        credits,
        category_code: manualDraft.category_code,
        course_nature: isInter ? "选修" : manualDraft.course_nature,
        lecture_hours: lectureHours,
        experiment_hours: experimentHours,
        extra_hours: extraHours,
        prerequisite_course_code: manualDraft.prerequisite_course_code.trim() || null,
        score,
        note: manualDraft.note.trim() || null,
        is_interdisciplinary: isInter ? 1 : 0,
        assigned_to: manualDraft.assigned_to,
      });
      onClose();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setBusy(false);
    }
  };

  const submitRaw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!selected) {
      setErr("请先选择一条课程记录");
      return;
    }
    if (selected.existsInProgram) {
      setErr("该课程已存在于培养方案中，不能作为自定义课程重复添加");
      return;
    }
    if (selected.existsInCustom) {
      setErr("该课程已存在于自定义课程中，不能重复添加");
      return;
    }
    if (rawDraft.planned_term == null) {
      setErr("搜索添加需要选择具体学期，才能写入学期课表");
      return;
    }
    try {
      const credits = parseNonNegativeNumber(rawDraft.credits, "学分");
      const lectureHours = parseNonNegativeNumber(rawDraft.lecture_hours, "讲课学时");
      const experimentHours = parseNonNegativeNumber(rawDraft.experiment_hours, "实践学时");
      const extraHours = parseNonNegativeNumber(rawDraft.extra_hours, "课外学时");
      const totalHours = lectureHours + experimentHours + extraHours;
      const score = rawDraft.score.trim() === "" ? null : parseNonNegativeNumber(rawDraft.score, "成绩");
      if (score != null && score > 100) throw new Error("成绩必须为 0-100，或留空");
      const interAllowed = canUseInterdisciplinary(rawDraft.category_code);
      const isInter = interAllowed && rawDraft.is_interdisciplinary === 1;
      setBusy(true);
      await onSubmitRaw({
        sourceType: selected.sourceType,
        batchId: selected.batchId,
        sourceRow: selected.sourceRow,
        courseCode: selected.courseCode,
        sectionCode: selected.sectionCode,
        termNumber: rawDraft.planned_term,
        categoryCode: rawDraft.category_code,
        courseNature: isInter ? "选修" : rawDraft.course_nature,
        isInterdisciplinary: isInter,
        assignedTo: rawDraft.assigned_to,
        credits,
        totalHours,
        lectureHours,
        experimentHours,
        extraHours,
        studyStatus,
        score,
        note: rawDraft.note.trim() || null,
      });
      onClose();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setBusy(false);
    }
  };

  return createPortal(
    <div className="motion-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div
        className="motion-panel-in flex w-[920px] max-w-full flex-col overflow-hidden rounded-xl border border-sub/20 bg-card"
        style={{
          height: "min(760px, calc(100vh - 32px))",
          boxShadow:
            "0 18px 54px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 4px 14px rgb(var(--shadow-rgb) / var(--shadow-soft))",
        }}
      >
        <div className="flex items-start justify-between border-b border-sub/10 px-5 py-4">
          <div>
            <h2 className="text-base text-ink">添加计划课程</h2>
            <div className="mt-0.5 text-[11px] text-sub">
              {termNumber == null ? "来自待安排入口" : `来自第 ${termNumber} 学期入口`}；搜索添加会同步写入时间轴与学期课表
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

        <div className="flex gap-2 px-5 pt-4">
          {([
            ["search", "搜索添加"],
            ["manual", "手动添加"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setErr(null);
              }}
              className={
                "rounded-full px-3 py-1.5 text-xs transition-all " +
                (mode === value
                  ? "bg-brand/15 text-ink shadow-sm"
                  : "text-sub hover:bg-sub/10 hover:text-ink")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "search" ? (
          <form onSubmit={submitRaw} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] gap-4 overflow-hidden px-5 py-4 max-md:grid-cols-1">
            <div className="flex min-h-0 flex-col gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-2 max-sm:grid-cols-1">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索课程名称、课程号、课序号、教师"
                  className="h-9 rounded-md border border-sub/25 bg-bg px-3 text-sm text-ink outline-none transition-colors placeholder:text-sub/45 focus:border-brand"
                />
                <CustomSelect
                  value={termFilter == null ? "" : String(termFilter)}
                  onChange={(value) => setTermFilter(value === "" ? null : Number(value))}
                  options={TERM_FILTER_OPTIONS}
                  className="h-9 rounded-md border border-sub/25 bg-bg px-3 text-sm text-ink outline-none transition-colors focus:border-brand"
                  ariaLabel="选择搜索学期"
                />
                <CustomSelect
                  value={source}
                  onChange={(value) => setSource(value as SourceFilter)}
                  options={SOURCE_OPTIONS}
                  className="h-9 rounded-md border border-sub/25 bg-bg px-3 text-sm text-ink outline-none transition-colors focus:border-brand"
                  ariaLabel="选择搜索来源"
                />
              </div>
              <div className="text-[11px] text-sub">
                {searching ? "搜索中…" : `共 ${results.length} 条结果`}；正式开课表可用于预选/正选/补选，补选新增课仅用于补选来源。
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {results.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-sub/20 bg-sub/5 px-3 py-8 text-center text-xs text-sub">
                    输入关键词，或调整学期与来源筛选。
                  </div>
                ) : (
                  results.map((item) => {
                    const active = selected?.sourceType === item.sourceType && selected.batchId === item.batchId && selected.sourceRow === item.sourceRow && selected.courseCode === item.courseCode && selected.sectionCode === item.sectionCode;
                    const disabled = item.existsInProgram || item.existsInCustom;
                    return (
                      <button
                        key={`${item.sourceType}-${item.batchId}-${item.sourceRow}-${item.courseCode}-${item.sectionCode ?? ""}`}
                        type="button"
                        onClick={() => setSelected(item)}
                        className={
                          "w-full rounded-lg border px-3 py-2 text-left transition-all " +
                          (active
                            ? "border-brand/55 bg-brand/10 shadow-sm"
                            : "border-sub/15 bg-bg/65 hover:-translate-y-0.5 hover:border-sub/35 hover:bg-bg")
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-ink">{item.courseName}</div>
                            <div className="mt-0.5 text-[11px] text-sub">
                              {compactText([
                                item.courseCode,
                                item.sectionCode ? `课序号 ${item.sectionCode}` : null,
                                item.credits != null ? `${item.credits} 学分` : null,
                                item.teacher,
                              ])}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-full bg-sub/10 px-2 py-0.5 text-[10px] text-sub">{sourceLabel(item)}</span>
                            {disabled && (
                              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-500">
                                {item.existsInProgram ? "已在培养方案" : "已添加"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-sub/85">
                          {compactText([
                            `第 ${item.termNumber} 学期`,
                            item.teachingWeeks,
                            item.classTime,
                            compactText([item.campus, item.classroom], " "),
                          ])}
                        </div>
                        <div className="mt-1 text-[10px] text-sub/65">
                          {compactText([phaseLabel(item.phase), item.department, item.module2024 ?? item.courseAttribute])}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col rounded-xl border border-sub/15 bg-bg/55 p-3">
              <div className="mb-3 shrink-0">
                <div className="text-sm text-ink">添加预览</div>
                <div className="mt-0.5 text-[11px] text-sub">{selectedSummary}</div>
              </div>
              {selected ? (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="space-y-3">
                    <div className="rounded-lg border border-sub/10 bg-card px-3 py-2">
                    <div className="text-sm text-ink">{selected.courseName}</div>
                    <div className="mt-1 text-[11px] text-sub">
                      {compactText([
                        selected.courseCode,
                        selected.sectionCode ? `课序号 ${selected.sectionCode}` : null,
                        selected.teacher,
                      ])}
                    </div>
                    {(selected.existsInProgram || selected.existsInCustom) && (
                      <div className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-500">
                        {selected.existsInProgram
                          ? "该课程已在培养方案中。按当前规则 C，不能作为自定义课程重复添加。"
                          : "该课程已存在于自定义课程中。"}
                      </div>
                    )}
                  </div>
                    <Field label="状态">
                      <CustomSelect
                        value={studyStatus}
                        onChange={(value) => setStudyStatus(value as StudyStatus)}
                        options={STUDY_STATUS_OPTIONS}
                        className="h-8 w-full rounded-md border border-sub/20 bg-card px-2 text-xs text-ink outline-none transition-colors focus:border-brand/45"
                        compact
                        ariaLabel="选择修读状态"
                      />
                    </Field>
                    <CourseEditFields
                      draft={rawDraft}
                      onChange={setRawDraft}
                      compact
                      allowInterdisciplinary
                      showCourseName={false}
                      showNote
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-sub/20 px-3 py-12 text-center text-xs text-sub">
                  选择一条结果后，可调整类别、学分、状态和经法管融通归属。
                </div>
              )}
              <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
                <div className="min-h-[16px] text-[11px] text-red-500">{err}</div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={onClose} disabled={busy} className="rounded-md px-3 py-1.5 text-xs text-sub transition-colors hover:bg-sub/10 hover:text-ink disabled:opacity-50">取消</button>
                  <button type="submit" disabled={busy || !selected || selected.existsInProgram || selected.existsInCustom} className="rounded-md px-3 py-1.5 text-xs text-white disabled:opacity-50" style={{ backgroundColor: "rgb(var(--brand) / 1)" }}>
                    {busy ? "保存中…" : "添加课程"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={submitManual} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mx-auto max-w-[540px] space-y-3">
              <div className="rounded-lg border border-sub/10 bg-sub/5 px-3 py-2 text-[11px] text-sub">
                {manualSubtitle}，用于数据库中找不到的课程、培养方案外课程或占位课程。
              </div>
              <label className="block">
                <div className="mb-1 text-[11px] text-sub">课程号</div>
                <input
                  value={manualCode}
                  onChange={(event) => setManualCode(event.currentTarget.value)}
                  placeholder="不填则自动生成；例如 B0480240"
                  className="w-full rounded-md border border-sub/20 bg-bg px-2.5 py-2 text-xs text-ink outline-none transition-colors placeholder:text-sub/45 focus:border-brand"
                />
              </label>
              <CourseEditFields
                draft={manualDraft}
                onChange={setManualDraft}
                compact={false}
                allowInterdisciplinary
                showCourseName
                showNote
              />
              <div className="flex items-center justify-between pt-2">
                <div className="min-h-[16px] text-[11px] text-red-500">{err}</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={onClose} disabled={busy} className="rounded-md px-3 py-1.5 text-xs text-sub transition-colors hover:bg-sub/10 hover:text-ink disabled:opacity-50">取消</button>
                  <button type="submit" disabled={busy} className="rounded-md px-3 py-1.5 text-xs text-white disabled:opacity-50" style={{ backgroundColor: "rgb(var(--brand) / 1)" }}>
                    {busy ? "保存中…" : "添加课程"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-sub">{label}</span>
      {children}
    </label>
  );
}
