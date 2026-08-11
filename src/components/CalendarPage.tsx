import { useEffect, useMemo, useRef, useState } from "react";
import { useCalendarStore } from "../store/calendarStore";
import type { CalendarEvent } from "../types/calendar";
import {
    HOUR_HEIGHT,
    addDays,
    dateInputValue,
    eventTopAndHeight,
    formatDayName,
    formatHour,
    formatMonthDay,
    formatTime,
    getWeekStart,
    inputValuesToUtcIso,
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
}

const WEEKDAYS = Array.from({ length: 7 }, (_, index) => index);

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
    const [dragStart, setDragStart] = useState<{
        day: Date;
        minutes: number;
    } | null>(null);
    const [dragEnd, setDragEnd] = useState<{
        day: Date;
        minutes: number;
    } | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

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

    function minutesFromPointer(clientY: number) {
        const grid = gridRef.current;
        if (!grid) return 0;
        const rect = grid.getBoundingClientRect();
        const minutes = ((clientY - rect.top) / HOUR_HEIGHT) * 60;
        return Math.min(
            23 * 60 + 59,
            Math.max(0, Math.round(minutes / 15) * 15),
        );
    }

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

    function handleGridMouseDown(day: Date, event: React.MouseEvent) {
        if (event.button !== 0) return;
        const minutes = minutesFromPointer(event.clientY);
        setDragStart({ day, minutes });
        setDragEnd({ day, minutes: minutes + 15 });
    }

    useEffect(() => {
        if (!dragStart) return;
        const activeDragStart = dragStart;
        function handleMouseMove(event: MouseEvent) {
            setDragEnd({
                day: activeDragStart.day,
                minutes: minutesFromPointer(event.clientY),
            });
        }
        function handleMouseUp() {
            if (!dragStart || !dragEnd) return;
            const startMinutes = Math.min(
                activeDragStart.minutes,
                dragEnd.minutes,
            );
            const endMinutes = Math.max(
                activeDragStart.minutes,
                dragEnd.minutes,
            );
            openNewEvent(
                activeDragStart.day,
                startMinutes,
                endMinutes > startMinutes ? endMinutes : undefined,
            );
            setDragStart(null);
            setDragEnd(null);
        }
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [dragStart, dragEnd]);

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
        });
    }

    async function handleSaveEvent() {
        if (
            !draft?.title.trim() ||
            !draft.startDate ||
            !draft.startTime ||
            !draft.endDate ||
            !draft.endTime
        )
            return;
        const event = {
            title: draft.title.trim(),
            description: draft.description.trim(),
            location: draft.location.trim(),
            startsAt: inputValuesToUtcIso(
                draft.startDate,
                draft.startTime,
                settings.timeZone,
            ),
            endsAt: inputValuesToUtcIso(
                draft.endDate,
                draft.endTime,
                settings.timeZone,
            ),
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

    const visibleEvents = events.filter((event) =>
        days.some((day) =>
            sameCalendarDay(new Date(event.startsAt), day, settings.timeZone),
        ),
    );

    return (
        <div className="flex h-full w-full flex-col bg-board px-3 py-4 font-body text-ink sm:px-5 sm:py-5">
            <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-paper-edge bg-paper/95 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-paper-edge px-4 py-3 sm:px-5">
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
                        {formatMonthDay(days[0], settings)} –{" "}
                        {formatMonthDay(days[6], settings)}
                    </h1>
                    {loading && (
                        <span className="text-xs text-ink-soft">Loading…</span>
                    )}
                    {error && (
                        <span className="text-xs text-pin-timer">
                            Couldn't load events.
                        </span>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                    <div className="grid min-w-[900px] grid-cols-[64px_repeat(7,minmax(0,1fr))]">
                        <div className="sticky top-0 z-20 border-b border-r border-paper-edge bg-paper" />
                        {days.map((day) => {
                            const today = sameCalendarDay(
                                day,
                                new Date(),
                                settings.timeZone,
                            );
                            return (
                                <div
                                    key={day.toISOString()}
                                    className={`sticky top-0 z-20 border-b border-r border-paper-edge bg-paper px-2 py-2 text-center ${today ? "text-pin-todo" : "text-ink"}`}
                                >
                                    <p className="text-[10px] font-semibold uppercase text-ink-soft">
                                        {formatDayName(day, settings)}
                                    </p>
                                    <p className="font-display text-lg font-semibold">
                                        {formatMonthDay(day, settings)}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <div
                        ref={gridRef}
                        className="grid min-w-[900px] grid-cols-[64px_repeat(7,minmax(0,1fr))]"
                    >
                        <div className="relative h-[1344px] border-r border-paper-edge">
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
                            const dayEvents = visibleEvents.filter((event) =>
                                sameCalendarDay(
                                    new Date(event.startsAt),
                                    day,
                                    settings.timeZone,
                                ),
                            );
                            return (
                                <div
                                    key={day.toISOString()}
                                    className="relative h-[1344px] border-r border-paper-edge bg-paper/40"
                                    onMouseDown={(event) =>
                                        handleGridMouseDown(day, event)
                                    }
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
                                        const { top, height } =
                                            eventTopAndHeight(
                                                event.startsAt,
                                                event.endsAt,
                                                day,
                                                settings.timeZone,
                                            );
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
                                                className="absolute left-1 right-1 overflow-hidden rounded-md border border-pin-todo/40 bg-pin-todo/70 px-2 py-1 text-left text-xs text-ink shadow-sm hover:cursor-pointer hover:bg-pin-todo/85"
                                                style={{ top, height }}
                                            >
                                                <p className="truncate font-semibold">
                                                    {event.title}
                                                </p>
                                                <p className="truncate text-[10px]">
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
                                    <input
                                        type="datetime-local"
                                        value={`${draft.startDate}T${draft.startTime}`}
                                        onChange={(event) => {
                                            const [date, time] =
                                                event.target.value.split("T");
                                            setDraft({
                                                ...draft,
                                                startDate: date,
                                                startTime: time,
                                            });
                                        }}
                                        className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                    />
                                </label>
                                <label className="block space-y-1">
                                    <span className="text-xs font-semibold text-ink-soft">
                                        End
                                    </span>
                                    <input
                                        type="datetime-local"
                                        value={`${draft.endDate}T${draft.endTime}`}
                                        onChange={(event) => {
                                            const [date, time] =
                                                event.target.value.split("T");
                                            setDraft({
                                                ...draft,
                                                endDate: date,
                                                endTime: time,
                                            });
                                        }}
                                        className="w-full rounded-xl border border-paper-edge bg-board/40 px-3 py-2 text-sm outline-none"
                                    />
                                </label>
                            </div>
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
