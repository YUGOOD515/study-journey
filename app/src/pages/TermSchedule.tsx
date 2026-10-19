import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { CalendarX2, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { CATEGORY_STYLE, type CategoryStyle } from "../lib/categoryStyle";
import { TERM_LABEL } from "../lib/offeredTerm";
import {
  CourseDetailDialog,
  CourseHoverCard,
  type CourseHoverInfo,
} from "../components/CourseHoverCard";
import { useHoverIntentTriangle } from "../hooks/useHoverIntentTriangle";
import { useIsMobile } from "../hooks/useMediaQuery";
import {
  Button,
  EmptyState,
  IconButton,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuLabel,
  MenuTrigger,
  PageError,
  Panel,
  Skeleton,
  Stat,
} from "../components/ui";
import type { ActualCourseMeeting, CategoryCode, Course, CourseNature } from "../types";

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

const DISPLAY_STORAGE_KEY = "study-journey-schedule-display";

function loadDisplay(): Record<DisplayKey, boolean> {
  try {
    const raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY);
    if (raw) return { ...DEFAULT_DISPLAY, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_DISPLAY;
}

interface CourseVisual {
  categoryCode: CategoryCode;
  nature: CourseNature;
  style: CategoryStyle;
  isRequired: boolean;
}

export default function TermSchedule({
  termNumber,
  currentTerm,
  onTermChange,
}: {
  termNumber: number;
  /** 按入学年份推算的“本学期” */
  currentTerm: number;
  onTermChange: (term: number) => void;
}) {
  const [allMeetings, setAllMeetings] = useState<ActualCourseMeeting[]>([]);
  const [programCourses, setProgramCourses] = useState<Course[]>([]);
  const [records, setRecords] = useState<Course[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [display, setDisplay] = useState(loadDisplay);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const isMobile = useIsMobile();

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
  }, [reloadKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(display));
    } catch {
      /* ignore */
    }
  }, [display]);

  const meetings = useMemo(
    () => allMeetings.filter((meeting) => meeting.term === termNumber),
    [allMeetings, termNumber],
  );
  const availability = useMemo(() => summarizeAvailability(allMeetings), [allMeetings]);
  const visualByCode = useMemo(
    () => buildVisualMap(programCourses, records),
    [programCourses, records],
  );
  const hoverInfoByCode = useMemo(
    () => buildHoverInfoMap(programCourses, records),
    [programCourses, records],
  );
  const meta = meetings[0];
  const weeks = useMemo(() => {
    const maxWeek = meetings.reduce((max, row) => Math.max(max, row.end_week), 16);
    return Array.from({ length: maxWeek }, (_, i) => i + 1);
  }, [meetings]);
  const courses = useMemo(() => groupCourses(meetings, visualByCode), [meetings, visualByCode]);
  const weekMeetings = useMemo(
    () =>
      meetings.filter(
        (meeting) => meeting.start_week <= selectedWeek && meeting.end_week >= selectedWeek,
      ),
    [meetings, selectedWeek],
  );

  useEffect(() => {
    const minWeek = meetings.reduce(
      (min, row) => Math.min(min, row.start_week),
      Number.POSITIVE_INFINITY,
    );
    setSelectedWeek(Number.isFinite(minWeek) ? minWeek : 1);
  }, [termNumber, meetings]);

  const firstWeek = weeks[0] ?? 1;
  const lastWeek = weeks[weeks.length - 1] ?? 1;
  const stepWeek = (delta: number) =>
    setSelectedWeek((week) => Math.min(lastWeek, Math.max(firstWeek, week + delta)));

  if (err) return <PageError message={err} onRetry={() => setReloadKey((k) => k + 1)} />;

  const hasData = meetings.length > 0;

  return (
    <div className="mx-auto min-h-[calc(100dvh-3rem)] max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-lg text-ink">学期课表</h1>
          <div className="mt-0.5 text-[11px] text-sub">
            {TERM_LABEL[termNumber]}
            {termNumber === currentTerm && " · 本学期"}
            {loading
              ? ""
              : meta
                ? ` · ${meta.academic_year} ${meta.semester === "fall" ? "第一学期" : "第二学期"}`
                : " · 暂无实际课表数据"}
          </div>
        </div>
        <div className="flex items-end gap-5 text-xs">
          <Stat label="课程" value={loading ? "–" : `${courses.length} 门`} />
          <Stat label="本周安排" value={loading ? "–" : `${weekMeetings.length} 条`} />
          <DisplayMenu value={display} onChange={setDisplay} />
        </div>
      </header>

      <TermSelector
        value={termNumber}
        currentTerm={currentTerm}
        availability={availability}
        onChange={onTermChange}
      />

      {loading ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[480px] rounded-xl" />
          <Skeleton className="hidden h-[480px] rounded-xl lg:block" />
        </div>
      ) : !hasData ? (
        <Panel className="mt-4">
          <EmptyState
            icon={<CalendarX2 size={28} strokeWidth={1.5} />}
            title={`${TERM_LABEL[termNumber]}还没有实际课表数据`}
            description="实际课表来自教务系统导出的上课安排。可以切换到其他学期查看；有数据的学期在上方以深色显示。"
            className="py-16"
          />
        </Panel>
      ) : (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel className="min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <WeekNavigator
                week={selectedWeek}
                first={firstWeek}
                last={lastWeek}
                onStep={stepWeek}
              />
              <div className="num text-[11px] text-sub">{weekMeetings.length} 条上课安排</div>
            </div>
            {isMobile ? (
              <DayList
                meetings={weekMeetings}
                display={display}
                visualByCode={visualByCode}
                hoverInfoByCode={hoverInfoByCode}
              />
            ) : (
              <div className="scroll-fade-x -mx-1 overflow-x-auto px-1 pb-1">
                <div className="min-w-[760px]">
                  <WeeklyGrid
                    meetings={weekMeetings}
                    display={display}
                    visualByCode={visualByCode}
                    hoverInfoByCode={hoverInfoByCode}
                  />
                </div>
              </div>
            )}
          </Panel>

          <Panel className="min-w-0 p-3 sm:p-4 lg:sticky lg:top-16">
            <div className="mb-1">
              <h2 className="text-sm text-ink">课程周次分布</h2>
              <div className="mt-0.5 text-[10px] text-sub">
                长条为开课周段，点击轨道切换周次；实线必修，虚线选修
              </div>
            </div>
            <CourseWeekTracks
              courses={courses}
              weeks={weeks}
              selectedWeek={selectedWeek}
              onSelectWeek={setSelectedWeek}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

function WeekNavigator({
  week,
  first,
  last,
  onStep,
}: {
  week: number;
  first: number;
  last: number;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        label="上一周"
        size="sm"
        variant="secondary"
        disabled={week <= first}
        onClick={() => onStep(-1)}
      >
        <ChevronLeft size={15} />
      </IconButton>
      <div className="num min-w-[92px] text-center text-sm text-ink">
        第 {week} 周<span className="text-[11px] text-faint"> / {last}</span>
      </div>
      <IconButton
        label="下一周"
        size="sm"
        variant="secondary"
        disabled={week >= last}
        onClick={() => onStep(1)}
      >
        <ChevronRight size={15} />
      </IconButton>
    </div>
  );
}

function TermSelector({
  value,
  currentTerm,
  availability,
  onChange,
}: {
  value: number;
  currentTerm: number;
  availability: Map<number, { courses: number; meetings: number }>;
  onChange: (term: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="选择学期"
      className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:grid sm:grid-cols-8 sm:overflow-visible sm:rounded-lg sm:border sm:border-sub/15 sm:bg-sub/5 sm:p-1"
    >
      {TERMS.map((term) => {
        const stats = availability.get(term);
        const active = term === value;
        return (
          <button
            key={term}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onChange(term)}
            title={stats ? `${stats.courses} 门课程` : "暂无课表数据"}
            className={cn(
              "relative flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border px-3 text-xs transition-colors sm:px-1.5",
              active
                ? "border-brand/55 bg-card text-ink shadow-sm"
                : stats
                  ? "border-sub/15 bg-card text-sub hover:border-sub/30 hover:text-ink sm:border-transparent sm:bg-transparent sm:hover:bg-card"
                  : "border-sub/10 text-faint hover:text-sub sm:border-transparent",
            )}
          >
            {TERM_LABEL[term]}
            {term === currentTerm && (
              <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="本学期" />
            )}
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
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={13} />}>
          <span className="hidden sm:inline">显示内容</span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>课程卡片显示</MenuLabel>
        {DISPLAY_ITEMS.map((item) => (
          <MenuCheckboxItem
            key={item.key}
            checked={value[item.key]}
            onCheckedChange={(checked) => onChange({ ...value, [item.key]: Boolean(checked) })}
            onSelect={(event) => event.preventDefault()}
          >
            {item.label}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
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
          <div
            className="truncate text-[11px]"
            style={{ color: style.text }}
            title={course.courseName}
          >
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
                selectedWeek >= span.start && selectedWeek <= span.end ? style.color : style.bgSoft,
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
  const today = todayWeekday();
  return (
    <div className="w-full">
      <div className="mb-1.5 grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-1.5">
        <div />
        {WEEKDAYS.map((day) => (
          <div
            key={day.value}
            className={cn(
              "rounded-md py-1 text-center text-xs",
              day.value === today ? "bg-brand/10 text-brand" : "text-sub",
            )}
          >
            {day.label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-1.5">
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
  );
}

function todayWeekday() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function TimeAxis() {
  return (
    <div className="grid auto-rows-[58px]">
      {PERIODS.map((period) => (
        <div key={period.value} className="border-t border-sub/10 pt-1 first:border-t-0">
          <div className="num text-[11px] text-ink">第 {period.value} 节</div>
          <div className="num mt-0.5 text-[9px] leading-tight text-sub">{period.time}</div>
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
  const dayMeetings = mergeParallelMeetings(meetings.filter((meeting) => meeting.weekday === day));
  return (
    <div
      className="relative grid auto-rows-[58px] rounded-lg bg-sub/[0.025]"
      style={{
        backgroundImage: "linear-gradient(to bottom, rgb(var(--sub) / 0.10) 1px, transparent 1px)",
        backgroundSize: "100% 58px",
      }}
    >
      {dayMeetings.length === 0 && (
        <div className="row-start-1 row-end-[13] flex items-center justify-center text-[10px] text-faint">
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

/** 手机：按天查看 */
function DayList({
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
  const byDay = useMemo(() => {
    const map = new Map<number, ActualCourseMeeting[]>();
    for (const day of WEEKDAYS) {
      map.set(
        day.value,
        mergeParallelMeetings(meetings.filter((m) => m.weekday === day.value)).sort(
          (a, b) => a.start_period - b.start_period,
        ),
      );
    }
    return map;
  }, [meetings]);
  const today = todayWeekday();
  const [day, setDay] = useState(today);
  const rows = byDay.get(day) ?? [];

  return (
    <div>
      <div className="mb-3 grid grid-cols-7 gap-1" role="tablist" aria-label="选择星期">
        {WEEKDAYS.map((item) => {
          const count = byDay.get(item.value)?.length ?? 0;
          const active = item.value === day;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setDay(item.value)}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-lg border text-xs transition-colors",
                active ? "border-brand/50 bg-brand/10 text-brand" : "border-sub/15 text-sub",
                count === 0 && !active && "text-faint",
              )}
            >
              <span>{item.label.slice(1)}</span>
              <span className="num mt-0.5 text-[10px]">{count > 0 ? count : "–"}</span>
              {item.value === today && <span className="sr-only">今天</span>}
            </button>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="这天没有课" description="切换到其他日期或周次看看" className="py-12" />
      ) : (
        <div className="space-y-2">
          {rows.map((meeting, index) => (
            <div
              key={`${meeting.id}-${index}`}
              className="grid grid-cols-[64px_minmax(0,1fr)] gap-2"
            >
              <div className="pt-1.5">
                <div className="num text-xs text-ink">
                  {meeting.start_period}-{meeting.end_period} 节
                </div>
                <div className="num mt-0.5 text-[10px] text-sub">
                  {PERIODS[meeting.start_period - 1]?.time.split("-")[0]}–
                  {PERIODS[meeting.end_period - 1]?.time.split("-")[1]}
                </div>
              </div>
              <ScheduleCourseCard
                meeting={meeting}
                visual={visualForMeeting(meeting, visualByCode)}
                hoverInfo={hoverInfoForMeeting(meeting, visualByCode, hoverInfoByCode)}
                display={display}
                comfortable
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleCourseCard({
  meeting,
  visual,
  hoverInfo,
  display,
  gridRow,
  comfortable = false,
}: {
  meeting: ActualCourseMeeting;
  visual: CourseVisual;
  hoverInfo: CourseHoverInfo;
  display: Record<DisplayKey, boolean>;
  gridRow?: string;
  comfortable?: boolean;
}) {
  const hover = useHoverIntentTriangle<HTMLDivElement>({ width: 280 });
  const [detailOpen, setDetailOpen] = useState(false);
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
        role="button"
        tabIndex={0}
        onMouseEnter={hover.open}
        onMouseLeave={hover.startGuardedClose}
        onClick={() => {
          hover.close();
          setDetailOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setDetailOpen(true);
          }
        }}
        className={cn(
          "motion-list-item cursor-pointer overflow-hidden rounded-md px-2 py-1.5 leading-snug outline-none transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand/50",
          comfortable ? "text-xs" : "m-0.5 text-[11px]",
        )}
        style={{
          gridRow,
          backgroundColor: visual.isRequired ? visual.style.bgSoft : visual.style.bgGhost,
          border: `1px ${visual.isRequired ? "solid" : "dashed"} ${visual.style.border}`,
        }}
      >
        <div className="font-medium" style={{ color: visual.style.text }}>
          {meeting.course_name}
        </div>
        {!comfortable && (
          <div className="num mt-0.5 text-[10px] text-sub">
            第 {meeting.start_period}-{meeting.end_period} 节
          </div>
        )}
        {details.length > 0 && (
          <div
            className={cn(
              "mt-1 text-[10px] text-sub",
              comfortable ? "flex flex-wrap gap-x-3 gap-y-0.5" : "space-y-0.5",
            )}
          >
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
      <CourseDetailDialog open={detailOpen} onOpenChange={setDetailOpen} item={hoverInfo} />
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
    ]),
  );
}

function groupCourses(
  meetings: ActualCourseMeeting[],
  visualByCode: Map<string, CourseVisual>,
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

function buildVisualMap(programCourses: Course[], records: Course[]): Map<string, CourseVisual> {
  const map = new Map<string, CourseVisual>();
  for (const course of programCourses) {
    map.set(course.courseCode, makeVisual(course.categoryCode, course.requirementType));
  }
  for (const record of records) {
    if (!map.has(record.courseCode)) {
      map.set(record.courseCode, makeVisual(record.categoryCode, record.requirementType));
    }
  }
  return map;
}

function visualForMeeting(
  meeting: ActualCourseMeeting,
  visualByCode: Map<string, CourseVisual>,
): CourseVisual {
  return (
    visualByCode.get(meeting.course_code) ??
    makeVisual(inferCategory(meeting), inferNature(meeting))
  );
}

function hoverInfoForMeeting(
  meeting: ActualCourseMeeting,
  visualByCode: Map<string, CourseVisual>,
  hoverInfoByCode: Map<string, CourseHoverInfo>,
): CourseHoverInfo {
  const matched = hoverInfoByCode.get(meeting.course_code);
  if (matched) {
    return {
      ...matched,
      courseName: matched.courseName || meeting.course_name,
      plannedTerm: matched.plannedTerm ?? meeting.term,
    };
  }
  const visual = visualForMeeting(meeting, visualByCode);
  return {
    source: "program",
    courseCode: meeting.course_code,
    courseName: meeting.course_name,
    credits: 0,
    categoryCode: visual.categoryCode,
    categoryName: visual.style.name,
    requirementType: visual.nature,
    plannedTerm: meeting.term,
    score: null,
    note: [
      meeting.teacher ? `教师：${meeting.teacher}` : null,
      meeting.location_text ? `地点：${meeting.location_text}` : null,
      `${meeting.start_week}-${meeting.end_week}周 · 周${weekdayText(meeting.weekday)} · 第 ${meeting.start_period}-${meeting.end_period} 节`,
    ]
      .filter(Boolean)
      .join("；"),
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
  programCourses: Course[],
  records: Course[],
): Map<string, CourseHoverInfo> {
  const map = new Map<string, CourseHoverInfo>();
  const recordByCode = new Map<string, Course>();
  for (const record of records) {
    recordByCode.set(record.courseCode, record);
  }

  for (const course of programCourses) {
    const record = recordByCode.get(course.courseCode);
    map.set(course.courseCode, {
      source: course.source,
      courseCode: course.courseCode,
      courseName: course.courseName,
      credits: course.credits,
      lectureHours: course.lectureHours,
      experimentHours: course.experimentHours,
      extraHours: course.extraHours,
      prerequisiteCourseCode: course.prerequisiteCourseCode,
      prerequisiteCourseName: course.prerequisiteCourseName,
      categoryCode: course.categoryCode,
      categoryName: course.categoryName,
      requirementType: course.requirementType,
      officialTerm: course.officialTerm,
      plannedTerm:
        course.actualTerm ??
        course.plannedTerm ??
        record?.actualTerm ??
        record?.plannedTerm ??
        null,
      score: record?.score ?? course.score ?? null,
      note: record?.note ?? course.note ?? null,
      creditCountTo: course.creditCountTo,
    });
  }

  for (const record of records) {
    if (map.has(record.courseCode)) continue;
    const style = CATEGORY_STYLE[record.categoryCode] ?? CATEGORY_STYLE.general_education;
    map.set(record.courseCode, {
      source: record.source,
      courseCode: record.courseCode,
      courseName: record.courseName,
      credits: record.credits,
      categoryCode: record.categoryCode,
      categoryName: style.name,
      requirementType: record.requirementType,
      plannedTerm: record.actualTerm ?? record.plannedTerm,
      score: record.score,
      note: record.note,
      creditCountTo: record.creditCountTo,
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
