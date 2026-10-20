/**
 * 经法管融通课程的学分归属。
 * 上方是候选去向（大类平台·经法管融通 / 原板块·选修）的学分小卡（圆环示意）；
 * 下方每门课一行，右侧分段按钮切换归属；窄屏时按钮换到下一行。
 */
import { useMemo } from "react";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { formatCredits } from "../lib/credits";
import { cn } from "../lib/cn";
import type { CategoryCode } from "../types";
import { ProgressRing } from "./ProgressRing";

export type Assignment = "interdisciplinary" | "elective";

export interface FlowItem {
  key: string;
  courseName: string;
  credits: number;
  categoryCode: CategoryCode;
  isEarned: boolean;
  isInProgress: boolean;
  assignment: Assignment;
}

interface BucketTotal {
  earned: number;
  required: number;
}

interface Props {
  items: FlowItem[];
  onToggle: (item: FlowItem) => void;
  disabled?: boolean;
  interdisciplinaryTotal: BucketTotal;
  electiveTotalByCategory: Map<string, BucketTotal>;
}

export function InterdisciplinaryFlow({
  items,
  onToggle,
  disabled = false,
  interdisciplinaryTotal,
  electiveTotalByCategory,
}: Props) {
  const buckets = useMemo(() => {
    const list: Array<{
      key: string;
      name: string;
      color: string;
      total: BucketTotal;
      credits: number;
    }> = [
      {
        key: "interdisciplinary",
        name: "大类平台 / 经法管融通",
        color: CATEGORY_STYLE.major_platform.color,
        total: interdisciplinaryTotal,
        credits: items
          .filter((i) => i.assignment === "interdisciplinary")
          .reduce((s, i) => s + i.credits, 0),
      },
    ];
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.categoryCode)) continue;
      seen.add(it.categoryCode);
      const style = CATEGORY_STYLE[it.categoryCode];
      list.push({
        key: it.categoryCode,
        name: `${style?.name ?? it.categoryCode} / 选修`,
        color: style?.color ?? "rgb(var(--ink))",
        total: electiveTotalByCategory.get(it.categoryCode) ?? { earned: 0, required: 0 },
        credits: items
          .filter((i) => i.categoryCode === it.categoryCode && i.assignment === "elective")
          .reduce((s, i) => s + i.credits, 0),
      });
    }
    return list;
  }, [items, interdisciplinaryTotal, electiveTotalByCategory]);

  if (items.length === 0) return null;

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-3 rounded bg-card px-3 py-2.5">
            <ProgressRing
              earned={b.total.earned}
              required={b.total.required}
              color={b.color}
              size={30}
              stroke={4}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-xs font-medium text-ink">{b.name}</span>
                <span className="num shrink-0 text-xs text-ink">
                  {formatCredits(b.total.earned)}
                  <span className="text-faint"> / {formatCredits(b.total.required)}</span>
                </span>
              </div>
              <div className="mt-0.5 text-2xs text-sub">
                这几门课计入 <span className="num text-ink">{formatCredits(b.credits)}</span> 学分
              </div>
            </div>
          </div>
        ))}
      </div>

      <ul className="mt-3 divide-y divide-line" aria-label="经法管融通课程">
        {items.map((it) => {
          const style = CATEGORY_STYLE[it.categoryCode];
          const options: Array<{ value: Assignment; label: string }> = [
            { value: "interdisciplinary", label: "经法管融通" },
            { value: "elective", label: `${style?.name ?? ""}选修` },
          ];
          return (
            <li
              key={it.key}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: style?.color }}
                  aria-hidden
                />
                <span className="truncate text-ink">{it.courseName}</span>
                <span className="num shrink-0 text-2xs text-sub">
                  {formatCredits(it.credits)} 学分
                </span>
                <span className="shrink-0 text-2xs text-faint">
                  {it.isEarned ? "已修" : it.isInProgress ? "在修" : "计划"}
                </span>
              </span>
              <div
                role="radiogroup"
                aria-label={`${it.courseName} 学分计入`}
                className="inline-flex h-7 shrink-0 rounded bg-fill-strong p-0.5"
              >
                {options.map((o) => {
                  const active = it.assignment === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={disabled && !active}
                      onClick={() => !disabled && !active && onToggle(it)}
                      className={cn(
                        "h-6 whitespace-nowrap rounded-sm px-2.5 text-2xs transition-colors",
                        active
                          ? "bg-card font-medium text-ink shadow-[0_0_0_1px_rgb(var(--line-strong))]"
                          : "text-sub enabled:hover:text-ink disabled:opacity-50",
                        disabled && "cursor-default",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
