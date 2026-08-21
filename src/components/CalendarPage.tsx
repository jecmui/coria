import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RRule, Weekday } from "rrule";
import { useCalendarStore } from "../store/calendarStore";
import type { CalendarEvent, CalendarSettings } from "../types/calendar";
import type {
    CustomRepeatUnit,
    RepeatEndMode,
    RepeatPreset,
} from "../lib/calendar";
import {
    HOUR_HEIGHT,
    addDays,
    addDaysToDateValue,
    allDayBarLeft,
    allDayBarWidth,
    buildRecurrenceRule,
    computeAllDayDayInfo,
    dateInputValue,
    expandRecurringEvents,
    eventOverlapsDay,
    floatingUtcToDateValue,
    formatDayName,
    formatEventTimeRange,
    formatHour,
    formatMonthDay,
    getWeekStart,
    inputValuesToUtcIso,
    layoutAllDayEvents,
    layoutTimedEventsForDay,
    MIN_EVENT_HEIGHT,
    ordinalWeekdayOfMonth,
    sameCalendarDay,
    timeInputValue,
    weekdayIndexOfDateValue,
} from "../lib/calendar";

interface CalendarPageProps {
    onBack: () => void;
}

interface EventDraft {
    /** The master event's id -- set when editing an existing series (or a
     *  non-recurring event) as a whole, absent both when creating a new
     *  event and when occurrenceEdit is set (a single-occurrence edit has
     *  no master row of its own to reference here). */
    id?: string;
    title: string;
    description: string;
    location: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    allDay: boolean;
    repeatPreset: RepeatPreset;
    customInterval: number;
    customUnit: CustomRepeatUnit;
    /** Date.getDay()-style indices (0=Sunday..6=Saturday). */
    customWeekdays: number[];
    repeatEndMode: RepeatEndMode;
    repeatEndDate: string;
    repeatCount: number;
    /** READY-04: set when this draft edits a single occurrence of a
     *  recurring series rather than the series itself -- saving writes an
     *  EventException instead of the master row, and the repeat controls
     *  are hidden (a single occurrence can't have its own repeat rule). */
    occurrenceEdit?: {
        masterEventId: string;
        originalStartTime: string;
    };
    /** The calendar this event already belongs to -- absent when creating a
     *  new event (it lands on the primary calendar by default). Purely
     *  informational: nothing in handleSaveEvent sends it back, it only
     *  drives whether Save/Delete are disabled for a calendar Coria can't
     *  write to (see the "manage synced calendars" picker in Settings). */
    calendarId?: string;
}

const WEEKDAYS = Array.from({ length: 7 }, (_, index) => index);
const ORDINAL_WORDS: Record<number, string> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    [-1]: "last",
};
const CUSTOM_UNIT_LABELS: Record<CustomRepeatUnit, { singular: string; plural: string }> = {
    day: { singular: "day", plural: "days" },
    week: { singular: "week", plural: "weeks" },
    month: { singular: "month", plural: "months" },
    year: { singular: "year", plural: "years" },
};
const WEEKDAY_TOGGLES = [
    { index: 1, label: "M" },
    { index: 2, label: "T" },
    { index: 3, label: "W" },
    { index: 4, label: "T" },
    { index: 5, label: "F" },
    { index: 6, label: "S" },
    { index: 0, label: "S" },
];

interface RepeatDraftState {
    repeatPreset: RepeatPreset;
    customInterval: number;
    customUnit: CustomRepeatUnit;
    customWeekdays: number[];
    repeatEndMode: RepeatEndMode;
    repeatEndDate: string;
    repeatCount: number;
}

const DEFAULT_REPEAT_STATE: RepeatDraftState = {
    repeatPreset: "none",
    customInterval: 1,
    customUnit: "week",
    customWeekdays: [],
    repeatEndMode: "never",
    repeatEndDate: "",
    repeatCount: 1,
};

/** Date.getDay()-style weekday index (0=Sunday..6=Saturday) for a value
 *  parsed out of an RRULE's BYDAY -- rrule's own Weekday class already
 *  knows how to do this (getJsWeekday()), but RRule.parseString's declared
 *  return type also allows a bare string/number entry, so this covers
 *  those cases defensively even though rrule only ever actually returns
 *  Weekday instances in practice. */
function jsWeekdayOfByDayEntry(entry: string | number | Weekday): number {
    if (entry instanceof Weekday) return entry.getJsWeekday();
    const codes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
    const rruleIndex = typeof entry === "number" ? entry : codes.indexOf(entry);
    return rruleIndex === -1 ? -1 : (rruleIndex + 1) % 7;
}

/** Reverse-parses a stored recurrenceRule back into the repeat picker's
 *  draft state for editing, mapping it to the closest matching preset
 *  (falling back to "custom" when nothing matches cleanly) -- the end
 *  condition (never/on date/after count) is shared across every preset, so
 *  it's always extracted regardless of which preset matched. */
