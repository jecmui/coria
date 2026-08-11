import { useEffect, useRef, useState } from "react";
import { useCalendarStore } from "../../store/calendarStore";
import {
    DAY_COLUMN_MIN_WIDTH,
    formatDayName,
    formatMonthDay,
    formatTime,
    sameCalendarDay,
} from "../../lib/calendar";

interface CalendarWidgetProps {
    onOpenCalendar: () => void;
}

export function CalendarWidget({ onOpenCalendar }: CalendarWidgetProps) {
    const events = useCalendarStore((s) => s.events);
    const settings = useCalendarStore((s) => s.settings);
    const loadEvents = useCalendarStore((s) => s.loadEvents);
    const [dayCount, setDayCount] = useState(1);
    const containerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const start = new Date();
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setDate(end.getDate() + 8);
        end.setHours(0, 0, 0, 0);
        void loadEvents(start.toISOString(), end.toISOString());
    }, [loadEvents]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const update = () => {
            const count = Math.max(
                1,
                Math.floor(element.clientWidth / DAY_COLUMN_MIN_WIDTH),
            );
            setDayCount(count % 2 === 0 ? Math.max(1, count - 1) : count);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const today = new Date();
    const days = Array.from({ length: dayCount }, (_, index) => {
        const offset = index - Math.floor(dayCount / 2);
        const day = new Date(today);
        day.setDate(day.getDate() + offset);
        return day;
    });

    return (
        <button
            ref={containerRef}
            type="button"
            onClick={onOpenCalendar}
            className="flex h-full min-h-0 w-full overflow-hidden rounded-md bg-paper text-left hover:cursor-pointer"
            aria-label="Open calendar"
        >
            {days.map((day) => {
                const dayEvents = events.filter((event) =>
                    sameCalendarDay(
                        new Date(event.startsAt),
                        day,
                        settings.timeZone,
                    ),
                );
                return (
                    <div
                        key={day.toISOString()}
                        className="min-w-0 flex-1 border-r border-paper-edge last:border-r-0"
                    >
                        <div className="border-b border-paper-edge px-2 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase text-ink-soft">
                                {formatDayName(day, settings)}
                            </p>
                            <p
                                className={`font-display text-sm font-semibold ${sameCalendarDay(day, today, settings.timeZone) ? "text-pin-todo" : "text-ink"}`}
                            >
                                {formatMonthDay(day, settings)}
                            </p>
                        </div>
                        <div className="space-y-1 overflow-hidden p-1.5">
                            {dayEvents.slice(0, 5).map((event) => (
                                <div
                                    key={event.id}
                                    className="rounded-md bg-pin-todo/25 px-1.5 py-1 text-[10px] leading-tight text-ink"
                                >
                                    <p className="truncate font-semibold">
                                        {event.title}
                                    </p>
                                    <p className="truncate text-ink-soft">
                                        {formatTime(
                                            new Date(event.startsAt),
                                            settings,
                                        )}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </button>
    );
}
