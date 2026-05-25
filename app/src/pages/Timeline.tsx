import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { parseOfferedTerm, TERM_LABEL } from "../lib/offeredTerm";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import type {
  CourseWithCategory,
  ProgramRequirement,
  SemesterCourse,
} from "../types";
import { CourseCard } from "../components/CourseCard";

const TERMS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function Timeline() {
  const [courses, setCourses] = useState<CourseWithCategory[]>([]);
  const [reqs, setReqs] = useState<ProgramRequirement[]>([]);
  const [done, setDone] = useState<SemesterCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  // 学期分桶
  const buckets = useMemo(() => {
    const m: Record<number, CourseWithCategory[]> = {
      1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [],
    };
    const flexible: CourseWithCategory[] = [];
    for (const c of courses) {
      const p = parseOfferedTerm(c.offered_term);
      if (p.isFlexible || p.primary == null) flexible.push(c);
      else if (m[p.primary]) m[p.primary].push(c);
      else flexible.push(c);
    }
    // 排序：必修在前，再按类别名
    const sortCourses = (arr: CourseWithCategory[]) =>
      arr.sort((a, b) => {
        if (a.course_nature !== b.course_nature) {
          return a.course_nature === "必修" ? -1 : 1;
        }
        return a.category_name.localeCompare(b.category_name, "zh");
      });
    for (const k of TERMS) sortCourses(m[k]);
    sortCourses(flexible);
    return { byTerm: m, flexible };
  }, [courses]);

  // 已修按学期映射
  const doneByTerm = useMemo(() => {
    const m: Record<number, Map<string, number | null>> = {};
    for (const t of TERMS) m[t] = new Map();
    for (const d of done) {
      if (d.source !== "official" || !d.course_code) continue;
      m[d.term_number]?.set(d.course_code, d.score);
    }
    return m;
  }, [done]);

  // 总学分
  const totals = useMemo(() => {
    const requiredTotal = reqs.reduce((s, r) => s + r.required_credits, 0);
    const planTotal = courses.reduce((s, c) => s + c.credits, 0);
    const completedTotal = done.reduce((s, d) => {
      if (d.source === "manual") return s + (d.credits ?? 0);
      const c = courses.find((x) => x.course_code === d.course_code);
      return s + (c?.credits ?? 0);
    }, 0);
    return { requiredTotal, planTotal, completedTotal };
  }, [reqs, courses, done]);

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

  return (
    <div className="min-h-screen px-8 py-6">
      {/* 顶部 */}
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-lg text-ink">时间轴</h1>
          <div className="text-[11px] text-sub mt-0.5">
            官方计划 · 按 offered_term 字段排布（只读）
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <Stat label="已修学分" value={totals.completedTotal} />
          <Stat label="官方计划合计" value={totals.planTotal} />
          <Stat label="培养方案要求" value={totals.requiredTotal} />
        </div>
      </header>

      {/* 类别图例 */}
      <div className="flex flex-wrap gap-3 mb-5 text-[11px] text-sub">
        {Object.entries(CATEGORY_STYLE).map(([code, s]) => (
          <div key={code} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <span className="inline-block w-4 h-2.5 rounded-sm border border-sub/50" />
          必修（实线）
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-2.5 rounded-sm border border-dashed"
            style={{ borderColor: "rgba(107,107,107,0.5)" }}
          />
          选修（虚线）
        </div>
      </div>

      {/* 时间轴主区域 */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {TERMS.map((t) => {
          const list = buckets.byTerm[t];
          const termCredits = list.reduce((s, c) => s + c.credits, 0);
          const doneMap = doneByTerm[t];
          return (
            <div
              key={t}
              className="flex-shrink-0 w-[180px] bg-card border border-sub/20 rounded-lg p-2.5 flex flex-col"
            >
              <div className="flex items-baseline justify-between mb-2 px-0.5">
                <div>
                  <div className="text-[11px] text-sub tabular-nums">
                    学期 {t}
                  </div>
                  <div className="text-sm text-ink">{TERM_LABEL[t]}</div>
                </div>
                <div className="text-[11px] text-sub tabular-nums">
                  {termCredits} 学分
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {list.map((c) => (
                  <CourseCard
                    key={`${t}-${c.course_code}`}
                    course={c}
                    completedScore={doneMap.has(c.course_code) ? doneMap.get(c.course_code) : undefined}
                  />
                ))}
                {list.length === 0 && (
                  <div className="text-[10px] text-sub/60 italic px-1 py-2">
                    暂无安排
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* 灵活课程侧栏 */}
        <div className="flex-shrink-0 w-[200px] bg-card border border-dashed border-sub/30 rounded-lg p-2.5 flex flex-col">
          <div className="flex items-baseline justify-between mb-2 px-0.5">
            <div>
              <div className="text-[11px] text-sub">灵活</div>
              <div className="text-sm text-ink">任意学期</div>
            </div>
            <div className="text-[11px] text-sub tabular-nums">
              {buckets.flexible.length} 门
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {buckets.flexible.map((c) => (
              <CourseCard key={`flex-${c.course_code}`} course={c} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end">
      <div className="text-[10px] text-sub uppercase tracking-wide">{label}</div>
      <div className="text-lg text-ink tabular-nums">{value}</div>
    </div>
  );
}
