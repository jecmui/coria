export type CalendarEventSource = "local" | "google";

/** One of a user's calendars (multi-calendar groundwork for Google Calendar
 *  sync, where an account can have several). Every user has exactly one
 *  isPrimary calendar, auto-created at signup, which is where an event lands
 *  when no calendar is explicitly chosen. externalCalendarId maps this row
 *  to a synced provider calendar, null for a purely local one. */
export interface Calendar {
    id: string;
    name: string;
    color: string | null;
    isPrimary: boolean;
    externalCalendarId: string | null;
    /** Whether Coria can actually write to the linked Google calendar --
     *  false for one added read-only through the "manage synced calendars"
     *  picker (Settings > Calendar). Always true for a purely local
     *  calendar. CalendarPage.tsx checks this before letting an event be
     *  edited or deleted, since a change to one Coria can't write back
     *  would just fail at Google on the next push. */
    isWritable: boolean;
}

export interface CalendarEvent {
    id: string;
    /** The calendar this event belongs to -- see Calendar above. */
    calendarId: string;
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
    /** READY-05: this event's last-known raw Google Calendar API object,
     *  verbatim -- attendees, reminders, conferenceData, colorId,
     *  visibility, and anything else Coria's schema doesn't have a column
     *  for. Null for a locally-created event. A local edit never touches
     *  this field (see updateEvent in calendarStore.ts), so it survives
     *  edits untouched until a future pull refreshes it -- see
     *  mergeGoogleEventPatch in lib/calendar.ts for how a future push
     *  merges Coria's own changes into it instead of overwriting the whole
     *  event with only what Coria tracks. */
    externalRaw: Record<string, unknown> | null;
    /** Two-way sync groundwork: true when this event's local state hasn't
     *  been pushed to its external provider yet (set on every local
     *  create/edit/delete). Always true for a purely local event with no
     *  provider to sync to. */
    dirty: boolean;
    /** Kept trustworthy by a database trigger (bumped on every update
     *  regardless of code path) so it can stand in for "this app's own
     *  last-write time" in the READY-03 conflict policy -- see
     *  resolveEventConflict in lib/calendar.ts. */
    updatedAt: string;
    /** Set only on occurrences synthesized by expandRecurringEvents -- holds
     *  the master row's real id, so edit/delete route back to the whole
     *  series instead of this one occurrence's synthetic id. Absent on
     *  events read directly from the store. */
    instanceOf?: string;
    /** Set only on occurrences synthesized by expandRecurringEvents from a
     *  recurring master -- the occurrence's un-modified starts_at (before
     *  any exception override), matching EventException.originalStartTime.
     *  Identifies which occurrence this is independent of any override that
     *  already moved its own startsAt, so a second edit still targets the
     *  same exception row instead of creating a new one. */
    originalStartTime?: string;
    /** Set only when this synthesized occurrence already has an
     *  EventException row overriding it -- that exception's own id, so
     *  saving an edit updates it in place instead of upserting blind. */
    exceptionId?: string;
}

/** A single occurrence of a recurring event edited or cancelled
 *  independently of the rest of its series (READY-04) -- mirrors how
 *  Google itself models a single-occurrence exception (a row with
 *  recurringEventId + originalStartTime). masterEventId points back to the
 *  recurring CalendarEvent this exception belongs to; originalStartTime
 *  identifies which occurrence it overrides, by that occurrence's
 *  un-modified startsAt (before any override) as expandRecurringEvents
 *  would have produced it. When isCancelled is true, the rest of the
 *  fields are meaningless (the occurrence is simply skipped); otherwise
 *  they replace the master's own title/description/location/startsAt/
 *  endsAt/allDay for this occurrence only. */
export interface EventException {
    id: string;
    masterEventId: string;
    originalStartTime: string;
    isCancelled: boolean;
    title: string | null;
    description: string | null;
    location: string | null;
    startsAt: string | null;
    endsAt: string | null;
    allDay: boolean | null;
    externalId: string | null;
    /** Same READY-05 groundwork as CalendarEvent.externalRaw above -- an
     *  exception is itself a syncable Google event once it has an
     *  externalId, so it needs the same verbatim-hold-and-merge treatment. */
    externalRaw: Record<string, unknown> | null;
}

/** Phase 2: whether (and as which Google account) the signed-in user has
 *  connected Google Calendar. providerAccountId is the connected account's
 *  email, populated by google-oauth-callback from its primary calendar's
 *  own id. Absent (null from loadGoogleConnection) when never connected. */
export interface GoogleConnection {
    id: string;
    providerAccountId: string | null;
    /** READY-08's polling cadence: how often a background sync pass should
     *  run for this connection, since Coria polls rather than receiving
     *  webhooks from Google. */
    pollIntervalSeconds: number;
}

export interface CalendarSettings {
    weekStart: number;
    dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
    timeFormat: "12h" | "24h";
    timeZone: string;
    defaultEventDuration: number;
}
