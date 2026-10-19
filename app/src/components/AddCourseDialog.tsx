import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Check, PenLine, Search } from "lucide-react";
import { api } from "../lib/api";
import { canUseInterdisciplinary } from "../lib/courseOptions";
import { formatCredits } from "../lib/credits";
import type {
  CategoryCode,
  CourseEditDraft,
  CourseNature,
  CreditAssignmentTarget,
  RawCourseSearchResult,
} from "../types";
import { CourseEditFields } from "./CourseEditFields";
import { CustomSelect } from "./CustomSelect";
import { Badge, Button, Dialog, EmptyState, inputClass, Segmented } from "./ui";
import { cn } from "../lib/cn";
import { useCoarsePointer } from "../hooks/useMediaQuery";

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
  courseName: string;
  sectionCode: string | null;
  existsInProgram: boolean;
  existsInCustom: boolean;
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

function inferDraftFromRaw(
  raw: RawCourseSearchResult,
  fallbackTerm: number | null,
): CourseEditDraft {
  const moduleText = [
    raw.module2024,
    raw.module2022,
    raw.courseAttribute,
    raw.enrollmentRestriction,
  ]
    .filter(Boolean)
    .join(" ");
  const isInter = moduleText.includes("经法管融通");
  const category: CategoryCode =
    raw.sourceType === "added" || raw.courseCode.startsWith("M188")
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
  return parts
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(separator);
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

  const isTouch = useCoarsePointer();

  useEffect(() => {
    if (termFilter == null && query.trim() === "") {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .searchRawCourses({ q: query, term: termFilter, source, limit: 60 })
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

  const manualSubtitle =
    manualDraft.planned_term == null
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
      const score =
        manualDraft.score.trim() === "" ? null : parseNonNegativeNumber(manualDraft.score, "成绩");
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
      const score =
        rawDraft.score.trim() === "" ? null : parseNonNegativeNumber(rawDraft.score, "成绩");
      if (score != null && score > 100) throw new Error("成绩必须为 0-100，或留空");
      const interAllowed = canUseInterdisciplinary(rawDraft.category_code);
      const isInter = interAllowed && rawDraft.is_interdisciplinary === 1;
      setBusy(true);
      await onSubmitRaw({
        sourceType: selected.sourceType,
        batchId: selected.batchId,
        sourceRow: selected.sourceRow,
        courseCode: selected.courseCode,
        courseName: selected.courseName,
        sectionCode: selected.sectionCode,
        existsInProgram: selected.existsInProgram,
        existsInCustom: selected.existsInCustom,
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

  const submitLabel = selected?.existsInCustom
    ? "更新课程"
    : selected?.existsInProgram
      ? "覆盖并添加"
      : "添加课程";

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      size="xl"
      bare
      dismissible={!busy}
      title="添加课程"
      description={`${termNumber == null ? "添加到待安排" : `添加到第 ${termNumber} 学期`} · 搜索添加会同步写入时间轴与学期课表`}
      footer={
        <>
          <div className="mr-auto min-w-0 truncate text-[11px] text-danger">{err}</div>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            type="submit"
            form={mode === "search" ? "add-course-search" : "add-course-manual"}
            variant="primary"
            loading={busy}
            disabled={mode === "search" && !selected}
          >
            {mode === "search" ? submitLabel : "添加课程"}
          </Button>
        </>
      }
    >
      <div className="px-4 pt-3 sm:px-5">
        <Segmented
          ariaLabel="添加方式"
          size="sm"
          value={mode}
          onChange={(value) => {
            setMode(value);
            setErr(null);
          }}
          options={[
            { value: "search", label: "搜索添加", icon: <Search size={13} /> },
            { value: "manual", label: "手动添加", icon: <PenLine size={13} /> },
          ]}
        />
      </div>

      {mode === "search" ? (
        <form
          id="add-course-search"
          onSubmit={submitRaw}
          className="grid gap-4 px-4 py-3 sm:px-5 md:h-[min(600px,calc(100dvh-260px))] md:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] md:overflow-hidden"
        >
          <div className="flex min-h-0 flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_116px_116px]">
              <div className="relative col-span-2 sm:col-span-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="课程名称、课程号、课序号、教师"
                  aria-label="搜索课程"
                  className={inputClass + " h-9 pl-8 text-[13px]"}
                  autoFocus={!isTouch}
                />
              </div>
              <CustomSelect
                value={termFilter == null ? "" : String(termFilter)}
                onChange={(value) => setTermFilter(value === "" ? null : Number(value))}
                options={TERM_FILTER_OPTIONS}
                className="h-9"
                ariaLabel="选择搜索学期"
              />
              <CustomSelect
                value={source}
                onChange={(value) => setSource(value as SourceFilter)}
                options={SOURCE_OPTIONS}
                className="h-9"
                ariaLabel="选择搜索来源"
              />
            </div>
            <div className="text-[11px] text-sub">
              {searching ? "搜索中…" : `共 ${results.length} 条结果`} ·
              正式开课表可用于预选/正选/补选，补选新增课仅用于补选来源
            </div>
            <div className="max-h-[42dvh] min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 md:max-h-none">
              {results.length === 0 ? (
                <EmptyState
                  icon={<Search size={22} strokeWidth={1.5} />}
                  title={searching ? "搜索中…" : "没有结果"}
                  description="输入关键词，或调整学期与来源筛选。"
                  className="rounded-lg border border-dashed border-sub/20"
                />
              ) : (
                results.map((item) => {
                  const active =
                    selected?.sourceType === item.sourceType &&
                    selected.batchId === item.batchId &&
                    selected.sourceRow === item.sourceRow &&
                    selected.courseCode === item.courseCode &&
                    selected.sectionCode === item.sectionCode;
                  const hasPlanWarning = item.existsInProgram || item.existsInCustom;
                  return (
                    <button
                      key={`${item.sourceType}-${item.batchId}-${item.sourceRow}-${item.courseCode}-${item.sectionCode ?? ""}`}
                      type="button"
                      onClick={() => setSelected(item)}
                      aria-pressed={active}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-brand/55 bg-brand/[0.07]"
                          : "border-sub/15 bg-card hover:border-sub/35 hover:bg-sub/[0.03]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate text-[13px] text-ink">
                            {active && <Check size={13} className="shrink-0 text-brand" />}
                            {item.courseName}
                          </div>
                          <div className="num mt-0.5 text-[11px] text-sub">
                            {compactText([
                              item.courseCode,
                              item.sectionCode ? `课序号 ${item.sectionCode}` : null,
                              item.credits != null ? `${formatCredits(item.credits)} 学分` : null,
                              item.teacher,
                            ])}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge>{sourceLabel(item)}</Badge>
                          {hasPlanWarning && (
                            <Badge tone="brand">
                              {item.existsInCustom ? "已在我的计划" : "会匹配官方占位"}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-sub">
                        {compactText([
                          `第 ${item.termNumber} 学期`,
                          item.teachingWeeks,
                          item.classTime,
                          compactText([item.campus, item.classroom], " "),
                        ])}
                      </div>
                      <div className="mt-0.5 text-[10px] text-faint">
                        {compactText([
                          phaseLabel(item.phase),
                          item.department,
                          item.module2024 ?? item.courseAttribute,
                        ])}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-xl border border-sub/15 bg-bg/60 p-3">
            <div className="mb-3 shrink-0">
              <div className="text-[13px] text-ink">添加预览</div>
              <div className="mt-0.5 text-[11px] text-sub">{selectedSummary}</div>
            </div>
            {selected ? (
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-3">
                  <div className="rounded-lg border border-sub/10 bg-card px-3 py-2">
                    <div className="text-[13px] text-ink">{selected.courseName}</div>
                    <div className="num mt-1 text-[11px] text-sub">
                      {compactText([
                        selected.courseCode,
                        selected.sectionCode ? `课序号 ${selected.sectionCode}` : null,
                        selected.teacher,
                      ])}
                    </div>
                    {(selected.existsInProgram || selected.existsInCustom) && (
                      <div className="mt-2 rounded-md bg-brand/10 px-2 py-1 text-[11px] text-brand">
                        {selected.existsInCustom
                          ? "该课程已在我的计划中；继续添加会用当前课表记录更新它。"
                          : "该课程匹配官方培养计划；继续添加会覆盖我的计划中的官方占位课程。"}
                      </div>
                    )}
                  </div>
                  <Field label="状态">
                    <CustomSelect
                      value={studyStatus}
                      onChange={(value) => setStudyStatus(value as StudyStatus)}
                      options={STUDY_STATUS_OPTIONS}
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
              <div className="flex min-h-[120px] flex-1 items-center justify-center rounded-lg border border-dashed border-sub/20 px-3 py-8 text-center text-[11px] text-sub">
                选择一条结果后，可调整类别、学分、状态和经法管融通归属。
              </div>
            )}
          </div>
        </form>
      ) : (
        <form id="add-course-manual" onSubmit={submitManual} className="px-4 py-3 sm:px-5">
          <div className="mx-auto max-w-[560px] space-y-3">
            <div className="rounded-lg border border-sub/10 bg-sub/5 px-3 py-2 text-[11px] text-sub">
              {manualSubtitle}，用于数据库中找不到的课程、培养方案外课程或占位课程。
            </div>
            <Field label="课程号">
              <input
                value={manualCode}
                onChange={(event) => setManualCode(event.currentTarget.value)}
                placeholder="不填则自动生成；例如 B0480240"
                className={inputClass}
              />
            </Field>
            <CourseEditFields
              draft={manualDraft}
              onChange={setManualDraft}
              compact={false}
              allowInterdisciplinary
              showCourseName
              showNote
            />
          </div>
        </form>
      )}
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-sub">{label}</span>
      {children}
    </label>
  );
}
