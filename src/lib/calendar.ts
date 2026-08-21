import { RRule } from "rrule";
import type { Options as RRuleOptions } from "rrule";
import type {
    CalendarEvent,
    CalendarSettings,
    EventException,
} from "../types/calendar";

export const HOUR_HEIGHT = 56;
export const DAY_COLUMN_MIN_WIDTH = 180;
// The shortest an event block is ever drawn, regardless of its actual
// duration or how small HOUR_HEIGHT is -- deliberately *not* derived from
// HOUR_HEIGHT (unlike the old HOUR_HEIGHT/4 floor this replaces), so the
// grid's overall density and "can the shortest event show its title" are
// two independent knobs. 18px is exactly a text-xs line (16px) plus the
// event box's 1px top/bottom border, with zero vertical padding -- see
// CalendarPage.tsx, which drops padding specifically for a block clamped
// to this height, since there's no room to spare for it here.
export const MIN_EVENT_HEIGHT = 18;

export function startOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

export function addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export function getWeekStart(date: Date, weekStart: number) {
    const result = startOfDay(date);
    const difference = (result.getDay() - weekStart + 7) % 7;
    result.setDate(result.getDate() - difference);
    return result;
}

export function formatDate(date: Date, settings: CalendarSettings) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    if (settings.dateFormat === "DD/MM/YYYY") return `${day}/${month}/${year}`;
    if (settings.dateFormat === "YYYY-MM-DD") return `${year}-${month}-${day}`;
    return `${month}/${day}/${year}`;
}

export function formatTime(date: Date, settings: CalendarSettings) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: settings.timeFormat === "12h",
    }).format(date);
}

/** `date`'s wall-clock hour/minute for a compact 12-hour range endpoint --
 *  minutes dropped entirely on the hour ("5", not "5:00"), and the AM/PM
 *  period split out so a caller sharing one period across both ends of a
 *  range can omit it on the first. */
function compactTimeParts(
    date: Date,
    timeZone: string,
): { hourMinute: string; period: string } {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "12";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    const period = parts.find((part) => part.type === "dayPeriod")?.value ?? "AM";
    return { hourMinute: minute === "00" ? hour : `${hour}:${minute}`, period };
}

/** A timed event's start-end range, compact enough for a narrow event
 *  block: "5:30 - 7PM", "5 - 9:15PM", "11AM - 12:30PM". In 12-hour mode,
 *  the start time's own AM/PM is dropped whenever it matches the end
 *  time's -- shared context a reader infers same as they would from
 *  someone saying "five to seven" out loud. 24-hour mode has no period to
 *  share, so both ends are just formatTime's own "HH:MM". */
export function formatEventTimeRange(
    startsAt: string,
    endsAt: string,
    settings: CalendarSettings,
): string {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (settings.timeFormat !== "12h") {
        return `${formatTime(start, settings)} - ${formatTime(end, settings)}`;
    }
    const startParts = compactTimeParts(start, settings.timeZone);
    const endParts = compactTimeParts(end, settings.timeZone);
    const startLabel =
        startParts.period === endParts.period
            ? startParts.hourMinute
            : `${startParts.hourMinute}${startParts.period}`;
    return `${startLabel} - ${endParts.hourMinute}${endParts.period}`;
}

export function formatHour(hour: number, settings: CalendarSettings) {
    const date = new Date(2000, 0, 1, hour, 0);
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: settings.timeFormat === "12h",
    }).format(date);
}

export function formatDayName(date: Date, settings: CalendarSettings) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        weekday: "short",
    }).format(date);
}

export function formatMonthDay(date: Date, settings: CalendarSettings) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        month: "short",
        day: "numeric",
    }).format(date);
}

export function sameCalendarDay(a: Date, b: Date, timeZone: string) {
    const parts = (value: Date) =>
        new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(value);
    return parts(a) === parts(b);
}

