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
  Badge,
  Button,
  EmptyState,
  IconButton,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuLabel,
  MenuTrigger,
  Metric,
  Page,
  PageError,
  PageHeader,
  Panel,
  Skeleton,
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

const WEEK_TRACK_LABEL_WIDTH = 120;
const WEEK_TRACK_GAP = 12;

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
  const semesterText = meta ? (
    <span>
      <span className="num">{meta.academic_year}</span> 学年{meta.semester === "fall" ? "第一学期" : "第二学期"}
    </span>
  ) : null;

  return (
    <Page>
      <PageHeader
        title="学期课表"
        meta={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-ink">{TERM_LABEL[termNumber]}</span>
            {termNumber === currentTerm && <Badge tone="brand">本学期</Badge>}
            {!loading && (semesterText ?? <span>暂无实际课表数据</span>)}
          </span>
        }
        metrics={
          <>
            <Metric label="课程" value={loading ? "–" : courses.length} unit="门" />
            <Metric label={`第 ${selectedWeek} 周安排`} value={loading ? "–" : weekMeetings.length} unit="次" />
          </>
        }
        toolbar={
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <TermSelector
              value={termNumber}
              currentTerm={currentTerm}
              availability={availability}
              onChange={onTermChange}
            />
            <DisplayMenu value={display} onChange={setDisplay} />
          </div>
        }
      />

      {loading ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[680px]" />
          <Skeleton className="hidden h-[360px] lg:block" />
        </div>
      ) : !hasData ? (
        <Panel className="mt-6">
          <EmptyState
            icon={<CalendarX2 strokeWidth={1.5} />}
            title={`${TERM_LABEL[termNumber]}还没有实际课表数据`}
            description="实际课表来自教务系统导出的上课安排。可切换到其他学期查看，文字较浅的学期暂无数据。"
            className="py-16"
          />
        </Panel>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel className="min-w-0 overflow-hidden">
            <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-3 sm:px-4">
              <WeekNavigator week={selectedWeek} first={firstWeek} last={lastWeek} onStep={stepWeek} />
              <span className="text-2xs text-sub">
                <span className="num text-ink">{weekMeetings.length}</span> 次上课
              </span>
            </div>
            {isMobile ? (
              <DayList
                meetings={weekMeetings}
                display={display}
                visualByCode={visualByCode}
                hoverInfoByCode={hoverInfoByCode}
              />
            ) : (
              <div className="overflow-x-auto">
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

          <Panel className="min-w-0 overflow-hidden lg:sticky lg:top-16">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">课程周次分布</h2>
              <p className="mt-0.5 text-2xs text-sub">色条为开课周段，深色表示所选周在上课；点击轨道切换周次。</p>
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
    </Page>
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
      <IconButton label="上一周" size="sm" variant="secondary" disabled={week <= first} onClick={() => onStep(-1)}>
        <ChevronLeft />
      </IconButton>
      <div className="min-w-[96px] text-center text-xs text-ink">
        第 <span className="num font-semibold">{week}</span> 周
        <span className="text-faint">
          {" "}
          / <span className="num">{last}</span>
        </span>
      </div>
      <IconButton label="下一周" size="sm" variant="secondary" disabled={week >= last} onClick={() => onStep(1)}>
        <ChevronRight />
      </IconButton>
    </div>
  );
}

/** 学期选择：与页头工具栏同高的分段条；无数据的学期文字变浅 */
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
      className="no-scrollbar flex min-w-0 overflow-x-auto"
    >
      <div className="flex h-8 shrink-0 rounded bg-fill-strong p-0.5">
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
                "relative flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-sm px-2.5 text-xs transition-colors",
                active
                  ? "bg-card font-medium text-ink shadow-[0_0_0_1px_rgb(var(--line-strong))]"
                  : stats
                    ? "text-sub hover:text-ink"
                    : "text-faint hover:text-sub",
              )}
            >
              {TERM_LABEL[term]}
              {term === currentTerm && <span className="h-1 w-1 rounded-full bg-brand" aria-label="本学期" />}
            </button>
          );
        })}
      </div>
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
        <Button size="md" variant="secondary" icon={<SlidersHorizontal />} className="shrink-0" aria-label="显示内容">
          <span className="hidden sm:inline">显示</span>
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>课程块显示</MenuLabel>
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

