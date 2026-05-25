import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import {
  bundleByCategory,
  computeRequirementRows,
  type CategoryBundle,
  type RequirementRow,
} from "../lib/progress";
import { ProgressBar } from "../components/ProgressBar";
import type {
  CourseWithCategory,
  ProgramRequirement,
  SemesterCourse,
} from "../types";

export default function Trail() {
  const [courses, setCourses] = useState<CourseWithCategory[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
  const [done, setDone] = useState<SemesterCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      api.coursesWithCategory(),
      api.programRequirements(),
      api.semesterCourses(),
    ])
      .then(([c, r, d]) => {
        setCourses(c);
        setReqs(r);
        setDone(d);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const bundles = useMemo(
    () => bundleByCategory(computeRequirementRows(reqs, courses, done)),
    [reqs, courses, done]
  );

  const overall = useMemo(() => {
    const required = bundles.reduce((s, b) => s + b.totalRequired, 0);
    const earned = bundles.reduce((s, b) => s + b.totalEarned, 0);
    return { required: round1(required), earned: round1(earned) };
  }, [bundles]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
          按培养方案对账 · 5 大板块进度
        </div>
      </header>

      {/* 总览 */}
      <section className="bg-card border border-sub/15 rounded-xl p-6 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm text-sub">总进度</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl text-ink tabular-nums">
              {overall.earned}
            </span>
            <span className="text-sub tabular-nums">
              / {overall.required} 学分
            </span>
            <span className="ml-3 text-xs text-sub tabular-nums">
              ({overallPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <ProgressBar
          earned={overall.earned}
          required={overall.required}
          color="#c96442"
          trackColor="rgba(201,100,66,0.10)"
        />
      </section>

      {/* 5 个板块 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bundles.map((b) => (
          <CategoryCard
            key={b.code}
            bundle={b}
            expandedKeys={expanded}
            onToggle={toggle}
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
}: {
  bundle: CategoryBundle;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
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
          <span className="text-ink text-base mr-1">{bundle.totalEarned}</span>
          / {bundle.totalRequired} 学分 · {pct.toFixed(1)}%
        </div>
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
                      ({row.earnedCourses.length} 门)
                    </span>
                  </div>
                  <div className="tabular-nums" style={{ color: style.text }}>
                    {row.earnedCredits}
                    <span className="text-sub mx-0.5">/</span>
                    {row.requiredCredits}
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
                />
              </button>

              {isOpen && <EarnedList row={row} color={style.text} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EarnedList({
  row,
  color,
}: {
  row: RequirementRow;
  color: string;
}) {
  if (row.earnedCourses.length === 0) {
    return (
      <div className="mt-2 text-[11px] text-sub/60 italic px-1">
        暂无已修课程
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {row.earnedCourses.map((c) => (
        <span
          key={c.course_code}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-sub/10"
          style={{ color }}
          title={c.course_code}
        >
          {c.course_name}
          <span className="text-sub/70 tabular-nums">{c.credits}</span>
        </span>
      ))}
    </div>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