function repeatStateFromRule(
    recurrenceRule: string | null,
    startsAt: string,
    timeZone: string,
): RepeatDraftState {
    if (!recurrenceRule) return DEFAULT_REPEAT_STATE;

    let parsed: ReturnType<typeof RRule.parseString>;
    try {
        parsed = RRule.parseString(recurrenceRule);
    } catch {
        return DEFAULT_REPEAT_STATE;
    }

    const state = { ...DEFAULT_REPEAT_STATE };
    if (parsed.count) {
        state.repeatEndMode = "afterCount";
        state.repeatCount = parsed.count;
    } else if (parsed.until) {
        state.repeatEndMode = "onDate";
        state.repeatEndDate = floatingUtcToDateValue(parsed.until);
    }

    const startDateValue = dateInputValue(new Date(startsAt), timeZone);
    const startWeekday = weekdayIndexOfDateValue(startDateValue);
    const interval = parsed.interval ?? 1;
    const byweekdayRaw = parsed.byweekday;
    const byweekday = Array.isArray(byweekdayRaw)
        ? byweekdayRaw
        : byweekdayRaw
          ? [byweekdayRaw]
          : [];
    const weekdayIndices = byweekday.map(jsWeekdayOfByDayEntry);
    const singleOrdinal =
        byweekday.length === 1 && byweekday[0] instanceof Weekday
            ? byweekday[0].n
            : undefined;

    if (interval === 1 && parsed.freq === RRule.DAILY && byweekday.length === 0) {
        state.repeatPreset = "daily";
    } else if (
        interval === 1 &&
        parsed.freq === RRule.WEEKLY &&
        weekdayIndices.length === 5 &&
        [0, 1, 2, 3, 4, 5, 6]
            .filter((day) => day !== 0 && day !== 6)
            .every((day) => weekdayIndices.includes(day))
    ) {
        state.repeatPreset = "weekdays";
    } else if (
        interval === 1 &&
        parsed.freq === RRule.WEEKLY &&
        weekdayIndices.length === 1 &&
        singleOrdinal === undefined &&
        weekdayIndices[0] === startWeekday
    ) {
        state.repeatPreset = "weekly";
    } else if (
        interval === 1 &&
        parsed.freq === RRule.MONTHLY &&
        weekdayIndices.length === 1 &&
        weekdayIndices[0] === startWeekday &&
        singleOrdinal === ordinalWeekdayOfMonth(startDateValue)
    ) {
        state.repeatPreset = "monthlyNthWeekday";
    } else if (
        interval === 1 &&
        parsed.freq === RRule.YEARLY &&
        weekdayIndices.length === 0
    ) {
        state.repeatPreset = "annually";
    } else {
        state.repeatPreset = "custom";
        state.customInterval = interval;
        state.customUnit =
            parsed.freq === RRule.DAILY
                ? "day"
                : parsed.freq === RRule.WEEKLY
                  ? "week"
                  : parsed.freq === RRule.MONTHLY
                    ? "month"
                    : "year";
        state.customWeekdays = weekdayIndices;
    }

    return state;
}

/** Human-readable labels for the repeat picker's fixed presets, derived
 *  live from the draft's start date so e.g. "Monthly" reads as "Monthly on
 *  the third Tuesday" once a start date is chosen. */
function describeRepeatPresets(startDate: string, settings: CalendarSettings) {
    if (!startDate) {
        return {
            daily: "Daily",
            weekly: "Weekly",
            monthlyNthWeekday: "Monthly",
            annually: "Annually",
            weekdays: "Every weekday (Mon–Fri)",
        };
    }
    const noon = new Date(
        inputValuesToUtcIso(startDate, "12:00", settings.timeZone),
    );
    const weekdayName = new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        weekday: "long",
    }).format(noon);
    const nth = ordinalWeekdayOfMonth(startDate);
    const ordinalWord = ORDINAL_WORDS[nth] ?? `${nth}th`;
    return {
        daily: "Daily",
        weekly: `Weekly on ${weekdayName}`,
        monthlyNthWeekday: `Monthly on the ${ordinalWord} ${weekdayName}`,
        annually: `Annually on ${formatMonthDay(noon, settings)}`,
        weekdays: "Every weekday (Mon–Fri)",
    };
}

/** Gutter width (px) reserved for the hourly grid's hour labels, shared by
 *  the header row above it so day columns line up between the two. */
const GUTTER_WIDTH = 64;
/** Rendered height (px) of a day header's weekday-name + date-number block,
 *  measured from the actual markup below -- all-day bars are absolutely
 *  positioned starting right after it, so this has to match exactly or
 *  they'd either overlap the date number or leave a gap under it. */
const HEADER_TEXT_HEIGHT = 59;
/** Rendered height (px) of one stacked all-day bar, margin included. */
const ALL_DAY_BAR_HEIGHT = 23;
/** A day whose own all-day events exceed this count gets truncated with a
 *  "+N more" control instead of showing every one of them. */
const ALL_DAY_OVERFLOW_THRESHOLD = 3;
/** How many of an overflowing day's events stay visible before truncating. */
const ALL_DAY_VISIBLE_WHEN_COLLAPSED = 2;
/** Line height (px) of a timed event's title text (text-xs). */
const EVENT_TITLE_LINE_HEIGHT = 16;
/** Vertical space (px) inside a timed event block that isn't available to
 *  its title -- the py-1 padding (8px) plus the 1px border on each edge. */
const EVENT_BOX_CHROME = 10;
/** Same, for a block clamped to MIN_EVENT_HEIGHT -- just the 1px top/bottom
 *  border, no vertical padding at all (see the block below), since at
 *  MIN_EVENT_HEIGHT there's only exactly enough room for one line of title
 *  and nothing to spare for it. */
const EVENT_BOX_CHROME_MINIMAL = 2;
/** Vertical space (px) of one text-[10px] leading-tight details line (the
 *  time range, or the location, each on their own line below the title). */
const EVENT_DETAIL_LINE_HEIGHT = 13;
/** Vertical space (px) above the first details line -- its own mt-0.5. */
const EVENT_DETAILS_MARGIN = 2;

