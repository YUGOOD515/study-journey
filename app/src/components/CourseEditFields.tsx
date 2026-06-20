import type React from "react";
import { CustomSelect } from "./CustomSelect";
import type { CourseEditDraft, CourseNature } from "../types";
import {
  COURSE_CATEGORY_OPTIONS,
  COURSE_NATURE_OPTIONS,
  CREDIT_ASSIGNMENT_OPTIONS,
  TERM_OPTIONS,
  canUseInterdisciplinary,
} from "../lib/courseOptions";

type Props = {
  draft: CourseEditDraft;
  onChange: (next: CourseEditDraft) => void;
  compact?: boolean;
  allowInterdisciplinary?: boolean;
  showCourseName?: boolean;
  showNote?: boolean;
};

export function CourseEditFields({
  draft,
  onChange,
  compact = false,
  allowInterdisciplinary = true,
  showCourseName = true,
  showNote = true,
}: Props) {
  const interAllowed = allowInterdisciplinary && canUseInterdisciplinary(draft.category_code);
  const isInter = interAllowed && draft.is_interdisciplinary === 1;

  const setDraft = (patch: Partial<CourseEditDraft>) => onChange({ ...draft, ...patch });

  const setCategory = (category_code: CourseEditDraft["category_code"]) => {
    const canKeepInter = allowInterdisciplinary && canUseInterdisciplinary(category_code);
    onChange({
      ...draft,
      category_code,
      is_interdisciplinary: canKeepInter ? draft.is_interdisciplinary : 0,
      course_nature: canKeepInter && draft.is_interdisciplinary === 1 ? "选修" : draft.course_nature,
    });
  };

  const setInterdisciplinary = (enabled: boolean) => {
    onChange({
      ...draft,
      is_interdisciplinary: enabled ? 1 : 0,
      course_nature: enabled ? "选修" : draft.course_nature,
      assigned_to: draft.assigned_to ?? "interdisciplinary",
    });
  };

  const inputClass = compact
    ? "h-7 w-full rounded-md border border-sub/15 bg-card px-2 text-[11px] text-ink outline-none transition-colors placeholder:text-sub/45 focus:border-brand/45"
    : "h-9 w-full rounded-md border border-sub/25 bg-bg px-3 text-sm text-ink outline-none transition-colors placeholder:text-sub/45 focus:border-brand";
  const labelClass = compact ? "text-[10px] text-sub" : "text-[11px] text-sub";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      {showCourseName && (
        <Field label="课程名" compact={compact} labelClass={labelClass}>
          <input
            value={draft.course_name}
            onChange={(event) => setDraft({ course_name: event.target.value })}
            className={inputClass}
          />
        </Field>
      )}

      <Field label="类别" compact={compact} labelClass={labelClass}>
        <CustomSelect
          value={draft.category_code}
          onChange={(value) => setCategory(value as CourseEditDraft["category_code"])}
          options={COURSE_CATEGORY_OPTIONS.map((option) => ({ value: option.code, label: option.name }))}
          className={inputClass}
          compact={compact}
          ariaLabel="选择课程类别"
        />
      </Field>

      <div className={compact ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-2 gap-3"}>
        <Field label="性质" compact labelClass={labelClass}>
          <CustomSelect
            value={isInter ? "选修" : draft.course_nature}
            disabled={isInter}
            onChange={(value) => setDraft({ course_nature: value as CourseNature })}
            options={COURSE_NATURE_OPTIONS.map((option) => ({ value: option, label: option }))}
            className={inputClass + (isInter ? " opacity-70" : "")}
            compact={compact}
            ariaLabel="选择课程性质"
          />
        </Field>
        <Field label="计划" compact labelClass={labelClass}>
          <CustomSelect
            value={draft.planned_term == null ? "" : String(draft.planned_term)}
            onChange={(value) => setDraft({ planned_term: value === "" ? null : Number(value) })}
            options={[
              { value: "", label: "未设置" },
              ...TERM_OPTIONS.map((term) => ({ value: String(term), label: `第 ${term} 学期` })),
            ]}
            className={inputClass}
            compact={compact}
            ariaLabel="选择计划学期"
          />
        </Field>
      </div>

      {allowInterdisciplinary && (
        <div className={compact ? "rounded-md border border-sub/10 bg-sub/5 px-2 py-1.5" : "rounded-md border border-sub/15 bg-sub/5 px-3 py-2"}>
          <label className="flex items-center justify-between gap-2">
            <span className={labelClass}>经法管融通</span>
            <input
              type="checkbox"
              checked={isInter}
              disabled={!interAllowed}
              onChange={(event) => setInterdisciplinary(event.target.checked)}
              className="h-3.5 w-3.5 accent-[rgb(var(--brand))] disabled:opacity-40"
            />
          </label>
          {!interAllowed && (
            <div className="mt-1 text-[10px] text-sub/60">仅通识教育和大类平台可设置</div>
          )}
          {isInter && (
            <div className="mt-1.5">
              <div className={labelClass + " mb-1"}>学分计入</div>
              <CustomSelect
                value={draft.assigned_to}
                onChange={(value) => setDraft({ assigned_to: value as CourseEditDraft["assigned_to"] })}
                options={CREDIT_ASSIGNMENT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                className={inputClass}
                compact={compact}
                ariaLabel="选择学分计入方向"
              />
            </div>
          )}
        </div>
      )}

      <div className={compact ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-2 gap-3"}>
        <Field label="学分" compact labelClass={labelClass}>
          <NumberInput value={draft.credits} onChange={(credits) => setDraft({ credits })} inputClass={inputClass} step="0.01" />
        </Field>
        <Field label="成绩" compact labelClass={labelClass}>
          <NumberInput value={draft.score} onChange={(score) => setDraft({ score })} inputClass={inputClass} allowEmpty max={100} />
        </Field>
        <Field label="讲课" compact labelClass={labelClass}>
          <NumberInput value={draft.lecture_hours} onChange={(lecture_hours) => setDraft({ lecture_hours })} inputClass={inputClass} />
        </Field>
        <Field label="实践" compact labelClass={labelClass}>
          <NumberInput value={draft.experiment_hours} onChange={(experiment_hours) => setDraft({ experiment_hours })} inputClass={inputClass} />
        </Field>
        <Field label="课外" compact labelClass={labelClass}>
          <NumberInput value={draft.extra_hours} onChange={(extra_hours) => setDraft({ extra_hours })} inputClass={inputClass} />
        </Field>
        <Field label="先修" compact labelClass={labelClass}>
          <input
            value={draft.prerequisite_course_code}
            placeholder="课程号"
            onChange={(event) => setDraft({ prerequisite_course_code: event.target.value })}
            className={inputClass}
          />
        </Field>
      </div>

      {showNote && (
        <Field label="备注" compact={compact} labelClass={labelClass}>
          <input
            value={draft.note}
            placeholder="可留空"
            onChange={(event) => setDraft({ note: event.target.value })}
            className={inputClass}
          />
        </Field>
      )}
    </div>
  );
}

function Field({
  label,
  compact,
  labelClass,
  children,
}: {
  label: string;
  compact: boolean;
  labelClass: string;
  children: React.ReactNode;
}) {
  return compact ? (
    <label className="block">
      <span className={labelClass + " mb-0.5 block"}>{label}</span>
      {children}
    </label>
  ) : (
    <label className="block">
      <span className={labelClass + " mb-1 block"}>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  inputClass,
  allowEmpty = false,
  max,
  step = "0.1",
}: {
  value: string;
  onChange: (value: string) => void;
  inputClass: string;
  allowEmpty?: boolean;
  max?: number;
  step?: string;
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        if (!allowEmpty && value.trim() === "") onChange("0");
      }}
      className={inputClass}
    />
  );
}
