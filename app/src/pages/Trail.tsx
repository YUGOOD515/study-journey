import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { formatCredits, roundCredits } from "../lib/credits";
import {
  buildAssignmentMap,
  bundleByCategory,
  computeRequirementRows,
  type CategoryBundle,
  type CreditAssignmentMap,
  type EarnedCourse,
  type PlannedCourse,
  type RequirementRow,
} from "../lib/progress";
import { TERM_LABEL } from "../lib/offeredTerm";
import { ProgressBar } from "../components/ProgressBar";
import { InterdisciplinaryFlow, type FlowItem } from "../components/InterdisciplinaryFlow";
import type {
  CourseWithCategory,
  CreditAssignment,
  PersonalPlanItem,
  ProgramRequirement,
  SemesterCourse,
} from "../types";

export default function Trail() {
  const [courses, setCourses] = useState<CourseWithCategory[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
  const [done, setDone] = useState<SemesterCourse[]>([]);
  const [personalPlan, setPersonalPlan] = useState<PersonalPlanItem[]>([]);
  const [assignments, setAssignments] = useState<CreditAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      api.coursesWithCategory(),
      api.programRequirements(),
      api.semesterCourses(),
      api.personalPlan(),
      api.creditAssignments(),
    ])
      .then(([c, r, d, p, a]) => {
        setCourses(c);
        setReqs(r);
        setDone(d);
        setPersonalPlan(p);
        setAssignments(a);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const refetchTrailData = useCallback(async () => {
    const [d, p, a] = await Promise.all([
      api.semesterCourses(),
      api.personalPlan(),
      api.creditAssignments(),
    ]);
    setDone(d);
    setPersonalPlan(p);
    setAssignments(a);
  }, []);

  const assignmentMap: CreditAssignmentMap = useMemo(
    () => buildAssignmentMap(assignments),
    [assignments]
  );

  const bundles = useMemo(
    () =>
      bundleByCategory(
        computeRequirementRows(reqs, courses, done, personalPlan, assignmentMap)
      ),
    [reqs, courses, done, personalPlan, assignmentMap]
  );

  const overall = useMemo(() => {
    const required = bundles.reduce((s, b) => s + b.totalRequired, 0);
    const earned = bundles.reduce((s, b) => s + b.totalEarned, 0);
    const planned = bundles.reduce((s, b) => s + b.totalPlanned, 0);
    return {
      required: roundCredits(required),
      earned: roundCredits(earned),
      planned: roundCredits(planned),
    };
  }, [bundles]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 经法管融通 流向图 items —— 三种来源合一
  // 注意：所有 hooks 必须在早 return 之前调用，否则违反 Rules of Hooks
  const flowItems: FlowItem[] = useMemo(() => {
    const list: FlowItem[] = [];

    // 1) 培养方案内经法管融通课
    const earnedOfficialCodes = new Set<string>();
    for (const r of done) {
      if (r.source === "official" && r.course_code && r.score != null) {
        earnedOfficialCodes.add(r.course_code);
      }
    }
    for (const c of courses) {
      if (c.course_category?.includes("经法管融通")) {
        list.push({
          key: `official:${c.course_code}`,
          courseName: c.course_name,
          credits: c.credits,
          categoryCode: c.category_code,
          isEarned: earnedOfficialCodes.has(c.course_code),
          assignment: assignmentMap.get(c.course_code) ?? "interdisciplinary",
        });
      }
    }

    // 2) 手动已修课带经法管融通旗标
    for (const r of done) {
      if (
        r.source === "manual" &&
        r.is_interdisciplinary === 1 &&
        r.category_code &&
        r.id != null
      ) {
        list.push({
          key: `record:${r.id}`,
          courseName: r.course_name,
          credits: r.credits,
          categoryCode: r.category_code,
          isEarned: r.score != null,
          assignment: (r.assigned_to ?? "interdisciplinary") as
            | "interdisciplinary"
            | "elective",
        });
      }
    }

    // 3) 计划课带经法管融通旗标
    for (const p of personalPlan) {
      if (p.item_type === "manual" && p.is_interdisciplinary === 1) {
        list.push({
          key: `plan:${p.id}`,
          courseName: p.course_name,
          credits: p.credits,
          categoryCode: p.category_code,
          isEarned: false,
          assignment: (p.assigned_to ?? "interdisciplinary") as
            | "interdisciplinary"
            | "elective",
        });
      }
    }
    return list;
  }, [courses, done, personalPlan, assignmentMap]);

  const interdisciplinaryTotal = useMemo(() => {
    for (const b of bundles) {
      for (const row of b.rows) {
        if (row.requirementType === "interdisciplinary") {
          return { earned: row.earnedCredits, required: row.requiredCredits };
        }
      }
    }
    return { earned: 0, required: 0 };
  }, [bundles]);

  const electiveTotalByCategory = useMemo(() => {
    const m = new Map<string, { earned: number; required: number }>();
    for (const b of bundles) {
      for (const row of b.rows) {
        if (row.requirementType === "elective") {
          m.set(b.code, {
            earned: row.earnedCredits,
            required: row.requiredCredits,
          });
        }
      }
    }
    return m;
  }, [bundles]);

  const toggleItem = useCallback(
    async (item: FlowItem) => {
      const next =
        item.assignment === "interdisciplinary" ? "elective" : "interdisciplinary";
      try {
        const [kind, raw] = item.key.split(":");
        if (kind === "official") {
          await api.setCreditAssignment(raw, next);
        } else if (kind === "record") {
          await api.patchManual(Number(raw), { assigned_to: next });
        } else if (kind === "plan") {
          await api.patchPersonalPlan(Number(raw), { assigned_to: next });
        }
        await refetchTrailData();
      } catch (e) {
        console.error(e);
      }
    },
    [refetchTrailData]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sub">
        加载中…
      </div>
    );
  }
  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        加载失败：{err}
      </div>
    );
  }

  const overallPct =
    overall.required > 0 ? (overall.earned / overall.required) * 100 : 0;

  return (
    <div className="min-h-screen px-8 py-6">
      <header className="mb-6">
        <h1 className="text-lg text-ink">旅迹</h1>
        <div className="text-[11px] text-sub mt-0.5">
          已修在前 · 计划修读在后 · 点课程填成绩
        </div>
      </header>

      {/* 总览 */}
      <section className="bg-card border border-sub/15 rounded-xl p-6 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm text-sub">总进度</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl text-ink tabular-nums">
              {formatCredits(overall.earned)}
            </span>
            <span className="text-sub tabular-nums">
              / {formatCredits(overall.required)} 学分
            </span>
            <span className="ml-3 text-xs text-sub tabular-nums">
              ({overallPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mb-2 text-[11px] text-sub">
          <span>我的计划预览</span>
          <span className="tabular-nums">
            + {formatCredits(overall.planned)} 学分，预计 {formatCredits(overall.earned + overall.planned)}
          </span>
        </div>
        <ProgressBar
          earned={overall.earned}
          required={overall.required}
          color="#c96442"
          trackColor="rgba(201,100,66,0.10)"
          planned={overall.planned}
        />
      </section>

      {/* 经法管融通学分流向（仅当有该类课程时显示） */}
      {flowItems.length > 0 && (
        <section className="bg-card border border-sub/15 rounded-xl p-4 mb-6 inline-block">
          <div className="mb-2">
            <h2 className="text-xs text-ink">学分流向 · 经法管融通</h2>
            <div className="text-[10px] text-sub mt-0.5">
              点击课程或连线，切换归属
            </div>
          </div>
          <InterdisciplinaryFlow
            items={flowItems}
            onToggle={toggleItem}
            interdisciplinaryTotal={interdisciplinaryTotal}
            electiveTotalByCategory={electiveTotalByCategory}
          />
        </section>
      )}

      {/* 5 个板块 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bundles.map((b) => (
          <CategoryCard
            key={b.code}
            bundle={b}
            expandedKeys={expanded}
            onToggle={toggle}
            onRefetch={refetchTrailData}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({
  bundle,
  expandedKeys,
  onToggle,
  onRefetch,
}: {
  bundle: CategoryBundle;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  onRefetch: () => Promise<void>;
}) {
  const style = CATEGORY_STYLE[bundle.code];
  const pct =
    bundle.totalRequired > 0
      ? (bundle.totalEarned / bundle.totalRequired) * 100
      : 0;

  return (
    <div className="bg-card border border-sub/15 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: style.color }}
          />
          <h2 className="text-base text-ink">{bundle.name}</h2>
        </div>
        <div className="text-xs text-sub tabular-nums">
          <span className="text-ink text-base mr-1">{formatCredits(bundle.totalEarned)}</span>
          / {formatCredits(bundle.totalRequired)} 学分 · {pct.toFixed(1)}%
        </div>
      </div>
      <div className="mb-3 text-[11px] text-sub tabular-nums">
        我的计划预览 + {formatCredits(bundle.totalPlanned)} 学分
      </div>

      <div className="space-y-3">
        {bundle.rows.map((row) => {
          const key = `${bundle.code}-${row.requirementType}`;
          const isOpen = expandedKeys.has(key);
          const rowPct =
            row.requiredCredits > 0
              ? (row.earnedCredits / row.requiredCredits) * 100
              : 0;
          return (
            <div key={key}>
              <button
                onClick={() => onToggle(key)}
                className="w-full text-left group"
              >
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sub group-hover:text-ink transition-colors">
                      {row.requirementName}
                    </span>
                    <span className="text-sub/60 tabular-nums">
                      ({row.earnedCourses.length} 门已修 · {row.plannedCourses.length} 门计划)
                    </span>
                  </div>
                  <div className="tabular-nums" style={{ color: style.text }}>
                    {formatCredits(row.earnedCredits)}
                    {row.plannedCredits > 0 && (
                      <span className="text-sub/70 ml-1">
                        +{formatCredits(row.plannedCredits)}
                      </span>
                    )}
                    <span className="text-sub mx-0.5">/</span>
                    {formatCredits(row.requiredCredits)}
                    <span className="text-sub/60 ml-1.5 text-[10px]">
                      {rowPct.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <ProgressBar
                  earned={row.earnedCredits}
                  required={row.requiredCredits}
                  color={style.color}
                  trackColor={style.bgGhost}
                  planned={row.plannedCredits}
                />
              </button>

              {isOpen && (
                <CourseStatusList
                  row={row}
                  color={style.text}
                  onRefetch={onRefetch}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CourseStatusList({
  row,
  color,
  onRefetch,
}: {
  row: RequirementRow;
  color: string;
  onRefetch: () => Promise<void>;
}) {
  if (row.earnedCourses.length === 0 && row.plannedCourses.length === 0) {
    return (
      <div className="mt-2 text-[11px] text-sub/60 italic px-1">
        暂无已修或计划课程
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {row.earnedCourses.length > 0 && (
        <CourseGroup label="已修">
          {row.earnedCourses.map((c) => (
            <ScorePill
              key={`earned-${c.source}-${c.courseCode ?? c.id}`}
              course={c}
              color={color}
              onRefetch={onRefetch}
            />
          ))}
        </CourseGroup>
      )}

      {row.plannedCourses.length > 0 && (
        <CourseGroup label="计划修读">
          {row.plannedCourses.map((c) => (
            <PlannedCoursePill
              key={`planned-${c.source}-${c.courseCode ?? c.id}-${c.courseName}`}
              course={c}
              color={color}
              onRefetch={onRefetch}
            />
          ))}
        </CourseGroup>
      )}
    </div>
  );
}

function CourseGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-14 shrink-0 pt-1 text-[10px] text-sub/65">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// ── 可点击的"成绩药丸" + popover 输入框 ─────────────────
function ScorePill({
  course,
  color,
  onRefetch,
}: {
  course: EarnedCourse;
  color: string;
  onRefetch: () => Promise<void>;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const score = course.score;
  const hasScore = score != null;

  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor(r);
  };
  const close = () => setAnchor(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-sub/10 hover:bg-sub/20 transition-colors cursor-pointer"
        style={{ color }}
        title={course.source === "official" ? course.courseCode ?? "" : "手动添加"}
      >
        {course.source === "manual" && (
          <span className="px-1 rounded-sm bg-sub/10 text-[9px] text-sub">自</span>
        )}
        <span>{course.courseName}</span>
        <span className="text-sub/70 tabular-nums">{formatCredits(course.credits)}</span>
        <span
          className="ml-1 pl-1.5 border-l border-sub/25 tabular-nums text-[10px]"
          style={{ color: hasScore ? color : "rgb(var(--sub) / 0.55)" }}
        >
          {hasScore ? score : "—"}
        </span>
      </button>
      {anchor &&
        createPortal(
          <ScorePopover
            anchor={anchor}
            course={course}
            initialScore={score ?? null}
            onClose={close}
            onSaved={async () => {
              await onRefetch();
              close();
            }}
          />,
          document.body
        )}
    </>
  );
}

function PlannedCoursePill({
  course,
  color,
  onRefetch,
}: {
  course: PlannedCourse;
  color: string;
  onRefetch: () => Promise<void>;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor(r);
  };
  const close = () => setAnchor(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed text-[11px] bg-sub/5 hover:bg-sub/10 transition-colors cursor-pointer"
        style={{ color, borderColor: "rgb(var(--sub) / 0.25)" }}
        title={course.source === "official" ? course.courseCode ?? "" : "计划课程"}
      >
        <span>{course.courseName}</span>
        <span className="text-sub/70 tabular-nums">{formatCredits(course.credits)}</span>
        <span className="text-sub/55 tabular-nums">
          {course.plannedTerm == null ? "待安排" : TERM_LABEL[course.plannedTerm]}
        </span>
        <span className="ml-1 pl-1.5 border-l border-sub/25 tabular-nums text-[10px] text-sub/70">
          填成绩
        </span>
      </button>
      {anchor &&
        createPortal(
          <ScorePopover
            anchor={anchor}
            course={course}
            initialScore={null}
            onClose={close}
            onSaved={async () => {
              await onRefetch();
              close();
            }}
          />,
          document.body
        )}
    </>
  );
}

type ScoreEditableCourse = EarnedCourse | PlannedCourse;

function ScorePopover({
  anchor,
  course,
  initialScore,
  onClose,
  onSaved,
}: {
  anchor: DOMRect;
  course: ScoreEditableCourse;
  initialScore: number | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [val, setVal] = useState<string>(
    initialScore != null ? String(initialScore) : ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const persist = async (newScore: number | null) => {
    const isPlanned = isPlannedCourse(course);
    if (isPlanned && newScore == null) {
      setErr("计划课程需要填写成绩后才会计入已修");
      return;
    }
    if (isPlanned && course.plannedTerm == null) {
      setErr("「待安排」的课程需先拖到某个学期后才能填成绩");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      if (isPlanned) {
        if (course.plannedTerm == null) {
          throw new Error("plannedTerm 不应为 null（已在前面拦截）");
        }
        const plannedTerm = course.plannedTerm;
        if (course.source === "manual") {
          const courseNature =
            course.courseNature === "跨专业" ? "选修" : course.courseNature;
          if (course.origin === "record") {
            if (course.id == null) throw new Error("手动课缺少 id");
            await api.patchManual(course.id, { score: newScore });
          } else {
            if (course.id == null) throw new Error("计划课程缺少 id");
            await api.patchManual(course.id, {
              term_number: plannedTerm,
              score: newScore,
              note: "由计划转为已修",
              course_nature: courseNature,
            });
          }
        } else {
          if (!course.courseCode) throw new Error("官方课缺少课程号");
          await api.upsertOfficial({
            term_number: plannedTerm,
            course_code: course.courseCode,
            score: newScore,
          });
        }
      } else if (course.source === "manual") {
        if (course.id == null) throw new Error("手动课缺少 id");
        await api.patchManual(course.id, { score: newScore });
      } else {
        if (!course.courseCode) throw new Error("官方课缺少课程号");
        await api.patchOfficial(course.courseCode, { score: newScore });
      }
      await onSaved();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = val.trim();
    if (t === "") {
      void persist(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setErr("分数需在 0–100 之间");
      return;
    }
    void persist(n);
  };

  // 默认放在按钮下方；右侧超出屏幕则左对齐到屏右边距
  const W = 240;
  const top = anchor.bottom + 6;
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const left = Math.min(anchor.left, screenW - W - 12);

  return (
    <div
      ref={rootRef}
      className="fixed z-50 bg-card border border-sub/20 rounded-lg p-3"
      style={{
        top,
        left,
        width: W,
        boxShadow:
          "0 14px 36px rgb(var(--shadow-rgb) / var(--shadow-strong)), 0 2px 8px rgb(var(--shadow-rgb) / var(--shadow-soft))",
      }}
    >
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <div className="text-[12px] text-ink truncate" title={course.courseName}>
          {course.courseName}
        </div>
        <div className="text-[10px] text-sub tabular-nums shrink-0">
          {formatCredits(course.credits)} 学分
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.1"
          value={val}
          autoFocus
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0–100"
          className="flex-1 px-2 py-1 rounded-md bg-bg border border-sub/30 text-ink text-[12px] tabular-nums focus:outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-2.5 py-1 rounded-md text-[11px] text-white disabled:opacity-50"
          style={{ backgroundColor: "rgb(var(--brand) / 1)" }}
        >
          {busy ? "…" : "保存"}
        </button>
      </form>

      <div className="flex items-center justify-between mt-2 min-h-[14px]">
        {isPlannedCourse(course) ? (
          <div className="text-[10px] text-sub/70">
            保存后进入已修进度
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void persist(null)}
            disabled={busy}
            className="text-[10px] text-sub hover:text-ink transition-colors disabled:opacity-50"
          >
            清空分数
          </button>
        )}
        {err && <div className="text-[10px] text-red-500">{err}</div>}
      </div>
    </div>
  );
}

function isPlannedCourse(course: ScoreEditableCourse): course is PlannedCourse {
  return !("score" in course);
}
