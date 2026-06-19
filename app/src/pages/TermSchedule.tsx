import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { CATEGORY_STYLE, type CategoryStyle } from "../lib/categoryStyle";
import { TERM_LABEL } from "../lib/offeredTerm";
import { CourseHoverCard, type CourseHoverInfo } from "../components/CourseHoverCard";
import { useHoverIntentTriangle } from "../hooks/useHoverIntentTriangle";
import type {
  ActualCourseMeeting,
  CategoryCode,
  CourseNature,
  CourseWithCategory,
  SemesterCourse,
} from "../types";

const TERMS = [1, 2, 3, 4, 5, 6, 7, 8];

const WEEKDAYS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" },
];

const PERIODS = [
  { value: 1, time: "08:00-08:45" },
  { value: 2, time: "08:45-09:30" },
  { value: 3, time: "09:55-10:40" },
  { value: 4, time: "10:40-11:25" },
  { value: 5, time: "11:30-12:15" },
  { value: 6, time: "14:00-14:45" },
  { value: 7, time: "14:45-15:30" },
  { value: 8, time: "15:55-16:40" },
  { value: 9, time: "16:40-17:25" },
  { value: 10, time: "18:30-19:15" },
  { value: 11, time: "19:15-20:00" },
  { value: 12, time: "20:05-20:50" },
];

const WEEK_TRACK_LABEL_WIDTH = 108;
const WEEK_TRACK_GAP = 8;

type DisplayKey = "location" | "teacher" | "section" | "classGroup" | "nature" | "weeks";

const DISPLAY_ITEMS: Array<{ key: DisplayKey; label: string }> = [
  { key: "location", label: "地点" },
  { key: "teacher", label: "教师" },
  { key: "section", label: "课序号" },
  { key: "classGroup", label: "上课班级" },
  { key: "nature", label: "课程性质" },
  { key: "weeks", label: "周次" },
];

const DEFAULT_DISPLAY: Record<DisplayKey, boolean> = {
  location: true,
  teacher: true,
  section: false,
  classGroup: false,
  nature: false,
  weeks: false,
};

interface CourseVisual {
  categoryCode: CategoryCode;
  nature: CourseNature;
  style: CategoryStyle;
  isRequired: boolean;
}

