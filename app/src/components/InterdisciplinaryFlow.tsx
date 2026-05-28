/**
 * 经法管融通课程的"学分流向图"（桑基风格）。
 *
 * 接收抽象 items[]，每项是一门"标记为经法管融通"的课（不论来源：
 * 官方培养方案、手动已修课、手动计划课）。
 * 左：课程节点；右：两个候选桶（大类·经法管融通 / 该课原属板块·选修）；
 * 曲线粗细 ∝ 学分。点课程节点或连线 → 调 onToggle 切换该项归属。
 */
import { useMemo } from "react";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { formatCredits } from "../lib/credits";
import type { CategoryCode } from "../types";

export type Assignment = "interdisciplinary" | "elective";

export interface FlowItem {
  key: string;            // 全局唯一（如 "official:B0480240"、"plan:7"、"record:5"）
  courseName: string;
  credits: number;
  categoryCode: CategoryCode;
  isEarned: boolean;      // 已修（有成绩）= 深色填充
  assignment: Assignment;
}

interface BucketTotal {
  earned: number;
  required: number;
}

interface Props {
  items: FlowItem[];
  onToggle: (item: FlowItem) => void;
  interdisciplinaryTotal: BucketTotal;
  electiveTotalByCategory: Map<string, BucketTotal>;
}

const W = 420;
const COURSE_X = 18;
const COURSE_W = 78;
const BUCKET_W = 150;
const BUCKET_X = W - 18 - BUCKET_W;
const ROW_H = 26;
const ROW_GAP = 4;
const TOP = 18;
const BUCKET_GAP = 10;
const BUCKET_H = 38;