/** 轨道区左右内边距（与 px-4 一致），用于把指针位置换算成周次 */
const TRACK_PAD_X = 16;

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
  const first = weeks[0] ?? 1;
  const last = weeks[weeks.length - 1] ?? 1;

  const weekAtPointer = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const trackLeft = TRACK_PAD_X + WEEK_TRACK_LABEL_WIDTH + WEEK_TRACK_GAP;
    const trackWidth = rect.width - trackLeft - TRACK_PAD_X;
    const x = event.clientX - rect.left - trackLeft;
    if (x < 0 || x > trackWidth) return null;
    const ratio = Math.min(0.999, Math.max(0, x / trackWidth));
    const index = Math.min(weeks.length - 1, Math.floor(ratio * weeks.length));
    return weeks[index] ?? null;
  };

  // 刻度：首周、每 4 周、末周
  const ticks = weeks.filter((w) => w === first || w === last || w % 4 === 0);

  const overlay = { left: TRACK_PAD_X + WEEK_TRACK_LABEL_WIDTH + WEEK_TRACK_GAP, right: TRACK_PAD_X };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="选择课表周次"
      aria-valuemin={first}
      aria-valuemax={last}
      aria-valuenow={selectedWeek}
      aria-valuetext={`第 ${selectedWeek} 周`}
      tabIndex={0}
      onMouseMove={(e) => setHoverWeek(weekAtPointer(e))}
      onMouseLeave={() => setHoverWeek(null)}
      onClick={(e) => {
        const week = weekAtPointer(e);
        if (week != null) onSelectWeek(week);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onSelectWeek(Math.max(first, selectedWeek - 1));
        if (event.key === "ArrowRight") onSelectWeek(Math.min(last, selectedWeek + 1));
      }}
      className="relative cursor-crosshair px-4 pb-4 pt-3 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      {/* 周次刻度 */}
      <div className="relative mb-2 h-4" style={{ marginLeft: WEEK_TRACK_LABEL_WIDTH + WEEK_TRACK_GAP }} aria-hidden>
        {ticks.map((w) => (
          <span
            key={w}
            className="num absolute top-0 -translate-x-1/2 text-2xs text-faint"
            style={{ left: `${weekCenterPercent(w, weeks)}%` }}
          >
            {w}
          </span>
        ))}
      </div>

      {/* 选中周 / 悬停周 指示线 */}
      <div aria-hidden className="pointer-events-none absolute bottom-4 top-3" style={overlay}>
        {hoverWeek != null && hoverWeek !== selectedWeek && (
          <div className="absolute bottom-0 top-5 w-px bg-line-strong" style={{ left: `${weekCenterPercent(hoverWeek, weeks)}%` }} />
        )}
        <div className="absolute bottom-0 top-5 w-px bg-ink" style={{ left: `${weekCenterPercent(selectedWeek, weeks)}%` }} />
        <div
          className="num absolute top-0 h-4 min-w-4 -translate-x-1/2 rounded-sm bg-ink px-1 text-center text-2xs leading-4 text-bg"
          style={{ left: `${weekCenterPercent(selectedWeek, weeks)}%` }}
        >
          {selectedWeek}
        </div>
      </div>

      <div className="divide-y divide-line">
        {courses.map((course) => (
          <CourseWeekRow key={course.key} course={course} weeks={weeks} selectedWeek={selectedWeek} />
        ))}
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
    <div
      className="grid h-9 items-center"
      style={{ gridTemplateColumns: `${WEEK_TRACK_LABEL_WIDTH}px minmax(0,1fr)`, columnGap: WEEK_TRACK_GAP }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: style.color }} aria-hidden />
        <span className="truncate text-2xs text-ink" title={course.courseName}>
          {course.courseName}
        </span>
        <span className="shrink-0 text-2xs text-faint">{isRequired ? "必" : "选"}</span>
      </div>
      <div className="relative h-full">
        {spans.map((span) => {
          const active = selectedWeek >= span.start && selectedWeek <= span.end;
          return (
            <span
              key={`${span.start}-${span.end}`}
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm transition-opacity"
              style={{
                left: `${weekStartPercent(span.start, weeks)}%`,
                width: `${weekSpanPercent(span.start, span.end, weeks)}%`,
                backgroundColor: style.color,
                opacity: active ? 1 : 0.3,
              }}
            />
          );
        })}
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

