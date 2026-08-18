import { useEffect, useMemo, useState } from "react";
import { useCalendarStore } from "../store/calendarStore";
import type { CalendarEvent } from "../types/calendar";
import {
    HOUR_HEIGHT,
    addDays,
    addDaysToDateValue,
    allDayBarLeft,
    allDayBarWidth,
    computeAllDayDayInfo,
    dateInputValue,
    eventOverlapsDay,
    eventTopAndHeight,
    formatDayName,
    formatHour,
    formatTime,
    getWeekStart,
    inputValuesToUtcIso,
    layoutAllDayEvents,
    sameCalendarDay,
    timeInputValue,
} from "../lib/calendar";

interface CalendarPageProps {
    onBack: () => void;
}

interface EventDraft {
    id?: string;
    title: string;
    description: string;
    location: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    allDay: boolean;
}

const WEEKDAYS = Array.from({ length: 7 }, (_, index) => index);
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

export function CalendarPage({ onBack }: CalendarPageProps) {
    const {
        events,
        settings,
        loading,
        error,
        loadEvents,
        addEvent,
        updateEvent,
        removeEvent,
    } = useCalendarStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [draft, setDraft] = useState<EventDraft | null>(null);
    const [allDayExpanded, setAllDayExpanded] = useState(false);

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

    function editEvent(event: CalendarEvent) {
        setDraft({
            id: event.id,
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
        });
    }

    async function handleSaveEvent() {
        if (
            !draft?.title.trim() ||
            !draft.startDate ||
            !draft.endDate ||
            (!draft.allDay && (!draft.startTime || !draft.endTime))
        )
            return;
        // All-day events ignore the time-of-day inputs and instead span the
        // full day(s) from startDate through endDate, exclusive end (the
        // start of the day after endDate), matching Google Calendar.
        const event = {
            title: draft.title.trim(),
            description: draft.description.trim(),
            location: draft.location.trim(),
            startsAt: draft.allDay
                ? inputValuesToUtcIso(
                      draft.startDate,
                      "00:00",
                      settings.timeZone,
                  )
                : inputValuesToUtcIso(
                      draft.startDate,
                      draft.startTime,
                      settings.timeZone,
                  ),
            endsAt: draft.allDay
                ? inputValuesToUtcIso(
                      addDaysToDateValue(draft.endDate, 1),
                      "00:00",
                      settings.timeZone,
                  )
                : inputValuesToUtcIso(
                      draft.endDate,
                      draft.endTime,
                      settings.timeZone,
                  ),
            allDay: draft.allDay,
        };
        if (new Date(event.endsAt) <= new Date(event.startsAt)) return;
        const saved = draft.id
            ? await updateEvent(draft.id, event)
            : await addEvent(event);
        if (saved !== false && saved !== null) setDraft(null);
    }

    async function handleDeleteEvent() {
        if (!draft?.id) return;
        if (await removeEvent(draft.id)) setDraft(null);
    }

    // Overlap with the visible week, not just a start within it -- otherwise an
    // event that began before this week but runs into it goes missing here too.
    const visibleWeekEnd = addDays(weekStart, 7);
    const visibleEvents = events.filter((event) => {
        const eventStart = new Date(event.startsAt);
        const eventEnd = new Date(event.endsAt);
        return eventStart < visibleWeekEnd && eventEnd > weekStart;
    });
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

                <div className="min-h-0 flex-1 overflow-auto">
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
                                onClick={() => editEvent(item.event)}
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

                    <div className="grid min-w-225 grid-cols-[64px_repeat(7,minmax(0,1fr))]">
                        <div className="sticky left-0 top-0 z-20 h-336 border-r border-paper-edge bg-paper/95">
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
                                    className="relative h-336 border-r border-paper-edge bg-paper/40"
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
                                    {dayEvents.map((event) => {
                                        const segment = eventTopAndHeight(
                                            event.startsAt,
                                            event.endsAt,
                                            day,
                                            settings.timeZone,
                                        );
                                        if (!segment) return null;
                                        const {
                                            top,
                                            height,
                                            continuesFromPrevDay,
                                            continuesToNextDay,
                                        } = segment;
                                        const showDetails =
                                            height >= HOUR_HEIGHT &&
                                            !continuesFromPrevDay;
                                        return (
                                            <button
                                                key={event.id}
                                                type="button"
                                                onMouseDown={(mouseEvent) =>
                                                    mouseEvent.stopPropagation()
                                                }
                                                onClick={(mouseEvent) => {
                                                    mouseEvent.stopPropagation();
                                                    editEvent(event);
                                                }}
                                                className={`absolute left-1 right-1 flex flex-col items-start justify-start overflow-hidden border border-pin-todo/40 bg-pin-todo/70 px-2 py-1 text-left text-xs text-ink shadow-sm hover:cursor-pointer hover:bg-pin-todo/8 ${
                                                    continuesFromPrevDay
                                                        ? ""
                                                        : "rounded-t-md"
                                                } ${
                                                    continuesToNextDay
                                                        ? ""
                                                        : "rounded-b-md"
                                                }`}
                                                style={{ top, height }}
                                            >
                                                <p className="w-full truncate font-semibold">
                                                    {continuesFromPrevDay
                                                        ? "‹ "
                                                        : ""}
                                                    {event.title}
                                                </p>
                                                {showDetails && (
                                                    <p className="mt-0.5 w-full whitespace-normal wrap-break-word text-[10px] leading-tight">
                                                        {formatTime(
                                                            new Date(
                                                                event.startsAt,
                                                            ),
                                                            settings,
                                                        )}
                                                        {event.location
                                                            ? ` · ${event.location}`
                                                            : ""}
                                                    </p>
                                                )}
                                            </button>
                                        );
                                    })}
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
                                {draft.id ? "Edit event" : "New event"}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setDraft(null)}
                                className="rounded-full px-2 text-lg text-ink-soft hover:cursor-pointer hover:bg-black/5"
                            >
                                ×
                            </button>
                        </div>
                        <div className="space-y-3">
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
                        </div>
                        <div className="mt-5 flex justify-between gap-2">
                            {draft.id ? (
                                <button
                                    type="button"
                                    onClick={() => void handleDeleteEvent()}
                                    className="rounded-full px-4 py-2 text-sm font-semibold text-pin-timer hover:cursor-pointer hover:bg-pin-timer/10"
                                >
                                    Delete
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
                                    disabled={!draft.title.trim()}
                                    className="rounded-full bg-pin-todo px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