export function InterdisciplinaryFlow({
  items,
  onToggle,
  interdisciplinaryTotal,
  electiveTotalByCategory,
}: Props) {
  // 收集所有 elective 候选桶（每个出现过的 category_code 一个）
  const electiveBuckets = useMemo(() => {
    const seen = new Map<
      string,
      { code: CategoryCode; name: string; total: BucketTotal }
    >();
    for (const it of items) {
      if (!seen.has(it.categoryCode)) {
        const baseName = CATEGORY_STYLE[it.categoryCode]?.name ?? it.categoryCode;
        seen.set(it.categoryCode, {
          code: it.categoryCode,
          name: `${baseName} · 选修`,
          total: electiveTotalByCategory.get(it.categoryCode) ?? {
            earned: 0,
            required: 0,
          },
        });
      }
    }
    return [...seen.values()];
  }, [items, electiveTotalByCategory]);

  if (items.length === 0) return null;

  const courseRows = items.length;
  const totalCourseH = courseRows * ROW_H + (courseRows - 1) * ROW_GAP;
  const bucketsTotalH =
    BUCKET_H +
    BUCKET_GAP +
    electiveBuckets.length * BUCKET_H +
    Math.max(0, electiveBuckets.length - 1) * BUCKET_GAP;
  const H = Math.max(totalCourseH, bucketsTotalH) + TOP * 2;

  const courseY = (i: number) => TOP + i * (ROW_H + ROW_GAP);
  const interY = TOP;
  const electiveY = (i: number) =>
    TOP + BUCKET_H + BUCKET_GAP + i * (BUCKET_H + BUCKET_GAP);

  const bezier = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", maxWidth: "100%" }}
    >
      {/* 链接 */}
      {items.map((it, i) => {
        const electiveBucketIdx = electiveBuckets.findIndex(
          (b) => b.code === it.categoryCode
        );
        const targetY =
          it.assignment === "interdisciplinary"
            ? interY + BUCKET_H / 2
            : electiveY(electiveBucketIdx) + BUCKET_H / 2;
        const sourceY = courseY(i) + ROW_H / 2;
        const color = CATEGORY_STYLE[it.categoryCode]?.color ?? "currentColor";
        const stroke = Math.max(3, Math.min(18, it.credits * 3));
        return (
          <path
            key={`link-${it.key}`}
            d={bezier(COURSE_X + COURSE_W, sourceY, BUCKET_X, targetY)}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeOpacity={0.45}
            style={{ cursor: "pointer", transition: "stroke-opacity 200ms" }}
            onClick={() => onToggle(it)}
            onMouseEnter={(e) =>
              ((e.target as SVGPathElement).style.strokeOpacity = "0.75")
            }
            onMouseLeave={(e) =>
              ((e.target as SVGPathElement).style.strokeOpacity = "0.45")
            }
          >
            <title>
              {it.courseName} · {formatCredits(it.credits)} 学分 →{" "}
              {it.assignment === "interdisciplinary"
                ? "经法管融通"
                : `${CATEGORY_STYLE[it.categoryCode]?.name ?? it.categoryCode}·选修`}
              {"\n"}点击切换归属
            </title>
          </path>
        );
      })}

      {/* 课程节点 */}
      {items.map((it, i) => {
        const color = CATEGORY_STYLE[it.categoryCode]?.color ?? "currentColor";
        return (
          <g
            key={`course-${it.key}`}
            transform={`translate(${COURSE_X}, ${courseY(i)})`}
            style={{ cursor: "pointer" }}
            onClick={() => onToggle(it)}
          >
            <rect
              width={COURSE_W}
              height={ROW_H}
              rx={4}
              fill={color}
              fillOpacity={it.isEarned ? 0.9 : 0.22}
              stroke={color}
              strokeOpacity={0.55}
            />
            <text
              x={COURSE_W / 2}
              y={ROW_H / 2 + 3}
              textAnchor="middle"
              fontSize={9}
              fill={it.isEarned ? "white" : color}
              style={{ pointerEvents: "none" }}
            >
              {truncate(it.courseName, 6)} · {formatCredits(it.credits)}
              {it.isEarned ? " ✓" : ""}
            </text>
          </g>
        );
      })}

      {/* 经法管融通桶 */}
      <BucketRect
        x={BUCKET_X}
        y={interY}
        w={BUCKET_W}
        h={BUCKET_H}
        title="大类·经法管融通"
        subtitle={`${formatCredits(interdisciplinaryTotal.earned)}/${formatCredits(interdisciplinaryTotal.required)}`}
        active={items.some((it) => it.assignment === "interdisciplinary")}
      />

      {/* elective 桶（每个出现过的 category 一个） */}
      {electiveBuckets.map((b, i) => {
        const active = items.some(
          (it) => it.categoryCode === b.code && it.assignment === "elective"
        );
        return (
          <BucketRect
            key={b.code}
            x={BUCKET_X}
            y={electiveY(i)}
            w={BUCKET_W}
            h={BUCKET_H}
            title={b.name}
            subtitle={`${formatCredits(b.total.earned)}/${formatCredits(b.total.required)}`}
            active={active}
            color={CATEGORY_STYLE[b.code]?.color}
          />
        );
      })}
    </svg>
  );
}

function BucketRect({
  x,
  y,
  w,
  h,
  title,
  subtitle,
  active,
  color = "currentColor",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  active: boolean;
  color?: string;
}) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={w}
        height={h}
        rx={4}
        fill={color}
        fillOpacity={active ? 0.18 : 0.05}
        stroke={color}
        strokeOpacity={active ? 0.7 : 0.28}
        strokeDasharray={active ? undefined : "3 2"}
      />
      <circle
        cx={10}
        cy={h / 2}
        r={3}
        fill={active ? color : "transparent"}
        stroke={color}
        strokeWidth={1.2}
      />
      <text
        x={20}
        y={h / 2 - 1}
        fontSize={9}
        fill={color}
        style={{ pointerEvents: "none" }}
      >
        {title}
      </text>
      <text
        x={20}
        y={h / 2 + 10}
        fontSize={9}
        fill={color}
        fillOpacity={0.7}
        style={{ pointerEvents: "none" }}
      >
        {subtitle} 学分
      </text>
    </g>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
