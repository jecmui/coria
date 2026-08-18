import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import { useCalendarStore } from "../../store/calendarStore";
import {
    DAY_COLUMN_MIN_WIDTH,
    addDays,
    allDayBarLeft,
    allDayBarWidth,
    computeAllDayDayInfo,
    eventOverlapsDay,
    expandRecurringEvents,
    formatDayName,
    formatMonthDay,
    formatTime,
    layoutAllDayEvents,
    sameCalendarDay,
    startOfDay,
} from "../../lib/calendar";

interface CalendarWidgetProps {
    onOpenCalendar: () => void;
    /** Called whenever "today" moves in or out of the visible range, so a
     *  host (the board's widget title bar) can show/hide its own "Today"
     *  jump-back control without needing to duplicate this widget's own
     *  day-count/offset math. */
    onTodayVisibleChange?: (visible: boolean) => void;
}

export interface CalendarWidgetHandle {
    resetToToday: () => void;
}

/** Rendered height (px) of this widget's compact weekday-name + date block
 *  (smaller type than the full Calendar page's header, so it needs its own
 *  measured constant) -- all-day bars are absolutely positioned starting
 *  right after it. */
const HEADER_TEXT_HEIGHT = 43;
/** Rendered height (px) of one stacked all-day bar, margin included --
 *  shares the full Calendar page's bar styling, so the same measurement applies. */
const ALL_DAY_BAR_HEIGHT = 23;
const ALL_DAY_OVERFLOW_THRESHOLD = 3;
const ALL_DAY_VISIBLE_WHEN_COLLAPSED = 2;

export const CalendarWidget = forwardRef<
    CalendarWidgetHandle,
    CalendarWidgetProps
