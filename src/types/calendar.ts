export type CalendarEventSource = "local" | "google";

export interface CalendarEvent {
    id: string;
    title: string;
    description: string;
    location: string;
    startsAt: string;
    endsAt: string;
    /** True for date-only events with no specific time, as Google Calendar
     *  represents all-day events. */
    allDay: boolean;
    /** Where the event originated. */
    source: CalendarEventSource;
    /** The originating provider's event id (e.g. Google's), used to map
     *  updates and deletes back to it. Null for locally-created events. */
    externalId: string | null;
    /** RFC 5545 RRULE value (no DTSTART -- startsAt is the anchor), or null
     *  for a non-recurring event. */
    recurrenceRule: string | null;
    /** The time zone this event (and its recurrenceRule, if any) was
     *  actually authored in -- Google's own per-event time zone when it has
     *  one, null for locally-created events (authored in the calendar's own
     *  time zone). startsAt/endsAt are timezone-independent UTC instants
     *  regardless, so this only matters for expanding recurrenceRule --
     *  see expandRecurringEvents. */
    eventTimeZone: string | null;
    /** Two-way sync groundwork: true when this event's local state hasn't
     *  been pushed to its external provider yet (set on every local
     *  create/edit/delete). Always true for a purely local event with no
     *  provider to sync to. */
    dirty: boolean;
    /** Set only on occurrences synthesized by expandRecurringEvents -- holds
     *  the master row's real id, so edit/delete route back to the whole
     *  series instead of this one occurrence's synthetic id. Absent on
     *  events read directly from the store. */
    instanceOf?: string;
}

export interface CalendarSettings {
    weekStart: number;
    dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
    timeFormat: "12h" | "24h";
    timeZone: string;
    defaultEventDuration: number;
}