export function localWallTimeToUtcIso(date: Date, timeZone: string) {
    const desiredWallUtc = Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
    );
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(desiredWallUtc));
    const get = (type: string) =>
        Number(parts.find((part) => part.type === type)?.value);
    const actualWallUtc = Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
    );
    const offset = actualWallUtc - desiredWallUtc;
    return new Date(desiredWallUtc - offset).toISOString();
}

export function zonedDateTimeToUtcIso(
    date: Date,
    hour: number,
    minute: number,
    timeZone: string,
) {
    const wall = new Date(date);
    wall.setHours(hour, minute, 0, 0);
    return localWallTimeToUtcIso(wall, timeZone);
}

export interface EventDaySegment {
    top: number;
    height: number;
    /** This day's slice is a continuation from an earlier day -- it has no
     *  real start edge here (draw its top corners square). */
    continuesFromPrevDay: boolean;
    /** This day's slice continues into a later day -- it has no real end
     *  edge here (draw its bottom corners square). */
    continuesToNextDay: boolean;
}

/** Where and how tall to draw `day`'s slice of an event that may span
 *  multiple days, clamped to that day's [00:00, 24:00) bounds. Returns null
 *  if the event doesn't touch `day` at all. */
export function eventTopAndHeight(
    startsAt: string,
    endsAt: string,
    day: Date,
    timeZone: string,
): EventDaySegment | null {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const dayValue = dateInputValue(day, timeZone);
    const startDayValue = dateInputValue(start, timeZone);
    // endsAt is exclusive -- an event ending exactly at midnight doesn't
    // occupy that day, so use the instant just before it to find its day.
    const endDayValue = dateInputValue(new Date(end.getTime() - 1), timeZone);

    if (dayValue < startDayValue || dayValue > endDayValue) return null;

    const wallMinutes = (value: Date) => {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(value);
        const hour = Number(
            parts.find((part) => part.type === "hour")?.value,
        );
        const minute = Number(
            parts.find((part) => part.type === "minute")?.value,
        );
        return hour * 60 + minute;
    };

    const continuesFromPrevDay = dayValue !== startDayValue;
    const continuesToNextDay = dayValue !== endDayValue;
    const startMinutes = continuesFromPrevDay ? 0 : wallMinutes(start);
    const endMinutes = continuesToNextDay ? 24 * 60 : wallMinutes(end);

    const top = startMinutes * (HOUR_HEIGHT / 60);
    const height = Math.max(
        MIN_EVENT_HEIGHT,
        (endMinutes - startMinutes) * (HOUR_HEIGHT / 60),
    );
    return { top, height, continuesFromPrevDay, continuesToNextDay };
}

/** Events starting within this many minutes of each other split the day
 *  column's width evenly, side by side, rather than cascading. */
const SAME_SLOT_WINDOW_MINUTES = 20;
/** How far each subsequent overlapping band is pushed in from the left, as
 *  a fraction of the day column's width -- a later band renders on top of
 *  (higher z-index than) earlier ones, so the earlier band's left sliver
 *  stays visible as a cascade instead of being fully covered. */
const BAND_INDENT_FRACTION = 0.16;
/** Caps how far indentation can push in, so a band deep in a cascade still
 *  keeps a usable minimum width instead of being squeezed to nothing. */
const MAX_BAND_INDENT_FRACTION = 0.64;

export interface TimedEventLayoutItem extends EventDaySegment {
    event: CalendarEvent;
    /** CSS calc() expression, relative to the day column's own width. */
    left: string;
    width: string;
    zIndex: number;
    /** True when a later (higher z-index) band's event time-overlaps this
     *  one, meaning it's cascaded on top and would cover this event's own
     *  time/location text -- callers should hide that text rather than let
     *  it render underneath the covering event. */
    coveredByLaterEvent: boolean;
}

interface TimedEventSegment extends EventDaySegment {
    event: CalendarEvent;
    startMinutes: number;
    endMinutes: number;
}