/** 单节课行高（px）。网格线、时间轴、课程块都按这一基准对齐。 */
const ROW_H = 52;
/** 午休（第 5/6 节之间）与晚课（第 9/10 节之间）分界，用深一级分隔线标出 */
const BREAK_AFTER = [5, 9];

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
    <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
      {/* 表头 */}
      <div className="h-8 border-b border-line" />
      {WEEKDAYS.map((day) => (
        <div
          key={day.value}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 border-b border-l border-line text-2xs",
            day.value === today ? "font-semibold text-ink" : "text-sub",
          )}
        >
          {day.label}
          {day.value === today && <span className="h-1 w-1 rounded-full bg-brand" aria-label="今天" />}
        </div>
      ))}

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
  );
}

function todayWeekday() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function TimeAxis() {
  return (
    <div className="grid" style={{ gridAutoRows: ROW_H }}>
      {PERIODS.map((period) => (
        <div
          key={period.value}
          className={cn(
            "border-t px-2 pt-1.5 first:border-t-0",
            BREAK_AFTER.includes(period.value - 1) ? "border-line-strong" : "border-line",
          )}
        >
          <div className="text-2xs text-ink">
            第 <span className="num">{period.value}</span> 节
          </div>
          <div className="num text-2xs text-faint">{period.time.split("-")[0]}</div>
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
  const weekend = day >= 6;
  return (
    <div
      className={cn("relative grid border-l border-line", weekend && "bg-fill")}
      style={{
        gridAutoRows: ROW_H,
        backgroundImage: "linear-gradient(to bottom, rgb(var(--line)) 1px, transparent 1px)",
        backgroundSize: `100% ${ROW_H}px`,
      }}
    >
      {BREAK_AFTER.map((p) => (
        <div key={p} aria-hidden className="pointer-events-none absolute inset-x-0 h-px bg-line-strong" style={{ top: p * ROW_H }} />
      ))}
      {/* 首行没有上边线：覆盖 0px 处的渐变线 */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ backgroundColor: weekend ? "rgb(var(--fill))" : "rgb(var(--card))" }} />
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
      <div className="grid grid-cols-7 border-b border-line" role="tablist" aria-label="选择星期">
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
                "relative flex h-12 flex-col items-center justify-center text-xs transition-colors",
                active ? "font-semibold text-ink" : count === 0 ? "text-faint" : "text-sub",
              )}
            >
              <span className="flex items-center gap-1">
                {item.label.slice(1)}
                {item.value === today && <span className="h-1 w-1 rounded-full bg-brand" aria-label="今天" />}
              </span>
              <span className="num mt-0.5 text-2xs font-normal">{count > 0 ? count : "–"}</span>
              {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-sm bg-ink" aria-hidden />}
            </button>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="这天没有课" description="切换到其他日期或周次查看。" className="py-12" />
      ) : (
        <div className="divide-y divide-line">
          {rows.map((meeting, index) => (
            <div key={`${meeting.id}-${index}`} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-3 py-2.5">
              <div className="pt-1">
                <div className="text-xs text-ink">
                  <span className="num">
                    {meeting.start_period}–{meeting.end_period}
                  </span>{" "}
                  节
                </div>
                <div className="num mt-0.5 text-2xs text-faint">
                  {PERIODS[meeting.start_period - 1]?.time.split("-")[0]}
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
    display.weeks && `${meeting.start_week}–${meeting.end_week} 周`,
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
          "relative z-[1] min-w-0 cursor-pointer overflow-hidden rounded py-1.5 pl-2.5 pr-2 text-2xs transition-[filter] hover:brightness-[0.97] dark:hover:brightness-110",
          comfortable ? "" : "m-1",
        )}
        style={{
          gridRow,
          backgroundColor: visual.isRequired ? visual.style.bgSoft : "rgb(var(--card))",
          boxShadow: `inset 2px 0 0 ${visual.style.color}, inset 0 0 0 1px ${visual.isRequired ? "transparent" : "rgb(var(--line-strong))"}`,
        }}
      >
        <div className={cn("font-medium text-ink", comfortable ? "text-xs" : "line-clamp-2 text-2xs")}>
          {meeting.course_name}
        </div>
        {!comfortable && (
          <div className="mt-0.5 text-sub">
            <span className="num">
              {meeting.start_period}–{meeting.end_period}
            </span>{" "}
            节
          </div>
        )}
        {details.length > 0 && (
          <div className={cn("mt-0.5 text-sub", comfortable ? "flex flex-wrap gap-x-3 gap-y-0.5" : "")}>
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
      `${meeting.start_week}-${meeting.end_week}周，周${weekdayText(meeting.weekday)}，第 ${meeting.start_period}-${meeting.end_period} 节`,
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
