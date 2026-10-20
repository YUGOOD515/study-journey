/**
 * 经法管融通课程的学分归属。
 * 上方两列是候选去向（大类平台·经法管融通 / 原板块·选修）的学分汇总；
 * 下方每门课一行，右侧分段按钮切换归属。
 */
import { useMemo } from "react";
import { CATEGORY_STYLE } from "../lib/categoryStyle";
import { formatCredits } from "../lib/credits";
import { cn } from "../lib/cn";
import type { CategoryCode } from "../types";
import { ProgressBar } from "./ProgressBar";

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
    const list: Array<{ key: string; name: string; color: string; total: BucketTotal; credits: number }> = [
      {
        key: "interdisciplinary",
        name: "大类平台 / 经法管融通",
        color: CATEGORY_STYLE.major_platform.color,
        total: interdisciplinaryTotal,
        credits: items.filter((i) => i.assignment === "interdisciplinary").reduce((s, i) => s + i.credits, 0),
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
      <div className="grid gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-2">
        {buckets.map((b) => (
          <div key={b.key} className="bg-card p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: b.color }} />
                <span className="truncate">{b.name}</span>
              </span>
              <span className="shrink-0 text-2xs text-sub">
                <span className="num text-xs font-medium text-ink">{formatCredits(b.total.earned)}</span>
                <span className="num"> / {formatCredits(b.total.required)}</span>
              </span>
            </div>
            <ProgressBar earned={b.total.earned} required={b.total.required} color={b.color} height={4} />
            <div className="mt-1.5 text-2xs text-sub">
              本区课程计入 <span className="num text-ink">{formatCredits(b.credits)}</span> 学分
            </div>
          </div>
        ))}
      </div>

      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-left text-2xs text-sub">
            <th className="py-1.5 pr-3 font-normal">课程</th>
            <th className="w-14 py-1.5 pr-3 text-right font-normal">学分</th>
            <th className="hidden w-14 py-1.5 pr-3 font-normal sm:table-cell">状态</th>
            <th className="py-1.5 text-right font-normal">学分计入</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const style = CATEGORY_STYLE[it.categoryCode];
            const options: Array<{ value: Assignment; label: string }> = [
              { value: "interdisciplinary", label: "经法管融通" },
              { value: "elective", label: `${style?.name ?? ""}选修` },
            ];
            return (
              <tr key={it.key} className="border-b border-line last:border-0">
                <td className="py-2 pr-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: style?.color }} />
                    <span className="truncate text-ink">{it.courseName}</span>
                  </span>
                </td>
                <td className="num py-2 pr-3 text-right text-ink">{formatCredits(it.credits)}</td>
                <td className="hidden py-2 pr-3 text-sub sm:table-cell">{it.isEarned ? "已修" : it.isInProgress ? "在修" : "计划"}</td>
                <td className="py-1.5 text-right">
                  <div
                    role="radiogroup"
                    aria-label={`${it.courseName} 学分计入`}
                    className="inline-flex h-7 rounded bg-fill-strong p-0.5"
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
                            "h-6 whitespace-nowrap rounded-sm px-2 text-2xs transition-colors",
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