/** Lays out one day's timed events: events starting at the same time or
 *  within SAME_SLOT_WINDOW_MINUTES of each other split the column's width
 *  evenly (a "band"); a later band that still overlaps an earlier one in
 *  time -- just not close enough in start time to share its band -- cascades
 *  instead, indented from the left and layered on top of it. Events with no
 *  overlap at all each get the column's full width, as before. */
export function layoutTimedEventsForDay(
    events: CalendarEvent[],
    day: Date,
    timeZone: string,
): TimedEventLayoutItem[] {
    const segments: TimedEventSegment[] = events
        .map((event) => {
            const segment = eventTopAndHeight(
                event.startsAt,
                event.endsAt,
                day,
                timeZone,
            );
            if (!segment) return null;
            // Segment top/height are already clipped to this day's
            // [00:00, 24:00) -- converting back to minutes here means
            // grouping is based on each event's *visible* start/end within
            // this specific day, not a real start on an earlier day.
            const startMinutes = segment.top / (HOUR_HEIGHT / 60);
            const endMinutes =
                startMinutes + segment.height / (HOUR_HEIGHT / 60);
            return { event, startMinutes, endMinutes, ...segment };
        })
        .filter((item): item is TimedEventSegment => item !== null)
        .sort(
            (a, b) =>
                a.startMinutes - b.startMinutes ||
                a.endMinutes - b.endMinutes,
        );

    const result: TimedEventLayoutItem[] = [];
    let clusterStart = 0;
    let clusterMaxEnd = segments[0]?.endMinutes ?? 0;

    // Connected-component clustering by time overlap: a run of mutually
    // touching events gets laid out together as one cascade; a gap with no
    // overlap closes the cluster and starts a fresh one at full width.
    for (let i = 1; i <= segments.length; i++) {
        const next = segments[i];
        if (next && next.startMinutes < clusterMaxEnd) {
            clusterMaxEnd = Math.max(clusterMaxEnd, next.endMinutes);
            continue;
        }
        layoutTimedEventCluster(segments.slice(clusterStart, i), result);
        if (next) {
            clusterStart = i;
            clusterMaxEnd = next.endMinutes;
        }
    }

    return result;
}

function layoutTimedEventCluster(
    cluster: TimedEventSegment[],
    result: TimedEventLayoutItem[],
) {
    // Sub-groups the cluster into "bands" of events that all start within
    // SAME_SLOT_WINDOW_MINUTES of the band's own first (earliest) event --
    // anchored to the band's start rather than chained event-to-event, so a
    // band can't drift arbitrarily wide through a long run of events each
    // just barely within the window of the previous one.
    const bands: TimedEventSegment[][] = [];
    for (const segment of cluster) {
        const band = bands[bands.length - 1];
        const anchorStart = band?.[0].startMinutes;
        if (
            band &&
            anchorStart !== undefined &&
            segment.startMinutes - anchorStart <= SAME_SLOT_WINDOW_MINUTES
        ) {
            band.push(segment);
        } else {
            bands.push([segment]);
        }
    }

    bands.forEach((band, bandIndex) => {
        const indent = Math.min(
            bandIndex * BAND_INDENT_FRACTION,
            MAX_BAND_INDENT_FRACTION,
        );
        const slotFraction = (1 - indent) / band.length;
        // A later band's event only actually covers this one -- and so
        // should hide its time/location -- if their time ranges genuinely
        // overlap; being in the same cluster doesn't guarantee that (a
        // cluster can chain together several bands where only adjacent
        // ones truly overlap).
        const laterBands = bands.slice(bandIndex + 1);
        band.forEach((segment, slotIndex) => {
            const leftFraction = indent + slotIndex * slotFraction;
            const coveredByLaterEvent = laterBands.some((laterBand) =>
                laterBand.some(
                    (later) =>
                        segment.startMinutes < later.endMinutes &&
                        later.startMinutes < segment.endMinutes,
                ),
            );
            result.push({
                event: segment.event,
                top: segment.top,
                height: segment.height,
                continuesFromPrevDay: segment.continuesFromPrevDay,
                continuesToNextDay: segment.continuesToNextDay,
                left: `calc(4px + (100% - 8px) * ${leftFraction} + 1px)`,
                width: `calc((100% - 8px) * ${slotFraction} - 2px)`,
                zIndex: 10 + bandIndex,
                coveredByLaterEvent,
            });
        });
    });
}