export default function TermSchedule({
  termNumber,
  onTermChange,
  onBack,
}: {
  termNumber: number;
  onTermChange: (term: number) => void;
  onBack: () => void;
}) {
  const [allMeetings, setAllMeetings] = useState<ActualCourseMeeting[]>([]);
  const [programCourses, setProgramCourses] = useState<CourseWithCategory[]>([]);
  const [records, setRecords] = useState<SemesterCourse[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [display, setDisplay] = useState(DEFAULT_DISPLAY);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    Promise.all([
      api.actualCourseMeetings({ limit: 1000 }),
      api.coursesWithCategory(),
      api.semesterCourses(),
    ])
      .then(([meetingRows, courseRows, recordRows]) => {
        setAllMeetings(meetingRows);
        setProgramCourses(courseRows);
        setRecords(recordRows);
      })
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const meetings = useMemo(
    () => allMeetings.filter((meeting) => meeting.term === termNumber),
    [allMeetings, termNumber]
  );
  const availability = useMemo(() => summarizeAvailability(allMeetings), [allMeetings]);
  const visualByCode = useMemo(
    () => buildVisualMap(programCourses, records),
    [programCourses, records]
  );
  const hoverInfoByCode = useMemo(
    () => buildHoverInfoMap(programCourses, records),
    [programCourses, records]
  );
  const meta = meetings[0];
  const weeks = useMemo(() => {
    const maxWeek = meetings.reduce((max, row) => Math.max(max, row.end_week), 16);
    return Array.from({ length: maxWeek }, (_, i) => i + 1);
  }, [meetings]);
  const courses = useMemo(
    () => groupCourses(meetings, visualByCode),
    [meetings, visualByCode]
  );
  const weekMeetings = useMemo(
    () =>
      meetings.filter(
        (meeting) =>
          meeting.start_week <= selectedWeek && meeting.end_week >= selectedWeek
      ),
    [meetings, selectedWeek]
  );

  useEffect(() => {
    const minWeek = meetings.reduce(
      (min, row) => Math.min(min, row.start_week),
      Number.POSITIVE_INFINITY
    );
    setSelectedWeek(Number.isFinite(minWeek) ? minWeek : 1);
  }, [termNumber, meetings]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sub">
        加载中...
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
      <header className="mb-4 flex items-start justify-between gap-6">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 h-7 rounded-md border border-sub/15 px-3 text-xs text-sub transition-colors hover:border-sub/35 hover:bg-sub/5 hover:text-ink"
          >
            返回时间轴
          </button>
          <h1 className="text-lg text-ink">学期课表</h1>
          <div className="mt-0.5 text-[11px] text-sub">
            {TERM_LABEL[termNumber]}
            {meta
              ? ` · ${meta.academic_year} ${meta.semester === "fall" ? "第一学期" : "第二学期"}`
              : " · 暂无实际课表数据"}
          </div>
        </div>
        <div className="flex items-center gap-6 pt-1 text-xs">
          <ScheduleStat label="课程" value={`${courses.length} 门`} />
          <ScheduleStat label="片段" value={`${meetings.length} 条`} />
          <ScheduleStat label="当前周" value={`第 ${selectedWeek} 周`} />
          <DisplayMenu value={display} onChange={setDisplay} />
        </div>
      </header>

      <div className="grid grid-cols-[380px_minmax(0,1fr)] items-start gap-5">
        <section className="rounded-xl border border-sub/15 bg-card p-4">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-sm text-ink">课程周次分布</h2>
              <div className="mt-0.5 text-[10px] text-sub">
                长条表示开课周段；颜色沿用时间轴，实线为必修，虚线为选修
              </div>
            </div>
            <div className="shrink-0 rounded-md border border-sub/15 px-2 py-1 text-[11px] text-sub tabular-nums">
              第 {selectedWeek} 周
            </div>
          </div>

          <TermSelector
            value={termNumber}
            availability={availability}
            onChange={onTermChange}
          />

          {meetings.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-sub/20 p-6 text-center text-xs text-sub">
              暂无实际课表数据
            </div>
          ) : (
            <CourseWeekTracks
              courses={courses}
              weeks={weeks}
              selectedWeek={selectedWeek}
              onSelectWeek={setSelectedWeek}
            />
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-sub/15 bg-card p-4">
          {meetings.length === 0 ? (
            <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-sub/20 text-sm text-sub">
              这个学期还没有导入实际课表数据
            </div>
          ) : (
            <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm text-ink">第 {selectedWeek} 周课表</h2>
              <div className="text-[11px] text-sub tabular-nums">
                {weekMeetings.length} 条上课安排
              </div>
            </div>
            <WeeklyGrid
              meetings={weekMeetings}
              display={display}
              visualByCode={visualByCode}
              hoverInfoByCode={hoverInfoByCode}
            />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ScheduleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <div className="text-[10px] uppercase tracking-wide text-sub">{label}</div>
      <div className="text-base text-ink tabular-nums">{value}</div>
    </div>
  );
}

function TermSelector({
  value,
  availability,
  onChange,
}: {
  value: number;
  availability: Map<number, { courses: number; meetings: number }>;
  onChange: (term: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-lg border border-sub/15 bg-sub/5 p-1">
      {TERMS.map((term) => {
        const stats = availability.get(term);
        const active = term === value;
        return (
          <button
            key={term}
            type="button"
            onClick={() => onChange(term)}
            className={
              "group relative h-8 rounded-md border px-1.5 text-center transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] " +
              (active
                ? "border-brand/55 bg-card text-ink shadow-sm"
                : stats
                ? "border-transparent text-sub hover:border-sub/20 hover:bg-card hover:text-ink"
                : "border-transparent text-sub/45 hover:border-sub/15 hover:bg-card/70 hover:text-sub")
            }
          >
            <span className="block truncate text-xs leading-7">{TERM_LABEL[term]}</span>
          </button>
        );
      })}
    </div>
  );
}

function DisplayMenu({
  value,
  onChange,
}: {
  value: Record<DisplayKey, boolean>;
  onChange: (next: Record<DisplayKey, boolean>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="h-7 rounded-lg border border-sub/15 bg-card px-3 text-xs text-sub transition-colors hover:border-sub/30 hover:bg-sub/5 hover:text-ink"
      >
        显示内容
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-36 rounded-lg border border-sub/15 bg-card p-1"
          style={{
            boxShadow: "0 14px 34px rgb(var(--shadow-rgb) / var(--shadow-soft))",
          }}
        >
          {DISPLAY_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-ink hover:bg-sub/5"
            >
              <input
                type="checkbox"
                checked={value[item.key]}
                onChange={(event) =>
                  onChange({ ...value, [item.key]: event.currentTarget.checked })
                }
                className="h-3.5 w-3.5 accent-[rgb(var(--brand)/1)]"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface GroupedCourse {
  key: string;
  courseCode: string;
  sectionCode: string;
  courseName: string;
  teacher: string | null;
  visual: CourseVisual;
  meetings: ActualCourseMeeting[];
}

function CourseWeekTracks({
  courses,
  weeks,
  selectedWeek,
  onSelectWeek,
}: {
  courses: GroupedCourse[];
  weeks: number[];
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
}) {
  const [hoverWeek, setHoverWeek] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const weekAtPointer = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const trackLeft = WEEK_TRACK_LABEL_WIDTH + WEEK_TRACK_GAP;
    const trackWidth = rect.width - trackLeft;
    const x = event.clientX - rect.left - trackLeft;
    if (x < 0 || x > trackWidth) return null;
    const ratio = Math.min(0.999, Math.max(0, x / trackWidth));
    const index = Math.min(weeks.length - 1, Math.floor(ratio * weeks.length));
    return weeks[index] ?? null;
  };

  const moveHover = (event: ReactMouseEvent<HTMLDivElement>) => {
    setHoverWeek(weekAtPointer(event));
  };

  const selectHoverWeek = (event: ReactMouseEvent<HTMLDivElement>) => {
    const week = weekAtPointer(event);
    if (week != null) onSelectWeek(week);
  };

  return (
    <div className="mt-3">
      <div
        ref={trackRef}
        role="slider"
        aria-label="选择课表周次"
        aria-valuemin={weeks[0] ?? 1}
        aria-valuemax={weeks[weeks.length - 1] ?? 1}
        aria-valuenow={selectedWeek}
        tabIndex={0}
        onMouseMove={moveHover}
        onMouseLeave={() => setHoverWeek(null)}
        onClick={selectHoverWeek}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onSelectWeek(Math.max(weeks[0] ?? 1, selectedWeek - 1));
          if (event.key === "ArrowRight") {
            onSelectWeek(Math.min(weeks[weeks.length - 1] ?? selectedWeek, selectedWeek + 1));
          }
        }}
        className="relative cursor-crosshair rounded-lg border border-sub/15 bg-sub/[0.025] p-2 pt-6 outline-none transition-colors focus:border-brand/35"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 top-2"
          style={{
            left: WEEK_TRACK_LABEL_WIDTH + WEEK_TRACK_GAP,
            right: 8,
          }}
        >
          <div
            className="absolute bottom-0 top-0 w-px bg-brand/80 transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ left: `${weekCenterPercent(selectedWeek, weeks)}%` }}
          />
          <div
            className="absolute top-0 h-5 min-w-5 -translate-x-1/2 rounded-sm bg-card px-1 text-center text-[10px] leading-5 text-brand shadow-sm ring-1 ring-brand/25 transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ left: `${weekCenterPercent(selectedWeek, weeks)}%` }}
          >
            {selectedWeek}
          </div>
          {hoverWeek != null && hoverWeek !== selectedWeek && (
            <>
              <div
                className="absolute bottom-0 top-0 w-px border-l border-dashed border-sub/60 transition-[left] duration-150 ease-out"
                style={{ left: `${weekCenterPercent(hoverWeek, weeks)}%` }}
              />
              <div
                className="absolute top-0 h-5 min-w-5 -translate-x-1/2 rounded-sm border border-sub/20 bg-card px-1 text-center text-[10px] leading-5 text-sub shadow-sm transition-[left] duration-150 ease-out"
                style={{ left: `${weekCenterPercent(hoverWeek, weeks)}%` }}
              >
                {hoverWeek}
              </div>
            </>
          )}
        </div>

        <div className="space-y-2">
        {courses.map((course) => (
          <CourseWeekRow
            key={course.key}
            course={course}
            weeks={weeks}
            selectedWeek={selectedWeek}
          />
        ))}
        </div>
      </div>
    </div>
  );
}

function CourseWeekRow({
  course,
  weeks,
  selectedWeek,
}: {
  course: GroupedCourse;
  weeks: number[];
  selectedWeek: number;
}) {
  const { style, isRequired } = course.visual;
  const spans = getCourseWeekSpans(course.meetings);
  return (
    <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: style.color }} />
        <div className="min-w-0">
          <div className="truncate text-[11px]" style={{ color: style.text }} title={course.courseName}>
            {course.courseName}
          </div>
          <div className="text-[9px] text-sub">{isRequired ? "必修" : "选修"}</div>
        </div>
      </div>
      <div className="relative h-7 rounded-md bg-sub/[0.045] text-left transition-colors">
        {spans.map((span) => (
          <span
            key={`${span.start}-${span.end}`}
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              left: `${weekStartPercent(span.start, weeks)}%`,
              width: `${weekSpanPercent(span.start, span.end, weeks)}%`,
              backgroundColor:
                selectedWeek >= span.start && selectedWeek <= span.end
                  ? style.color
                  : style.bgSoft,
              borderColor: style.border,
              borderStyle: isRequired ? "solid" : "dashed",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function getCourseWeekSpans(meetings: ActualCourseMeeting[]) {
  const map = new Map<string, { start: number; end: number }>();
  for (const meeting of meetings) {
    const key = `${meeting.start_week}-${meeting.end_week}`;
    map.set(key, { start: meeting.start_week, end: meeting.end_week });
  }
  return [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function weekStartPercent(week: number, weeks: number[]) {
  const first = weeks[0] ?? 1;
  return ((week - first) / Math.max(1, weeks.length)) * 100;
}

function weekSpanPercent(start: number, end: number, weeks: number[]) {
  return ((end - start + 1) / Math.max(1, weeks.length)) * 100;
}

function weekCenterPercent(week: number, weeks: number[]) {
  const first = weeks[0] ?? 1;
  return ((week - first + 0.5) / Math.max(1, weeks.length)) * 100;
}

function WeeklyGrid({
  meetings,
  display,
  visualByCode,
  hoverInfoByCode,
}: {
  meetings: ActualCourseMeeting[];
  display: Record<DisplayKey, boolean>;
  visualByCode: Map<string, CourseVisual>;
  hoverInfoByCode: Map<string, CourseHoverInfo>;
}) {
  return (
    <div>
      <div className="w-full">
        <div className="mb-2 grid grid-cols-[86px_repeat(7,minmax(0,1fr))] gap-3">
          <div />
          {WEEKDAYS.map((day) => (
            <div key={day.value} className="px-1 text-center text-xs text-sub">
              {day.label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[86px_repeat(7,minmax(0,1fr))] gap-3">
          <TimeAxis />
          {WEEKDAYS.map((day) => (
            <DayColumn
              key={day.value}
              day={day.value}
              meetings={meetings}
              display={display}
              visualByCode={visualByCode}
              hoverInfoByCode={hoverInfoByCode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimeAxis() {
  return (
    <div className="grid auto-rows-[58px]">
      {PERIODS.map((period) => (
        <div key={period.value} className="border-t border-sub/10 pt-1 first:border-t-0">
          <div className="text-[11px] text-ink tabular-nums">第 {period.value} 节</div>
          <div className="mt-0.5 text-[9px] leading-tight text-sub tabular-nums">
            {period.time}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayColumn({
  day,
  meetings,
  display,
  visualByCode,
  hoverInfoByCode,
}: {
  day: number;
  meetings: ActualCourseMeeting[];
  display: Record<DisplayKey, boolean>;
  visualByCode: Map<string, CourseVisual>;
  hoverInfoByCode: Map<string, CourseHoverInfo>;
}) {
  const dayMeetings = mergeParallelMeetings(
    meetings.filter((meeting) => meeting.weekday === day)
  );
  return (
    <div
      className="relative grid auto-rows-[58px] rounded-lg bg-sub/[0.025]"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgb(var(--sub) / 0.10) 1px, transparent 1px)",
        backgroundSize: "100% 58px",
      }}
    >
      {dayMeetings.length === 0 && (
        <div className="row-start-1 row-end-[13] flex items-center justify-center text-[10px] text-sub/45">
          无课
        </div>
      )}
      {dayMeetings.map((meeting, index) => (
        <ScheduleCourseCard
          key={`${meeting.id}-${index}`}
          meeting={meeting}
          visual={visualForMeeting(meeting, visualByCode)}
          hoverInfo={hoverInfoForMeeting(meeting, visualByCode, hoverInfoByCode)}
          display={display}
          gridRow={`${meeting.start_period} / span ${periodSpan(meeting)}`}
        />
      ))}
    </div>
  );
}

function ScheduleCourseCard({
  meeting,
  visual,
  hoverInfo,
  display,
  gridRow,
}: {
  meeting: ActualCourseMeeting;
  visual: CourseVisual;
  hoverInfo: CourseHoverInfo;
  display: Record<DisplayKey, boolean>;
  gridRow?: string;
}) {
  const hover = useHoverIntentTriangle<HTMLDivElement>({ width: 280 });
  const details = [
    display.location && meeting.location_text,
    display.teacher && meeting.teacher,
    display.section && `课序 ${meeting.section_code}`,
    display.classGroup && meeting.class_group,
    display.nature && (meeting.course_nature ?? meeting.course_attribute),
    display.weeks && `${meeting.start_week}-${meeting.end_week}周`,
  ].filter(Boolean);

  return (
    <>
      <div
        ref={hover.anchorRef}
        onMouseEnter={hover.open}
        onMouseLeave={hover.startGuardedClose}
        className="motion-list-item m-0.5 overflow-hidden rounded-md px-2 py-1.5 text-[11px] leading-snug transition-all hover:-translate-y-0.5 hover:shadow-sm"
        style={{
          gridRow,
          backgroundColor: visual.isRequired ? visual.style.bgSoft : visual.style.bgGhost,
          border: `1px ${visual.isRequired ? "solid" : "dashed"} ${visual.style.border}`,
        }}
      >
        <div className="font-medium" style={{ color: visual.style.text }}>
          {meeting.course_name}
        </div>
        <div className="mt-0.5 text-[10px] text-sub tabular-nums">
          第 {meeting.start_period}-{meeting.end_period} 节
        </div>
        {details.length > 0 && (
          <div className="mt-1 space-y-0.5 text-[10px] text-sub/80">
            {details.map((item, index) => (
              <div key={index} className="truncate" title={String(item)}>
                {item}
              </div>
            ))}
          </div>
        )}
      </div>

      {hover.position && (
        <CourseHoverCard
          position={hover.position}
          popoverRef={hover.popoverRef}
          visible={hover.visible}
          item={hoverInfo}
          onMouseEnter={hover.keepOpen}
          onMouseLeave={hover.scheduleClose}
        />
      )}
    </>
  );
}

function periodSpan(meeting: ActualCourseMeeting) {
  return Math.max(1, meeting.end_period - meeting.start_period + 1);
}

function mergeParallelMeetings(meetings: ActualCourseMeeting[]) {
  const map = new Map<string, ActualCourseMeeting>();
  for (const meeting of meetings) {
    const key = [
      meeting.course_code,
      meeting.section_code,
      meeting.start_week,
      meeting.end_week,
      meeting.weekday,
      meeting.start_period,
      meeting.end_period,
      meeting.location_text ?? "",
    ].join("|");
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...meeting });
      continue;
    }
    const teachers = [existing.teacher, meeting.teacher]
      .flatMap((teacher) => (teacher ?? "").split(/[，,、]/))
      .map((teacher) => teacher.trim())
      .filter(Boolean);
    existing.teacher = [...new Set(teachers)].join("、") || existing.teacher;
  }
  return [...map.values()].sort((a, b) => {
    if (a.start_period !== b.start_period) return a.start_period - b.start_period;
    return a.course_name.localeCompare(b.course_name, "zh");
  });
}

function summarizeAvailability(meetings: ActualCourseMeeting[]) {
  const map = new Map<number, { courses: number; meetings: number; courseKeys: Set<string> }>();
  for (const meeting of meetings) {
    const row = map.get(meeting.term) ?? {
      courses: 0,
      meetings: 0,
      courseKeys: new Set<string>(),
    };
    row.meetings += 1;
    row.courseKeys.add(`${meeting.course_code}-${meeting.section_code}-${meeting.source_row}`);
    row.courses = row.courseKeys.size;
    map.set(meeting.term, row);
  }
  return new Map(
    [...map.entries()].map(([term, row]) => [
      term,
      { courses: row.courses, meetings: row.meetings },
    ])
  );
}

function groupCourses(
  meetings: ActualCourseMeeting[],
  visualByCode: Map<string, CourseVisual>
): GroupedCourse[] {
  const map = new Map<string, GroupedCourse>();
  for (const meeting of meetings) {
    const key = `${meeting.course_code}-${meeting.section_code}-${meeting.source_row}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        courseCode: meeting.course_code,
        sectionCode: meeting.section_code,
        courseName: meeting.course_name,
        teacher: meeting.teacher,
        visual: visualForMeeting(meeting, visualByCode),
        meetings: [],
      });
    }
    map.get(key)!.meetings.push(meeting);
  }
  return [...map.values()].sort((a, b) => {
    if (a.visual.categoryCode !== b.visual.categoryCode) {
      return categoryOrder(a.visual.categoryCode) - categoryOrder(b.visual.categoryCode);
    }
    if (a.visual.isRequired !== b.visual.isRequired) {
      return a.visual.isRequired ? -1 : 1;
    }
    return a.courseName.localeCompare(b.courseName, "zh");
  });
}

function buildVisualMap(
  programCourses: CourseWithCategory[],
  records: SemesterCourse[]
): Map<string, CourseVisual> {
  const map = new Map<string, CourseVisual>();
  for (const course of programCourses) {
    map.set(course.course_code, makeVisual(course.category_code, course.course_nature));
  }
  for (const record of records) {
    if (!record.course_code || !record.category_code || !record.course_nature) continue;
    if (!map.has(record.course_code)) {
      map.set(record.course_code, makeVisual(record.category_code, record.course_nature));
    }
  }
  return map;
}

function visualForMeeting(
  meeting: ActualCourseMeeting,
  visualByCode: Map<string, CourseVisual>
): CourseVisual {
  return (
    visualByCode.get(meeting.course_code) ??
    makeVisual(inferCategory(meeting), inferNature(meeting))
  );
}

function hoverInfoForMeeting(
  meeting: ActualCourseMeeting,
  visualByCode: Map<string, CourseVisual>,
  hoverInfoByCode: Map<string, CourseHoverInfo>
): CourseHoverInfo {
  const matched = hoverInfoByCode.get(meeting.course_code);
  if (matched) {
    return {
      ...matched,
      course_name: matched.course_name || meeting.course_name,
      planned_term: matched.planned_term ?? meeting.term,
    };
  }
  const visual = visualForMeeting(meeting, visualByCode);
  return {
    source: "program",
    course_code: meeting.course_code,
    course_name: meeting.course_name,
    credits: 0,
    lecture_hours: 0,
    experiment_hours: 0,
    extra_hours: 0,
    prerequisite_course_code: null,
    prerequisite_course_name: null,
    category_code: visual.categoryCode,
    category_name: visual.style.name,
    course_nature: visual.nature,
    offered_term: null,
    planned_term: meeting.term,
    score: null,
    note: [
      meeting.teacher ? `教师：${meeting.teacher}` : null,
      meeting.location_text ? `地点：${meeting.location_text}` : null,
      `${meeting.start_week}-${meeting.end_week}周 · 周${weekdayText(meeting.weekday)} · 第 ${meeting.start_period}-${meeting.end_period} 节`,
    ]
      .filter(Boolean)
      .join("；"),
    is_interdisciplinary: 0,
    assigned_to: null,
    credit_count_to: null,
  };
}

function makeVisual(categoryCode: CategoryCode, nature: CourseNature): CourseVisual {
  const style = CATEGORY_STYLE[categoryCode] ?? CATEGORY_STYLE.general_education;
  return {
    categoryCode,
    nature,
    style,
    isRequired: nature === "必修",
  };
}

function buildHoverInfoMap(
  programCourses: CourseWithCategory[],
  records: SemesterCourse[]
): Map<string, CourseHoverInfo> {
  const map = new Map<string, CourseHoverInfo>();
  const recordByCode = new Map<string, SemesterCourse>();
  for (const record of records) {
    if (record.course_code) recordByCode.set(record.course_code, record);
  }

  for (const course of programCourses) {
    const record = recordByCode.get(course.course_code);
    map.set(course.course_code, {
      source: "program",
      course_code: course.course_code,
      course_name: course.course_name,
      credits: course.credits,
      lecture_hours: course.lecture_hours,
      experiment_hours: course.experiment_hours,
      extra_hours: course.extra_hours,
      prerequisite_course_code: course.prerequisite_course_code,
      prerequisite_course_name: course.prerequisite_course_name,
      category_code: course.category_code,
      category_name: course.category_name,
      course_nature: course.course_nature,
      offered_term: course.offered_term,
      planned_term: course.actual_term ?? course.planned_term ?? record?.term_number ?? null,
      score: record?.score ?? course.score ?? null,
      note: record?.note ?? course.note ?? null,
      is_interdisciplinary: course.is_interdisciplinary ?? 0,
      assigned_to: course.assigned_to ?? null,
      credit_count_to: course.credit_count_to ?? null,
    });
  }

  for (const record of records) {
    if (!record.course_code || !record.category_code || !record.course_nature) continue;
    if (map.has(record.course_code)) continue;
    const style = CATEGORY_STYLE[record.category_code] ?? CATEGORY_STYLE.general_education;
    map.set(record.course_code, {
      source: record.source === "manual" ? "custom" : "program",
      course_code: record.course_code,
      course_name: record.course_name,
      credits: record.credits,
      lecture_hours: 0,
      experiment_hours: 0,
      extra_hours: 0,
      prerequisite_course_code: null,
      prerequisite_course_name: null,
      category_code: record.category_code,
      category_name: style.name,
      course_nature: record.course_nature,
      offered_term: null,
      planned_term: record.term_number,
      score: record.score,
      note: record.note,
      is_interdisciplinary: record.is_interdisciplinary ?? 0,
      assigned_to: record.assigned_to ?? null,
      credit_count_to: record.credit_count_to ?? null,
    });
  }

  return map;
}

function inferCategory(meeting: ActualCourseMeeting): CategoryCode {
  const raw = `${meeting.course_nature ?? ""} ${meeting.course_attribute ?? ""}`;
  if (/体育|心理|通选|通识/.test(raw)) return "general_education";
  if (/专业/.test(raw)) return "professional_education";
  return "general_education";
}

function inferNature(meeting: ActualCourseMeeting): CourseNature {
  const raw = `${meeting.course_nature ?? ""} ${meeting.course_attribute ?? ""}`;
  if (/必修/.test(raw)) return "必修";
  return "选修";
}

function weekdayText(day: number) {
  return WEEKDAYS.find((weekday) => weekday.value === day)?.label.replace("周", "") ?? String(day);
}

function categoryOrder(code: CategoryCode) {
  const order: CategoryCode[] = [
    "general_education",
    "major_platform",
    "professional_education",
    "quality_education",
    "practice_education",
  ];
  return order.indexOf(code);
}