export function CalendarPage({ onBack }: CalendarPageProps) {
    const {
        events,
        exceptions,
        calendars,
        settings,
        loading,
        error,
        loadEvents,
        addEvent,
        updateEvent,
        removeEvent,
        saveEventException,
        cancelEventOccurrence,
    } = useCalendarStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [draft, setDraft] = useState<EventDraft | null>(null);
    const [draftError, setDraftError] = useState<string | null>(null);
    // Every setDraft call (opening the modal fresh, editing a field, or
    // closing it) creates a new draft object -- clearing the error on any
    // of those means a stale message from a previous attempt never lingers
    // into a new one, and a validation error clears itself the moment the
    // user starts fixing the field it complained about.
    useEffect(() => {
        setDraftError(null);
    }, [draft]);
    // Set when a clicked occurrence belongs to a recurring series, so the
    // user is asked "this event" vs "all events" before a draft is ever
    // opened -- that choice decides both how the draft loads and what its
    // Delete button does, so it has to happen before editEvent/editOccurrence,
    // not inside the already-open modal.
    const [scopeChoice, setScopeChoice] = useState<CalendarEvent | null>(
        null,
    );
    const [allDayExpanded, setAllDayExpanded] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    // Ticks the current-time indicator line -- 30s is frequent enough to
    // read as "live" without re-rendering every second for a line that's
    // only ever positioned to the nearest minute anyway.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(interval);
    }, []);

    const weekStart = useMemo(
        () => getWeekStart(currentDate, settings.weekStart),
        [currentDate, settings.weekStart],
    );
    const days = useMemo(
        () => WEEKDAYS.map((offset) => addDays(weekStart, offset)),
        [weekStart],
    );

    useEffect(() => {
        const start = new Date(weekStart);
        const end = addDays(start, 7);
        void loadEvents(start.toISOString(), end.toISOString());
    }, [weekStart, loadEvents]);

    function draftFromRange(
        day: Date,
        startMinutes: number,
        endMinutes: number,
    ): EventDraft {
        const start = new Date(day);
        start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
        const end = new Date(day);
        end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
        if (end <= start)
            end.setMinutes(end.getMinutes() + settings.defaultEventDuration);
        return {
            title: "",
            description: "",
            location: "",
            startDate: dateInputValue(start, settings.timeZone),
            startTime: timeInputValue(start, settings.timeZone),
            endDate: dateInputValue(end, settings.timeZone),
            endTime: timeInputValue(end, settings.timeZone),
            allDay: false,
            ...DEFAULT_REPEAT_STATE,
        };
    }

    function openNewEvent(day: Date, minutes: number, endMinutes?: number) {
        setDraft(
            draftFromRange(
                day,
                minutes,
                endMinutes ?? minutes + settings.defaultEventDuration,
            ),
        );
    }

    function handleAddEvent() {
        const now = new Date();
        const startMinutes = now.getHours() * 60 + now.getMinutes();
        openNewEvent(
            now,
            startMinutes,
            startMinutes + settings.defaultEventDuration,
        );
    }

    function editEvent(clicked: CalendarEvent) {
        // A clicked item may be a synthesized occurrence of a recurring
        // series, not the stored row itself -- always edit the master's own
        // start/end/rule, never the clicked occurrence's shifted date, or
        // editing any occurrence but the first would silently move the
        // whole series.
        const event = clicked.instanceOf
            ? (events.find((e) => e.id === clicked.instanceOf) ?? clicked)
            : clicked;
        setDraft({
            id: event.id,
            calendarId: event.calendarId,
            title: event.title,
            description: event.description,
            location: event.location,
            startDate: dateInputValue(
                new Date(event.startsAt),
                settings.timeZone,
            ),
            startTime: timeInputValue(
                new Date(event.startsAt),
                settings.timeZone,
            ),
            endDate: dateInputValue(new Date(event.endsAt), settings.timeZone),
            endTime: timeInputValue(new Date(event.endsAt), settings.timeZone),
            allDay: event.allDay,
            // The rule's weekday/nth were derived from whichever time zone
            // the event was actually authored in (Google's per-event zone
            // when it has one), not necessarily the calendar's own -- same
            // reasoning as expandRecurringEvents.
            ...repeatStateFromRule(
                event.recurrenceRule,
                event.startsAt,
                event.eventTimeZone ?? settings.timeZone,
            ),
        });
    }

    /** READY-04: opens a draft that edits just the clicked occurrence, not
     *  the series -- `clicked` is a synthesized occurrence from
     *  expandRecurringEvents, already reflecting any existing exception's
     *  own overrides, so pre-filling from it (rather than the master)
     *  starts the form from what's actually showing. originalStartTime
     *  pins down exactly which occurrence this is, independent of any
     *  override that already moved its own startsAt -- saving always
     *  targets that same occurrence, never creates a second one. */
    function editOccurrence(clicked: CalendarEvent) {
        setDraft({
            calendarId: clicked.calendarId,
            title: clicked.title,
            description: clicked.description,
            location: clicked.location,
            startDate: dateInputValue(
                new Date(clicked.startsAt),
                settings.timeZone,
            ),
            startTime: timeInputValue(
                new Date(clicked.startsAt),
                settings.timeZone,
            ),
            endDate: dateInputValue(
                new Date(clicked.endsAt),
                settings.timeZone,
            ),
            endTime: timeInputValue(
                new Date(clicked.endsAt),
                settings.timeZone,
            ),
            allDay: clicked.allDay,
            ...DEFAULT_REPEAT_STATE,
            occurrenceEdit: {
                masterEventId: clicked.instanceOf!,
                originalStartTime: clicked.originalStartTime!,
            },
        });
    }

    /** Entry point for every click on a rendered event -- a non-recurring
     *  event (or the rare case where a click somehow reaches a master row
     *  directly) skips straight to editing it, but a recurring occurrence
     *  always needs "this event" vs "all events" decided first, since that
     *  choice changes both what the draft edits and what its Delete button
     *  does. */
    function handleEventClick(clicked: CalendarEvent) {
        if (clicked.instanceOf) {
            setScopeChoice(clicked);
        } else {
            editEvent(clicked);
        }
    }

    function chooseScope(scope: "occurrence" | "series") {
        const clicked = scopeChoice;
        setScopeChoice(null);
        if (!clicked) return;
        if (scope === "series") {
            editEvent(clicked);
        } else {
            editOccurrence(clicked);
        }
    }

    async function handleSaveEvent() {
        if (!draft) return;
        if (!draft.title.trim()) {
            setDraftError("Title is required.");
            return;
        }
        if (!draft.startDate || !draft.endDate) {
            setDraftError("Start and end dates are required.");
            return;
        }
        if (!draft.allDay && (!draft.startTime || !draft.endTime)) {
            setDraftError("Start and end times are required.");
            return;
        }
        // All-day events ignore the time-of-day inputs and instead span the
        // full day(s) from startDate through endDate, exclusive end (the
        // start of the day after endDate), matching Google Calendar.
        const startsAt = draft.allDay
            ? inputValuesToUtcIso(draft.startDate, "00:00", settings.timeZone)
            : inputValuesToUtcIso(
                  draft.startDate,
                  draft.startTime,
                  settings.timeZone,
              );
        const endsAt = draft.allDay
            ? inputValuesToUtcIso(
                  addDaysToDateValue(draft.endDate, 1),
                  "00:00",
                  settings.timeZone,
              )
            : inputValuesToUtcIso(
                  draft.endDate,
                  draft.endTime,
                  settings.timeZone,
              );
        if (new Date(endsAt) < new Date(startsAt)) {
            setDraftError("End can't be before start.");
            return;
        }

        if (draft.occurrenceEdit) {
            const saved = await saveEventException(
                draft.occurrenceEdit.masterEventId,
                draft.occurrenceEdit.originalStartTime,
                {
                    title: draft.title.trim(),
                    description: draft.description.trim(),
                    location: draft.location.trim(),
                    startsAt,
                    endsAt,
                    allDay: draft.allDay,
                },
            );
            if (saved) {
                setDraft(null);
            } else {
                setDraftError("Couldn't save event. Try again.");
            }
            return;
        }

        const event = {
            title: draft.title.trim(),
            description: draft.description.trim(),
            location: draft.location.trim(),
            startsAt,
            endsAt,
            allDay: draft.allDay,
            recurrenceRule: buildRecurrenceRule(
                draft.repeatPreset,
                {
                    interval: draft.customInterval,
                    unit: draft.customUnit,
                    weekdays: draft.customWeekdays,
                },
                {
                    mode: draft.repeatEndMode,
                    date: draft.repeatEndDate,
                    count: draft.repeatCount,
                },
                new Date(startsAt),
                settings.timeZone,
            ),
        };
        const saved = draft.id
            ? await updateEvent(draft.id, event)
            : await addEvent(event);
        if (saved !== false && saved !== null) {
            setDraft(null);
        } else {
            setDraftError("Couldn't save event. Try again.");
        }
    }

    async function handleDeleteEvent() {
        if (draft?.occurrenceEdit) {
            const { masterEventId, originalStartTime } =
                draft.occurrenceEdit;
            if (await cancelEventOccurrence(masterEventId, originalStartTime))
                setDraft(null);
            return;
        }
        if (!draft?.id) return;
        if (await removeEvent(draft.id)) setDraft(null);
    }

    // Expands recurring masters into this week's concrete occurrences (and
    // filters non-recurring events to the same overlap check as before) in
    // one pass -- see expandRecurringEvents in lib/calendar.ts.
    const visibleWeekEnd = addDays(weekStart, 7);
    const visibleEvents = expandRecurringEvents(
        events,
        weekStart,
        visibleWeekEnd,
        settings.timeZone,
        exceptions,
    );
    const allDayLayout = layoutAllDayEvents(
        visibleEvents.filter((event) => event.allDay),
        days,
        settings.timeZone,
    );
    // Per day (not globally): a day whose own touching events exceed the
    // threshold truncates to its lowest-row events, with a control to expand
    // it -- a day with few events always shows all of them regardless of
    // what's happening elsewhere in the week.
    const allDayPerDay = days.map((_, index) => {
        const dayItems = allDayLayout.filter(
            (item) => item.startCol <= index && item.endCol >= index,
        );
        const info = computeAllDayDayInfo(
            dayItems,
            allDayExpanded,
            ALL_DAY_OVERFLOW_THRESHOLD,
            ALL_DAY_VISIBLE_WHEN_COLLAPSED,
        );
        return {
            ...info,
            controlTop:
                HEADER_TEXT_HEIGHT +
                (info.maxShownRow + 1) * ALL_DAY_BAR_HEIGHT,
        };
    });
    // A bar renders if it's visible for *any* day it touches -- it's one
    // continuous shape, so it can't be shown for one day and hidden for
    // another day it also spans.
    const visibleAllDayEventIds = new Set(
        allDayPerDay.flatMap(({ shownItems }) =>
            shownItems.map((item) => item.event.id),
        ),
    );
    const visibleAllDayLayout = allDayLayout.filter((item) =>
        visibleAllDayEventIds.has(item.event.id),
    );
    const headerRowHeight = Math.max(
        HEADER_TEXT_HEIGHT,
        ...visibleAllDayLayout.map(
            (item) => HEADER_TEXT_HEIGHT + (item.row + 1) * ALL_DAY_BAR_HEIGHT,
        ),
        ...allDayPerDay
            .filter((day) => day.overflows)
            .map((day) => day.controlTop + ALL_DAY_BAR_HEIGHT),
    );

    // Vertical position (px) of the current-time indicator line, shared by
    // the line itself and the initial scroll-centering below -- updates as
    // `now` ticks, same HOUR_HEIGHT-based math as timed events use.
    const [nowHour, nowMinute] = timeInputValue(now, settings.timeZone)
        .split(":")
        .map(Number);
    const nowTop = (nowHour * 60 + nowMinute) * (HOUR_HEIGHT / 60);

    // Centers the grid on the current time once, on mount -- not on every
    // render, so navigating weeks or an all-day event changing
    // headerRowHeight doesn't keep yanking the user's scroll position back.
    // The header row is sticky (stays pinned at the viewport's top once
    // scrolled), so it visually covers whatever grid content would
    // otherwise be at that same scroll position -- centering has to target
    // the middle of the space *below* it, not the container's full height.
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        container.scrollTop = Math.max(
            0,
            nowTop - (container.clientHeight - headerRowHeight) / 2,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // "Manage synced calendars" lets a user pull from a Google calendar
    // they can't write to -- editing or deleting one of its events would
    // just fail at Google on the next push, so the whole form is disabled
    // (via the fieldset below) instead of only Save/Delete, which would
    // otherwise let the user fill out changes with no way to keep them.
    const readOnlyCalendar = Boolean(
        draft?.calendarId &&
            calendars.find((calendar) => calendar.id === draft.calendarId)
                ?.isWritable === false,
    );

    return (
        <div className="flex h-full w-full flex-col bg-board px-3 py-4 font-body text-ink sm:px-5 sm:py-5">
            <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-paper-edge bg-paper/95 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
                <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-paper-edge bg-paper/95 px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onBack}
                            className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-soft hover:cursor-pointer hover:bg-black/5"
                        >
                            ← Board
                        </button>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() =>
                                    setCurrentDate((date) => addDays(date, -7))
                                }
                                className="rounded-full px-3 py-1.5 text-lg text-ink-soft hover:cursor-pointer hover:bg-black/5"
                                aria-label="Previous week"
                            >
                                ‹
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentDate(new Date())}
                                className="rounded-full border border-paper-edge px-3 py-1.5 text-xs font-semibold hover:cursor-pointer hover:bg-black/5"
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setCurrentDate((date) => addDays(date, 7))
                                }
                                className="rounded-full px-3 py-1.5 text-lg text-ink-soft hover:cursor-pointer hover:bg-black/5"
                                aria-label="Next week"
                            >
                                ›
                            </button>
                        </div>
                        <h1 className="font-display text-lg font-semibold sm:text-xl">
                            {(() => {
                                const startMonth = days[0].getMonth();
                                const endMonth = days[6].getMonth();
                                const startYear = days[0].getFullYear();
                                const endYear = days[6].getFullYear();
                                const monthFormatter = new Intl.DateTimeFormat(
                                    "en-US",
                                    {
                                        timeZone: settings.timeZone,
                                        month: "short",
                                    },
                                );

                                if (
                                    startMonth !== endMonth ||
                                    startYear !== endYear
                                ) {
                                    return `${monthFormatter.format(days[0])} - ${monthFormatter.format(days[6])} ${endYear}`;
                                }

                                return new Intl.DateTimeFormat("en-US", {
                                    timeZone: settings.timeZone,
                                    month: "long",
                                    year: "numeric",
                                }).format(currentDate);
                            })()}
                        </h1>
                        {loading && (
                            <span className="text-xs text-ink-soft">
                                Loading…
                            </span>
                        )}
                        {error && (
                            <span className="text-xs text-pin-timer">
                                Couldn't load events.
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleAddEvent()}
                        className="rounded-full bg-pin-todo px-3 py-1.5 text-sm font-semibold text-ink shadow-sm hover:cursor-pointer hover:bg-pin-todo/90"
                    >
                        Add Event
                    </button>
                </div>

                <div
                    ref={scrollContainerRef}
                    className="min-h-0 flex-1 overflow-auto"
                >
                    {/* A single header row -- no extra grid row for all-day events.
                        Each day cell (and the gutter) reserves extra height via
                        min-height when there are all-day bars to show, so they stay
                        inside the same bordered cells, growing those cells instead of
                        adding a new one. The bars themselves are position:absolute
                        (anchored to this sticky container, which -- like relative --
                        establishes a containing block), sized with percentage-based
                        calc() so a multi-day bar spans continuously across day
                        columns and simply paints over the border lines it crosses. */}
                    <div className="sticky top-0 z-20 grid min-w-225 grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-paper-edge bg-paper">
                        <div
                            className="sticky left-0 z-20 border-r border-paper-edge"
                            style={{ minHeight: headerRowHeight }}
                        />
                        {days.map((day) => {
                            const today = sameCalendarDay(
                                day,
                                new Date(),
                                settings.timeZone,
                            );
                            return (
                                <div
                                    key={day.toISOString()}
                                    style={{ minHeight: headerRowHeight }}
                                    className={`border-r border-paper-edge px-2 py-2 text-center ${today ? "text-pin-todo" : "text-ink"}`}
                                >
                                    <p className="text-[10px] font-semibold uppercase text-ink-soft">
                                        {formatDayName(day, settings)}
                                    </p>
                                    <p className="font-display text-lg font-semibold">
                                        {day.getDate()}
                                    </p>
                                </div>
                            );
                        })}
                        {visibleAllDayLayout.map((item) => (
                            <button
                                key={item.event.id}
                                type="button"
                                onClick={() => handleEventClick(item.event)}
                                style={{
                                    top:
                                        HEADER_TEXT_HEIGHT +
                                        item.row * ALL_DAY_BAR_HEIGHT,
                                    left: allDayBarLeft(
                                        item.startCol,
                                        7,
                                        GUTTER_WIDTH,
                                    ),
                                    width: allDayBarWidth(
                                        item.startCol,
                                        item.endCol,
                                        7,
                                        GUTTER_WIDTH,
                                    ),
                                }}
                                className="absolute z-10 truncate rounded-md border border-pin-todo/40 bg-pin-todo/70 px-1.5 py-0.5 text-left text-[10px] font-medium text-ink shadow-sm hover:cursor-pointer hover:bg-pin-todo/80"
                            >
                                {item.event.title}
                            </button>
                        ))}
                        {/* Per-day "+N more" / "Collapse" control -- only the days that
                            individually overflow get one, all driven by the same shared
                            expand state (a bar can't be shown for one day and hidden for
                            another it also spans). */}
                        {allDayPerDay.map(
                            (day, index) =>
                                day.overflows && (
                                    <button
                                        key={`allday-toggle-${index}`}
                                        type="button"
                                        onClick={() =>
                                            setAllDayExpanded((e) => !e)
                                        }
                                        style={{
                                            top: day.controlTop,
                                            left: allDayBarLeft(
                                                index,
                                                7,
                                                GUTTER_WIDTH,
                                            ),
                                            width: allDayBarWidth(
                                                index,
                                                index,
                                                7,
                                                GUTTER_WIDTH,
                                            ),
                                        }}
                                        className="absolute z-10 truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-ink-soft hover:cursor-pointer hover:bg-black/5"
                                    >
                                        {allDayExpanded
                                            ? "Collapse"
                                            : `+${day.hiddenCount} more`}
                                    </button>
                                ),
                        )}
                    </div>

                    {/* relative + z-10 gives this whole scrolling body its
                        own stacking context, capped below the header's
                        z-20 -- otherwise the current-time indicator's z-30
                        (needed to stay above cascaded event bands, whose
                        own z-index can climb past 20 in a busy day) would
                        escape past the header itself once scrolled behind
                        it, instead of being hidden by it like everything
                        else in this body. */}
                    <div className="relative z-10 grid min-w-225 grid-cols-[64px_repeat(7,minmax(0,1fr))]">
                        <div
                            className="sticky left-0 top-0 z-20 border-r border-paper-edge bg-paper/95"
                            style={{ height: 24 * HOUR_HEIGHT }}
                        >
                            {Array.from({ length: 24 }, (_, hour) => (
                                <div
                                    key={hour}
                                    className="absolute right-2 text-[10px] text-ink-soft"
                                    style={{ top: hour * HOUR_HEIGHT - 7 }}
                                >
                                    {formatHour(hour, settings)}
                                </div>
                            ))}
                        </div>
                        {days.map((day) => {
                            const dayEvents = visibleEvents.filter(
                                (event) =>
                                    !event.allDay &&
                                    eventOverlapsDay(
                                        event,
                                        day,
                                        settings.timeZone,
                                    ),
                            );
                            return (
                                <div
                                    key={day.toISOString()}
                                    className="relative border-r border-paper-edge bg-paper/40"
                                    style={{ height: 24 * HOUR_HEIGHT }}
                                >
                                    {Array.from({ length: 24 }, (_, hour) => (
                                        <div
                                            key={hour}
                                            className="absolute inset-x-0 border-t border-paper-edge/70"
                                            style={{ top: hour * HOUR_HEIGHT }}
                                        />
                                    ))}
                                    {Array.from({ length: 24 }, (_, hour) => (
                                        <div
                                            key={`half-${hour}`}
                                            className="absolute inset-x-0 border-t border-paper-edge/35"
                                            style={{
                                                top:
                                                    hour * HOUR_HEIGHT +
                                                    HOUR_HEIGHT / 2,
                                            }}
                                        />
                                    ))}
                                    {layoutTimedEventsForDay(
                                        dayEvents,
                                        day,
                                        settings.timeZone,
                                    ).map(
                                        ({
                                            event,
                                            top,
                                            height,
                                            continuesFromPrevDay,
                                            continuesToNextDay,
                                            left,
                                            width,
                                            zIndex,
                                            coveredByLaterEvent,
                                        }) => {
                                            const showDetails =
                                                height >= HOUR_HEIGHT &&
                                                !continuesFromPrevDay &&
                                                !coveredByLaterEvent;
                                            // A block clamped to
                                            // MIN_EVENT_HEIGHT has exactly
                                            // enough room for one line of
                                            // title and nothing else --
                                            // dropping its vertical padding
                                            // (below) is what makes that
                                            // line actually fit.
                                            const isMinHeight =
                                                height <= MIN_EVENT_HEIGHT;
                                            // Time range gets its own line,
                                            // and location (when there is
                                            // one) gets a second below it,
                                            // rather than sharing one line.
                                            const detailLines = showDetails
                                                ? event.location
                                                    ? 2
                                                    : 1
                                                : 0;
                                            const detailsHeight = detailLines
                                                ? EVENT_DETAILS_MARGIN +
                                                  detailLines *
                                                      EVENT_DETAIL_LINE_HEIGHT
                                                : 0;
                                            // How many lines the title can
                                            // wrap onto before it has to
                                            // start clipping -- whatever's
                                            // left after the box's own
                                            // padding/border and (if shown)
                                            // the details lines below it, at
                                            // least one line even for the
                                            // shortest event blocks.
                                            const titleLines = Math.max(
                                                1,
                                                Math.floor(
                                                    (height -
                                                        (isMinHeight
                                                            ? EVENT_BOX_CHROME_MINIMAL
                                                            : EVENT_BOX_CHROME) -
                                                        detailsHeight) /
                                                        EVENT_TITLE_LINE_HEIGHT,
                                                ),
                                            );
                                            return (
                                                <button
                                                    key={event.id}
                                                    type="button"
                                                    onMouseDown={(
                                                        mouseEvent,
                                                    ) =>
                                                        mouseEvent.stopPropagation()
                                                    }
                                                    onClick={(
                                                        mouseEvent,
                                                    ) => {
                                                        mouseEvent.stopPropagation();
                                                        handleEventClick(
                                                            event,
                                                        );
                                                    }}
                                                    className={`absolute flex flex-col items-start justify-start overflow-hidden border border-pin-todo/40 bg-pin-todo/70 px-2 text-left text-xs text-ink shadow-sm hover:cursor-pointer hover:bg-pin-todo/8 ${
                                                        isMinHeight
                                                            ? "py-0"
                                                            : "py-1"
                                                    } ${
                                                        continuesFromPrevDay
                                                            ? ""
                                                            : "rounded-t-md"
                                                    } ${
                                                        continuesToNextDay
                                                            ? ""
                                                            : "rounded-b-md"
                                                    }`}
                                                    style={{
                                                        top,
                                                        height,
                                                        left,
                                                        width,
                                                        zIndex,
                                                    }}
                                                >
                                                    <p
                                                        className="w-full font-semibold"
                                                        style={{
                                                            display:
                                                                "-webkit-box",
                                                            WebkitLineClamp:
                                                                titleLines,
                                                            WebkitBoxOrient:
                                                                "vertical",
                                                            overflow:
                                                                "hidden",
                                                        }}
                                                    >
                                                        {continuesFromPrevDay
                                                            ? "‹ "
                                                            : ""}
                                                        {event.title}
                                                    </p>
                                                    {showDetails && (
                                                        <>
                                                            <p className="mt-0.5 w-full truncate text-[10px] leading-tight">
                                                                {formatEventTimeRange(
                                                                    event.startsAt,
                                                                    event.endsAt,
                                                                    settings,
                                                                )}
                                                            </p>
                                                            {event.location && (
                                                                <p className="w-full truncate text-[10px] leading-tight">
                                                                    {
                                                                        event.location
                                                                    }
                                                                </p>
                                                            )}
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        },
                                    )}
                                    {sameCalendarDay(
                                        day,
                                        now,
                                        settings.timeZone,
                                    ) && (
                                        <div
                                            className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
                                            style={{ top: nowTop }}
                                        >
                                            <span className="-ml-1 h-2 w-2 shrink-0 rounded-full bg-pin-timer" />
                                            <span className="h-px flex-1 bg-pin-timer" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {draft && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-lg rounded-2xl border border-paper-edge bg-paper p-5 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="font-display text-lg font-semibold">
                                {draft.occurrenceEdit
                                    ? "Edit this event"
                                    : draft.id
                                      ? "Edit event"
                                      : "New event"}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setDraft(null)}
                                className="rounded-full px-2 text-lg text-ink-soft hover:cursor-pointer hover:bg-black/5"
                            >
                                ×
                            </button>
                        </div>
                        {readOnlyCalendar && (
                            <p className="mb-3 text-xs text-ink-soft">
                                This calendar is view-only in Coria — you
                                can't edit or delete its events.
                            </p>
                        )}
                        <fieldset
                            disabled={readOnlyCalendar}
                            className="m-0 space-y-3 border-0 p-0"
                        >
                            <label className="block space-y-1">
                                <span className="text-xs font-semibold text-ink-soft">
                                    Title
                                </span>
                                <input
                                    autoFocus
                                    value={draft.title}
                                    onChange={(event) =>
                                        setDraft({
                                            ...draft,
                                            title: event.target.value,
                                        })
                                    }
                                    className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                />
                            </label>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block space-y-1">
                                    <span className="text-xs font-semibold text-ink-soft">
                                        Start
                                    </span>
                                    {draft.allDay ? (
                                        <input
                                            type="date"
                                            value={draft.startDate}
                                            onChange={(event) =>
                                                setDraft({
                                                    ...draft,
                                                    startDate:
                                                        event.target.value,
                                                })
                                            }
                                            className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                        />
                                    ) : (
                                        <input
                                            type="datetime-local"
                                            value={`${draft.startDate}T${draft.startTime}`}
                                            onChange={(event) => {
                                                const [date, time] =
                                                    event.target.value.split(
                                                        "T",
                                                    );
                                                setDraft({
                                                    ...draft,
                                                    startDate: date,
                                                    startTime: time,
                                                });
                                            }}
                                            className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                        />
                                    )}
                                </label>
                                <label className="block space-y-1">
                                    <span className="text-xs font-semibold text-ink-soft">
                                        End
                                    </span>
                                    {draft.allDay ? (
                                        <input
                                            type="date"
                                            value={draft.endDate}
                                            onChange={(event) =>
                                                setDraft({
                                                    ...draft,
                                                    endDate: event.target.value,
                                                })
                                            }
                                            className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                        />
                                    ) : (
                                        <input
                                            type="datetime-local"
                                            value={`${draft.endDate}T${draft.endTime}`}
                                            onChange={(event) => {
                                                const [date, time] =
                                                    event.target.value.split(
                                                        "T",
                                                    );
                                                setDraft({
                                                    ...draft,
                                                    endDate: date,
                                                    endTime: time,
                                                });
                                            }}
                                            className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                        />
                                    )}
                                </label>
                            </div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={draft.allDay}
                                    onChange={(event) =>
                                        setDraft({
                                            ...draft,
                                            allDay: event.target.checked,
                                        })
                                    }
                                    className="h-3.5 w-3.5 accent-pin-todo"
                                />
                                <span className="text-xs font-semibold text-ink-soft">
                                    All day
                                </span>
                            </label>
                            {!draft.occurrenceEdit &&
                                (() => {
                                const repeatLabels = describeRepeatPresets(
                                    draft.startDate,
                                    settings,
                                );
                                return (
                                    <>
                                        <label className="block space-y-1">
                                            <span className="text-xs font-semibold text-ink-soft">
                                                Repeat
                                            </span>
                                            <select
                                                value={draft.repeatPreset}
                                                onChange={(event) =>
                                                    setDraft({
                                                        ...draft,
                                                        repeatPreset: event
                                                            .target
                                                            .value as RepeatPreset,
                                                    })
                                                }
                                                className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                            >
                                                <option value="none">
                                                    Does not repeat
                                                </option>
                                                <option value="daily">
                                                    {repeatLabels.daily}
                                                </option>
                                                <option value="weekly">
                                                    {repeatLabels.weekly}
                                                </option>
                                                <option value="monthlyNthWeekday">
                                                    {
                                                        repeatLabels.monthlyNthWeekday
                                                    }
                                                </option>
                                                <option value="annually">
                                                    {repeatLabels.annually}
                                                </option>
                                                <option value="weekdays">
                                                    {repeatLabels.weekdays}
                                                </option>
                                                <option value="custom">
                                                    Custom…
                                                </option>
                                            </select>
                                        </label>

                                        {draft.repeatPreset === "custom" && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-ink-soft">
                                                        Repeat every
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={
                                                            draft.customInterval
                                                        }
                                                        onChange={(event) =>
                                                            setDraft({
                                                                ...draft,
                                                                customInterval:
                                                                    Math.max(
                                                                        1,
                                                                        Number(
                                                                            event
                                                                                .target
                                                                                .value,
                                                                        ) || 1,
                                                                    ),
                                                            })
                                                        }
                                                        className="w-16 rounded-xl border border-paper-edge bg-board/40 px-2 py-1.5 text-sm outline-none"
                                                    />
                                                    <select
                                                        value={
                                                            draft.customUnit
                                                        }
                                                        onChange={(event) =>
                                                            setDraft({
                                                                ...draft,
                                                                customUnit: event
                                                                    .target
                                                                    .value as CustomRepeatUnit,
                                                            })
                                                        }
                                                        className="rounded-xl border border-paper-edge bg-board/40 px-2 py-1.5 text-sm outline-none"
                                                    >
                                                        {(
                                                            Object.keys(
                                                                CUSTOM_UNIT_LABELS,
                                                            ) as CustomRepeatUnit[]
                                                        ).map((unit) => (
                                                            <option
                                                                key={unit}
                                                                value={unit}
                                                            >
                                                                {draft.customInterval ===
                                                                1
                                                                    ? CUSTOM_UNIT_LABELS[
                                                                          unit
                                                                      ]
                                                                          .singular
                                                                    : CUSTOM_UNIT_LABELS[
                                                                          unit
                                                                      ]
                                                                          .plural}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {draft.customUnit ===
                                                    "week" && (
                                                    <div className="flex gap-1">
                                                        {WEEKDAY_TOGGLES.map(
                                                            ({
                                                                index,
                                                                label,
                                                            }) => {
                                                                const active =
                                                                    draft.customWeekdays.includes(
                                                                        index,
                                                                    );
                                                                return (
                                                                    <button
                                                                        key={
                                                                            index
                                                                        }
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setDraft(
                                                                                {
                                                                                    ...draft,
                                                                                    customWeekdays:
                                                                                        active
                                                                                            ? draft.customWeekdays.filter(
                                                                                                  (
                                                                                                      d,
                                                                                                  ) =>
                                                                                                      d !==
                                                                                                      index,
                                                                                              )
                                                                                            : [
                                                                                                  ...draft.customWeekdays,
                                                                                                  index,
                                                                                              ],
                                                                                },
                                                                            )
                                                                        }
                                                                        className={`h-7 w-7 rounded-full text-xs font-semibold hover:cursor-pointer ${
                                                                            active
                                                                                ? "bg-pin-todo text-ink"
                                                                                : "border border-paper-edge text-ink-soft hover:bg-black/5"
                                                                        }`}
                                                                    >
                                                                        {
                                                                            label
                                                                        }
                                                                    </button>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {draft.repeatPreset !== "none" && (
                                            <div className="space-y-1.5">
                                                <span className="text-xs font-semibold text-ink-soft">
                                                    Ends
                                                </span>
                                                <div className="flex flex-wrap items-center gap-3 text-xs text-ink">
                                                    <label className="flex items-center gap-1.5">
                                                        <input
                                                            type="radio"
                                                            checked={
                                                                draft.repeatEndMode ===
                                                                "never"
                                                            }
                                                            onChange={() =>
                                                                setDraft({
                                                                    ...draft,
                                                                    repeatEndMode:
                                                                        "never",
                                                                })
                                                            }
                                                            className="accent-pin-todo"
                                                        />
                                                        Never
                                                    </label>
                                                    <label className="flex items-center gap-1.5">
                                                        <input
                                                            type="radio"
                                                            checked={
                                                                draft.repeatEndMode ===
                                                                "onDate"
                                                            }
                                                            onChange={() =>
                                                                setDraft({
                                                                    ...draft,
                                                                    repeatEndMode:
                                                                        "onDate",
                                                                })
                                                            }
                                                            className="accent-pin-todo"
                                                        />
                                                        On
                                                        <input
                                                            type="date"
                                                            value={
                                                                draft.repeatEndDate
                                                            }
                                                            onChange={(
                                                                event,
                                                            ) =>
                                                                setDraft({
                                                                    ...draft,
                                                                    repeatEndMode:
                                                                        "onDate",
                                                                    repeatEndDate:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                })
                                                            }
                                                            className="rounded-lg border border-paper-edge bg-board/40 px-2 py-1 text-xs outline-none"
                                                        />
                                                    </label>
                                                    <label className="flex items-center gap-1.5">
                                                        <input
                                                            type="radio"
                                                            checked={
                                                                draft.repeatEndMode ===
                                                                "afterCount"
                                                            }
                                                            onChange={() =>
                                                                setDraft({
                                                                    ...draft,
                                                                    repeatEndMode:
                                                                        "afterCount",
                                                                })
                                                            }
                                                            className="accent-pin-todo"
                                                        />
                                                        After
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={
                                                                draft.repeatCount
                                                            }
                                                            onChange={(
                                                                event,
                                                            ) =>
                                                                setDraft({
                                                                    ...draft,
                                                                    repeatEndMode:
                                                                        "afterCount",
                                                                    repeatCount:
                                                                        Math.max(
                                                                            1,
                                                                            Number(
                                                                                event
                                                                                    .target
                                                                                    .value,
                                                                            ) ||
                                                                                1,
                                                                        ),
                                                                })
                                                            }
                                                            className="w-14 rounded-lg border border-paper-edge bg-board/40 px-2 py-1 text-xs outline-none"
                                                        />
                                                        occurrences
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                            <label className="block space-y-1">
                                <span className="text-xs font-semibold text-ink-soft">
                                    Description
                                </span>
                                <textarea
                                    value={draft.description}
                                    onChange={(event) =>
                                        setDraft({
                                            ...draft,
                                            description: event.target.value,
                                        })
                                    }
                                    rows={3}
                                    className="w-full resize-none rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                />
                            </label>
                            <label className="block space-y-1">
                                <span className="text-xs font-semibold text-ink-soft">
                                    Location
                                </span>
                                <input
                                    value={draft.location}
                                    onChange={(event) =>
                                        setDraft({
                                            ...draft,
                                            location: event.target.value,
                                        })
                                    }
                                    className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                />
                            </label>
                        </fieldset>
                        {draftError && (
                            <p className="mt-3 text-xs text-pin-timer">
                                {draftError}
                            </p>
                        )}
                        <div className="mt-5 flex justify-between gap-2">
                            {draft.id || draft.occurrenceEdit ? (
                                <button
                                    type="button"
                                    onClick={() => void handleDeleteEvent()}
                                    disabled={readOnlyCalendar}
                                    className="rounded-full px-4 py-2 text-sm font-semibold text-pin-timer hover:cursor-pointer hover:bg-pin-timer/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {draft.occurrenceEdit
                                        ? "Delete this event"
                                        : "Delete"}
                                </button>
                            ) : (
                                <span />
                            )}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDraft(null)}
                                    className="rounded-full border border-paper-edge px-4 py-2 text-sm font-semibold hover:cursor-pointer hover:bg-black/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleSaveEvent()}
                                    disabled={
                                        !draft.title.trim() || readOnlyCalendar
                                    }
                                    className="rounded-full bg-pin-todo px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50
                                    hover:cursor-pointer"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {scopeChoice && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-xs rounded-2xl border border-paper-edge bg-paper p-5 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                        <h2 className="mb-1 font-display text-base font-semibold">
                            {scopeChoice.title}
                        </h2>
                        <p className="mb-4 text-xs text-ink-soft">
                            This is a repeating event. What would you like to
                            change?
                        </p>
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => chooseScope("occurrence")}
                                className="rounded-full bg-pin-todo px-4 py-2 text-sm font-semibold hover:cursor-pointer hover:bg-pin-todo/90"
                            >
                                This event
                            </button>
                            <button
                                type="button"
                                onClick={() => chooseScope("series")}
                                className="rounded-full border border-paper-edge px-4 py-2 text-sm font-semibold hover:cursor-pointer hover:bg-black/5"
                            >
                                All events
                            </button>
                            <button
                                type="button"
                                onClick={() => setScopeChoice(null)}
                                className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:cursor-pointer hover:bg-black/5"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