export function dateInputValue(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    return `${year}-${month}-${day}`;
}

export function timeInputValue(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    return `${parts.find((part) => part.type === "hour")?.value ?? "00"}:${parts.find((part) => part.type === "minute")?.value ?? "00"}`;
}

export function inputValuesToUtcIso(
    dateValue: string,
    timeValue: string,
    timeZone: string,
) {
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
    const wall = new Date(year, month - 1, day, hour, minute, 0, 0);
    return localWallTimeToUtcIso(wall, timeZone);
}

/** Adds `days` to a "YYYY-MM-DD" value using pure calendar-date arithmetic
 *  (anchored to UTC internally), so it can't drift a day from the caller's
 *  timeZone the way mixing this with a locale-aware Date would. */
export function addDaysToDateValue(dateValue: string, days: number): string {
    const [year, month, day] = dateValue.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
        date.getUTCDate(),
    ).padStart(2, "0")}`;
}

/** Whether an event's [startsAt, endsAt) span touches `day` at all, comparing
 *  calendar dates rather than exact instants -- used both to place all-day
 *  bars under a day's header and to decide which timed events get a slice
 *  drawn in that day's hourly column. */
export function eventOverlapsDay(
    event: CalendarEvent,
    day: Date,
    timeZone: string,
): boolean {
    const dayValue = dateInputValue(day, timeZone);
    const startValue = dateInputValue(new Date(event.startsAt), timeZone);
    const endValue = dateInputValue(
        new Date(new Date(event.endsAt).getTime() - 1),
        timeZone,
    );
    return dayValue >= startValue && dayValue <= endValue;
}

export interface AllDayLayoutItem {
    event: CalendarEvent;
    /** 0-based day-column index into the visible days, clamped to them. */
    startCol: number;
    endCol: number;
    /** Which stacked row to draw this bar in, so overlapping events don't collide. */
    row: number;
}

/** Lays out a set of all-day events as horizontal bars spanning the day
 *  columns they cover (clamped to `days`), greedily packing non-overlapping
 *  events into shared rows. Multi-day events are sorted ahead of single-day
 *  ones (each group still ordered by start column) so they claim the topmost
 *  rows -- they're the ones a day-level "+N more" truncation must never
 *  hide, so keeping them low-numbered means the truncation logic can simply
 *  always include whatever's in those rows. */
export function layoutAllDayEvents(
    events: CalendarEvent[],
    days: Date[],
    timeZone: string,
): AllDayLayoutItem[] {
    const dayValues = days.map((day) => dateInputValue(day, timeZone));

    const spans = events
        .map((event) => {
            const startValue = dateInputValue(
                new Date(event.startsAt),
                timeZone,
            );
            const endValue = dateInputValue(
                new Date(new Date(event.endsAt).getTime() - 1),
                timeZone,
            );
            const foundStart = dayValues.findIndex(
                (value) => value >= startValue,
            );
            const startCol = Math.max(0, foundStart);
            let endCol = dayValues.length - 1;
            for (let i = dayValues.length - 1; i >= 0; i--) {
                if (dayValues[i] <= endValue) {
                    endCol = i;
                    break;
                }
            }
            return { event, startCol, endCol };
        })
        .sort((a, b) => {
            const aMultiDay = a.endCol > a.startCol;
            const bMultiDay = b.endCol > b.startCol;
            if (aMultiDay !== bMultiDay) return aMultiDay ? -1 : 1;
            return a.startCol - b.startCol || a.endCol - b.endCol;
        });

    const rowEnds: number[] = [];
    return spans.map(({ event, startCol, endCol }) => {
        let row = rowEnds.findIndex((end) => end < startCol);
        if (row === -1) {
            row = rowEnds.length;
            rowEnds.push(endCol);
        } else {
            rowEnds[row] = endCol;
        }
        return { event, startCol, endCol, row };
    });
}

/** Horizontal position for an all-day bar, as a percentage of the day-column
 *  area (past a fixed-width gutter, if any) -- keeps a spanning bar aligned
 *  with its day columns responsively, without measuring anything in JS. */
export function allDayBarLeft(
    startCol: number,
    totalDays: number,
    gutterPx = 0,
): string {
    return `calc(${gutterPx}px + (100% - ${gutterPx}px) * ${startCol / totalDays} + 2px)`;
}

export function allDayBarWidth(
    startCol: number,
    endCol: number,
    totalDays: number,
    gutterPx = 0,
): string {
    return `calc((100% - ${gutterPx}px) * ${(endCol - startCol + 1) / totalDays} - 4px)`;
}

// --- Recurrence -------------------------------------------------------

/** RRULE weekday codes, indexed by the same convention as Date.getDay()
 *  (0=Sunday..6=Saturday) -- NOT rrule's own internal weekday numbering
 *  (which starts at Monday=0), so never index this with a value read back
 *  out of the rrule library itself. */
const RRULE_DAY_CODES = [
    "SU",
    "MO",
    "TU",
    "WE",
    "TH",
    "FR",
    "SA",
] as const;

/** Date.getDay()-style weekday index (0=Sunday..6=Saturday) for a
 *  "YYYY-MM-DD" value, computed via UTC-anchored construction so it can't
 *  drift a day the way a locale/DST-sensitive local Date could. */
export function weekdayIndexOfDateValue(dateValue: string): number {
    const [year, month, day] = dateValue.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Which occurrence of its weekday `dateValue` is within its month (e.g. 3
 *  for the third Tuesday), or -1 if it's the last occurrence of that
 *  weekday in the month -- used both to build and to describe the "Monthly
 *  on the same day" preset. -1 matters because a literal "5th Tuesday"
 *  produces zero occurrences in most months; "last Tuesday" always fires. */
export function ordinalWeekdayOfMonth(dateValue: string): number {
    const [year, month, day] = dateValue.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day + 7 > daysInMonth ? -1 : Math.ceil(day / 7);
}

/** Real UTC instant + timeZone -> a Date whose *UTC* getters equal the wall
 *  -clock time in timeZone. This is rrule's expected convention for
 *  dtstart/until/between() -- the opposite of this file's usual "local
 *  setters" convention (see localWallTimeToUtcIso above). Every Date handed
 *  to or read from rrule MUST go through this pair of functions, or
 *  occurrences will silently drift by the timezone's UTC offset. */
function toFloatingUtc(instant: Date, timeZone: string): Date {
    const [year, month, day] = dateInputValue(instant, timeZone)
        .split("-")
        .map(Number);
    const [hour, minute] = timeInputValue(instant, timeZone)
        .split(":")
        .map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

/** The inverse of toFloatingUtc -- one of rrule's floating-UTC occurrence
 *  results back to a real UTC ISO instant. */
function fromFloatingUtc(floating: Date, timeZone: string): string {
    const wall = new Date(
        floating.getUTCFullYear(),
        floating.getUTCMonth(),
        floating.getUTCDate(),
        floating.getUTCHours(),
        floating.getUTCMinutes(),
        floating.getUTCSeconds(),
        0,
    );
    return localWallTimeToUtcIso(wall, timeZone);
}

/** Reads the wall-clock "YYYY-MM-DD" date directly off a floating-UTC
 *  Date's UTC getters -- used to read an RRULE UNTIL value back into a date
 *  input's value without running it through a real timezone conversion,
 *  since it's already floating, not a real instant (see toFloatingUtc). */
export function floatingUtcToDateValue(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatFloatingUtcForRrule(floating: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return (
        `${floating.getUTCFullYear()}${pad(floating.getUTCMonth() + 1)}${pad(floating.getUTCDate())}` +
        `T${pad(floating.getUTCHours())}${pad(floating.getUTCMinutes())}${pad(floating.getUTCSeconds())}`
    );
}

export type RepeatPreset =
    | "none"
    | "daily"
    | "weekly"
    | "monthlyNthWeekday"
    | "annually"
    | "weekdays"
    | "custom";

export type CustomRepeatUnit = "day" | "week" | "month" | "year";

export interface CustomRepeatOptions {
    interval: number;
    /** Date.getDay()-style indices (0=Sunday..6=Saturday), only meaningful
     *  when unit is "week". */
    weekdays: number[];
    unit: CustomRepeatUnit;
}

export type RepeatEndMode = "never" | "onDate" | "afterCount";

export interface RepeatEndOptions {
    mode: RepeatEndMode;
    /** "YYYY-MM-DD", used when mode is "onDate". */
    date: string;
    /** Used when mode is "afterCount". */
    count: number;
}

const CUSTOM_UNIT_TO_FREQ: Record<CustomRepeatUnit, string> = {
    day: "DAILY",
    week: "WEEKLY",
    month: "MONTHLY",
    year: "YEARLY",
};

/** Builds a bare RFC 5545 RRULE value (no DTSTART -- `startsAt` is always
 *  the series' anchor) from the repeat picker's draft state, or null for
 *  "none". `startsAt` and `timeZone` are only needed to derive the
 *  weekday/ordinal for the "weekly"/"monthlyNthWeekday" presets and the
 *  floating-UTC UNTIL boundary -- see toFloatingUtc's doc comment above for
 *  why that conversion matters. */
export function buildRecurrenceRule(
    preset: RepeatPreset,
    custom: CustomRepeatOptions,
    end: RepeatEndOptions,
    startsAt: Date,
    timeZone: string,
): string | null {
    if (preset === "none") return null;

    const startDateValue = dateInputValue(startsAt, timeZone);
    const parts: string[] = [];

    if (preset === "daily") {
        parts.push("FREQ=DAILY");
    } else if (preset === "weekly") {
        parts.push(
            "FREQ=WEEKLY",
            `BYDAY=${RRULE_DAY_CODES[weekdayIndexOfDateValue(startDateValue)]}`,
        );
    } else if (preset === "monthlyNthWeekday") {
        const nth = ordinalWeekdayOfMonth(startDateValue);
        const code = RRULE_DAY_CODES[weekdayIndexOfDateValue(startDateValue)];
        parts.push("FREQ=MONTHLY", `BYDAY=${nth}${code}`);
    } else if (preset === "annually") {
        parts.push("FREQ=YEARLY");
    } else if (preset === "weekdays") {
        parts.push("FREQ=WEEKLY", "BYDAY=MO,TU,WE,TH,FR");
    } else {
        parts.push(`FREQ=${CUSTOM_UNIT_TO_FREQ[custom.unit]}`);
        if (custom.interval > 1) parts.push(`INTERVAL=${custom.interval}`);
        if (custom.unit === "week" && custom.weekdays.length > 0) {
            const codes = [...custom.weekdays]
                .sort((a, b) => a - b)
                .map((day) => RRULE_DAY_CODES[day]);
            parts.push(`BYDAY=${codes.join(",")}`);
        }
    }

    if (end.mode === "onDate" && end.date) {
        const [year, month, day] = end.date.split("-").map(Number);
        const untilFloating = new Date(
            Date.UTC(year, month - 1, day, 23, 59, 59),
        );
        parts.push(`UNTIL=${formatFloatingUtcForRrule(untilFloating)}`);
    } else if (end.mode === "afterCount" && end.count > 0) {
        parts.push(`COUNT=${end.count}`);
    }

    return parts.join(";");
}

/** Expands `events` (recurring or not) into concrete, visible instances for
 *  `[rangeStart, rangeEnd)`, so callers never need their own overlap-filter
 *  logic. A recurring event's stored startsAt/endsAt describe only its
 *  first occurrence -- later ones are computed here from its
 *  recurrenceRule, entirely at render time, and never persisted. Each
 *  instance keeps the master's fields but gets a unique id (so multiple
 *  visible occurrences of the same series don't collide as React keys) and
 *  an `instanceOf` pointing back to the master's real id (so edit/delete
 *  can resolve back to the whole series). A malformed recurrenceRule is
 *  logged and skipped rather than crashing the render.
 *
 *  `exceptions` (READY-04) overrides individual occurrences: one whose
 *  originalStartTime matches a generated occurrence is either dropped
 *  entirely (isCancelled) or has its title/description/location/startsAt/
 *  endsAt/allDay replaced before the occurrence is emitted, independent of
 *  every other occurrence in the series. Only exceptions belonging to a
 *  master present in `events` are ever consulted, so callers only need to
 *  load exceptions for the recurring masters they've already loaded.
 *
 *  `timeZone` is only a *fallback* -- each event's own eventTimeZone (set
 *  for events synced from Google, which carries its own per-event time
 *  zone that isn't always the calendar's default) takes priority when
 *  expanding its recurrenceRule, since a recurring series' wall-clock
 *  occurrences have to be computed in whichever zone it was actually
 *  authored in or a cross-timezone series can drift by an hour during
 *  DST-mismatch weeks. Non-recurring events don't need this at all --
 *  startsAt/endsAt are already timezone-independent UTC instants. */
export function expandRecurringEvents(
    events: CalendarEvent[],
    rangeStart: Date,
    rangeEnd: Date,
    timeZone: string,
    exceptions: EventException[],
): CalendarEvent[] {
    const result: CalendarEvent[] = [];

    const exceptionsByMaster = new Map<string, Map<string, EventException>>();
    for (const exception of exceptions) {
        let byOriginalStart = exceptionsByMaster.get(exception.masterEventId);
        if (!byOriginalStart) {
            byOriginalStart = new Map();
            exceptionsByMaster.set(exception.masterEventId, byOriginalStart);
        }
        byOriginalStart.set(exception.originalStartTime, exception);
    }

    for (const event of events) {
        const start = new Date(event.startsAt);
        const end = new Date(event.endsAt);

        if (!event.recurrenceRule) {
            if (start < rangeEnd && end > rangeStart) result.push(event);
            continue;
        }

        const eventTimeZone = event.eventTimeZone ?? timeZone;
        const durationMs = end.getTime() - start.getTime();
        // An occurrence starting just before rangeStart can still overlap
        // it once its own duration is accounted for.
        const queryFrom = new Date(rangeStart.getTime() - durationMs);
        const eventExceptions = exceptionsByMaster.get(event.id);

        let occurrences: Date[];
        try {
            const parsedOptions = RRule.parseString(event.recurrenceRule);
            const rule = new RRule({
                ...parsedOptions,
                dtstart: toFloatingUtc(start, eventTimeZone),
            } as Partial<RRuleOptions>);
            occurrences = rule.between(
                toFloatingUtc(queryFrom, eventTimeZone),
                toFloatingUtc(rangeEnd, eventTimeZone),
                true,
            );
        } catch (error) {
            console.error(
                "Failed to expand recurring event:",
                event.id,
                error,
            );
            continue;
        }

        for (const occurrence of occurrences) {
            const occStartIso = fromFloatingUtc(occurrence, eventTimeZone);
            const exception = eventExceptions?.get(occStartIso);
            if (exception?.isCancelled) continue;

            const startsAt = exception?.startsAt ?? occStartIso;
            const occStart = new Date(startsAt);
            const endsAt =
                exception?.endsAt ??
                new Date(occStart.getTime() + durationMs).toISOString();
            const occEnd = new Date(endsAt);
            if (occStart >= rangeEnd || occEnd <= rangeStart) continue;

            result.push({
                ...event,
                id: exception?.id ?? `${event.id}::${occStartIso}`,
                title: exception?.title ?? event.title,
                description: exception?.description ?? event.description,
                location: exception?.location ?? event.location,
                startsAt,
                endsAt,
                allDay: exception?.allDay ?? event.allDay,
                instanceOf: event.id,
                originalStartTime: occStartIso,
                exceptionId: exception?.id,
            });
        }
    }

    return result;
}

export interface AllDayDayInfo {
    overflows: boolean;
    shownItems: AllDayLayoutItem[];
    hiddenCount: number;
    /** Highest row among shownItems -- callers position a "+N more"/"Collapse"
     *  control right below it, using their own pixel constants. */
    maxShownRow: number;
}

/** Decides, for one day's worth of all-day bars, which stay visible when the
 *  day overflows its budget. Multi-day events are never truncated -- only
 *  single-day events are subject to the collapsed cap, filling whatever of
 *  it the multi-day events touching this day haven't already used. */
export function computeAllDayDayInfo(
    dayItems: AllDayLayoutItem[],
    expanded: boolean,
    overflowThreshold: number,
    visibleWhenCollapsed: number,
): AllDayDayInfo {
    const overflows = dayItems.length > overflowThreshold;
    if (!overflows) {
        return {
            overflows,
            shownItems: dayItems,
            hiddenCount: 0,
            maxShownRow: dayItems.length
                ? Math.max(...dayItems.map((item) => item.row))
                : 0,
        };
    }
    let shownItems: AllDayLayoutItem[];
    if (expanded) {
        shownItems = dayItems;
    } else {
        const multiDayItems = dayItems.filter(
            (item) => item.endCol > item.startCol,
        );
        const singleDayItems = dayItems
            .filter((item) => item.endCol === item.startCol)
            .sort((a, b) => a.row - b.row);
        const singleDayBudget = Math.max(
            0,
            visibleWhenCollapsed - multiDayItems.length,
        );
        shownItems = [
            ...multiDayItems,
            ...singleDayItems.slice(0, singleDayBudget),
        ];
    }
    return {
        overflows,
        shownItems,
        hiddenCount: dayItems.length - shownItems.length,
        maxShownRow: Math.max(...shownItems.map((item) => item.row)),
    };
}

/** READY-03 conflict policy: when the same event changed on both sides
 *  between syncs, last-write-wins -- whichever side's own timestamp
 *  (Coria's updatedAt, kept trustworthy by the calendar_events trigger, vs
 *  Google's own `updated` field) is more recent wins the conflict. A tie
 *  favors the local copy, since a sync pass that's about to push a local
 *  change shouldn't discard it in favor of an identically-timed pull. Not
 *  yet called anywhere -- there's no sync engine to call it from -- but the
 *  decision needs to live somewhere concrete instead of only on paper. */
export function resolveEventConflict(
    localUpdatedAt: string,
    remoteUpdatedAt: string,
): "local" | "remote" {
    return new Date(localUpdatedAt) >= new Date(remoteUpdatedAt)
        ? "local"
        : "remote";
}

/** READY-05 policy: when pushing a locally-edited event to Google, preserve
 *  every field Coria doesn't understand (attendees, reminders,
 *  conferenceData, colorId, visibility, and anything else not present in
 *  `patch`) verbatim from the event's last-known raw Google object
 *  (CalendarEvent.externalRaw / EventException.externalRaw), instead of
 *  overwriting the whole event with only what Coria itself tracks. `patch`
 *  is just the fields a local edit actually changed, already shaped the
 *  way Google's Events API expects them (e.g. `summary`, `start`, `end`) --
 *  building that shape is a future push implementation's job, not this
 *  function's. Not yet called anywhere -- there's no push code yet -- but
 *  the decision needs to live somewhere concrete instead of only on paper,
 *  same as resolveEventConflict above. */
export function mergeGoogleEventPatch(
    externalRaw: Record<string, unknown> | null,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    return { ...(externalRaw ?? {}), ...patch };
}
