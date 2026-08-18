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
}

export interface CalendarSettings {
    weekStart: number;
    dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
    timeFormat: "12h" | "24h";
    timeZone: string;
    defaultEventDuration: number;
}
