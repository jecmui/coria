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