>(function CalendarWidget({ onOpenCalendar, onTodayVisibleChange }, ref) {
    const events = useCalendarStore((s) => s.events);
    const settings = useCalendarStore((s) => s.settings);
    const loadEvents = useCalendarStore((s) => s.loadEvents);
    const [dayCount, setDayCount] = useState(1);
    const [dayOffset, setDayOffset] = useState(0);
    const [allDayExpanded, setAllDayExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
        resetToToday: () => setDayOffset(0),
    }));

    useEffect(() => {
        // Padded well past what's currently visible, so a few clicks of the
        // day-navigation arrows don't run past the loaded window -- and wide
        // enough for however many days a very wide widget/screen can show.
        const anchor = addDays(new Date(), dayOffset);
        const padding = Math.max(7, Math.ceil(dayCount / 2) + 2);
        const start = startOfDay(addDays(anchor, -padding));
        const end = startOfDay(addDays(anchor, padding + 1));
        void loadEvents(start.toISOString(), end.toISOString());
    }, [loadEvents, dayOffset, dayCount]);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        // Each additional day needs its own full DAY_COLUMN_MIN_WIDTH before
        // it appears -- no forced parity, no cap beyond what the width allows.
        const update = () => {
            setDayCount(
                Math.max(
                    1,
                    Math.floor(element.clientWidth / DAY_COLUMN_MIN_WIDTH),
                ),
            );
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const today = new Date();
    const anchor = addDays(today, dayOffset);
    // Leans toward the future on ties (e.g. 2 days shows today+tomorrow, not
    // yesterday+today) -- daysBefore rounds *down*, so any extra day from an
    // even count lands after the anchor instead of before it.
    const daysBefore = Math.floor((dayCount - 1) / 2);
    const days = Array.from({ length: dayCount }, (_, index) =>
        addDays(anchor, index - daysBefore),
    );
    const todayVisible = days.some((day) =>
        sameCalendarDay(day, today, settings.timeZone),
    );

    useEffect(() => {
        onTodayVisibleChange?.(todayVisible);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todayVisible]);

    // Expands recurring masters into this range's concrete occurrences (and
    // filters non-recurring events to the same overlap check as before) in
    // one pass -- see expandRecurringEvents in lib/calendar.ts.
    const rangeStart = days[0];
    const rangeEnd = addDays(days[days.length - 1], 1);
    const visibleEvents = expandRecurringEvents(
        events,
        rangeStart,
        rangeEnd,
        settings.timeZone,
    );

    // Same all-day layout system as the full Calendar page (lib/calendar.ts):
    // continuous multi-day bars, always shown and prioritized over single-day
    // ones, with per-day "+N more"/"Collapse" truncation when a day has too many.
    const allDayLayout = layoutAllDayEvents(
        visibleEvents.filter((event) => event.allDay),
        days,
        settings.timeZone,
    );
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
        // The day-columns area is the "open calendar" click target. It has to
        // be a div (not a button) since it contains real buttons of its own
        // (the arrows, and the +N more/Collapse controls) -- a button can't
        // nest interactive content, so this uses role="button" instead.
        <div
            role="button"
            tabIndex={0}
            onClick={onOpenCalendar}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenCalendar();
                }
            }}
            aria-label="Open calendar"
            className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md bg-paper text-left hover:cursor-pointer"
        >
            <div
                ref={containerRef}
                className="relative flex w-full shrink-0"
                style={{ minHeight: headerRowHeight }}
            >
                {/* Arrows overlay the weekday/date block only -- not the
                    all-day bars stacked below it -- so they don't shrink how
                    much room is left for day columns and don't sit on top of
                    all-day events. */}
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        setDayOffset((offset) => offset - 1);
                    }}
                    aria-label="Previous day"
                    style={{ top: 0, height: HEADER_TEXT_HEIGHT }}
                    className="absolute left-0 z-20 flex w-4 items-center justify-center bg-paper/90 text-ink-soft hover:cursor-pointer hover:bg-black/5 hover:text-ink"
                >
                    ‹
                </button>
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        setDayOffset((offset) => offset + 1);
                    }}
                    aria-label="Next day"
                    style={{ top: 0, height: HEADER_TEXT_HEIGHT }}
                    className="absolute right-0 z-20 flex w-4 items-center justify-center bg-paper/90 text-ink-soft hover:cursor-pointer hover:bg-black/5 hover:text-ink"
                >
                    ›
                </button>
                {days.map((day, index) => (
                    <div
                        key={day.toISOString()}
                        className={`min-w-0 flex-1 border-paper-edge px-2 pb-2 text-center ${index === days.length - 1 ? "" : "border-r"}`}
                    >
                        <p className="text-[10px] font-semibold uppercase text-ink-soft">
                            {formatDayName(day, settings)}
                        </p>
                        <p
                            className={`font-display text-sm font-semibold ${sameCalendarDay(day, today, settings.timeZone) ? "text-pin-todo" : "text-ink"}`}
                        >
                            {formatMonthDay(day, settings)}
                        </p>
                    </div>
                ))}
                {visibleAllDayLayout.map((item) => (
                    <div
                        key={item.event.id}
                        style={{
                            top:
                                HEADER_TEXT_HEIGHT +
                                item.row * ALL_DAY_BAR_HEIGHT,
                            left: allDayBarLeft(item.startCol, dayCount),
                            width: allDayBarWidth(
                                item.startCol,
                                item.endCol,
                                dayCount,
                            ),
                        }}
                        className="absolute z-10 truncate rounded-md border border-pin-todo/40 bg-pin-todo/70 px-1.5 py-0.5 text-left text-[10px] font-medium text-ink shadow-sm"
                    >
                        {item.event.title}
                    </div>
                ))}
                {allDayPerDay.map(
                    (day, index) =>
                        day.overflows && (
                            <button
                                key={`allday-toggle-${index}`}
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setAllDayExpanded((e) => !e);
                                }}
                                style={{
                                    top: day.controlTop,
                                    left: allDayBarLeft(index, dayCount),
                                    width: allDayBarWidth(
                                        index,
                                        index,
                                        dayCount,
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

            <div className="flex min-h-0 flex-1 border-t border-paper-edge">
                {days.map((day, index) => {
                    const dayEvents = visibleEvents.filter(
                        (event) =>
                            !event.allDay &&
                            eventOverlapsDay(event, day, settings.timeZone),
                    );
                    return (
                        <div
                            key={day.toISOString()}
                            className={`min-w-0 flex-1 space-y-1 overflow-hidden border-paper-edge p-1.5 ${index === days.length - 1 ? "" : "border-r"}`}
                        >
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
                    );
                })}
            </div>
        </div>
    );
});
