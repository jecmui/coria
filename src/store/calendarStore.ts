import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type {
    Calendar,
    CalendarEvent,
    CalendarEventSource,
    CalendarSettings,
    EventException,
} from "../types/calendar";

/** Fields a caller can create/update an event without specifying -- creation
 *  defaults them (see addEvent), and updates leave them untouched so editing
 *  an event through the local UI can't clobber a mirrored event's Google
 *  linkage. `dirty` and `eventTimeZone` are here for a different reason:
 *  they're entirely store-managed (every local create/edit forces them to a
 *  specific value, regardless of what a caller passes), never something a
 *  caller should set itself. `calendarId` defaults to the user's primary
 *  calendar on creation (see addEvent) since there's no calendar picker in
 *  the UI yet. `externalRaw` (READY-05) is the same "leave untouched"
 *  category as allDay/source/externalId: the local edit UI never passes
 *  it, so updateEvent's conditional payload omits the column entirely
 *  rather than clobbering it back to null -- see mergeGoogleEventPatch in
 *  lib/calendar.ts for why that matters. */
type OptionalEventFields =
    | "allDay"
    | "source"
    | "externalId"
    | "dirty"
    | "eventTimeZone"
    | "calendarId"
    | "externalRaw";

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
    weekStart: 0,
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    defaultEventDuration: 60,
};

interface CalendarEventRow {
    id: string;
    calendar_id: string;
    title: string;
    description: string | null;
    location: string | null;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    source: string;
    external_id: string | null;
    recurrence_rule: string | null;
    dirty: boolean;
    event_time_zone: string | null;
    updated_at: string;
    external_raw: Record<string, unknown> | null;
}

const EVENT_COLUMNS =
    "id, calendar_id, title, description, location, starts_at, ends_at, all_day, source, external_id, recurrence_rule, dirty, event_time_zone, updated_at, external_raw";

interface CalendarRow {
    id: string;
    name: string;
    color: string | null;
    is_primary: boolean;
    external_calendar_id: string | null;
}

const CALENDAR_COLUMNS = "id, name, color, is_primary, external_calendar_id";

function rowToCalendar(row: CalendarRow): Calendar {
    return {
        id: row.id,
        name: row.name,
        color: row.color,
        isPrimary: row.is_primary,
        externalCalendarId: row.external_calendar_id,
    };
}

interface EventExceptionRow {
    id: string;
    master_event_id: string;
    original_start_time: string;
    is_cancelled: boolean;
    title: string | null;
    description: string | null;
    location: string | null;
    starts_at: string | null;
    ends_at: string | null;
    all_day: boolean | null;
    external_id: string | null;
    external_raw: Record<string, unknown> | null;
}

const EXCEPTION_COLUMNS =
    "id, master_event_id, original_start_time, is_cancelled, title, description, location, starts_at, ends_at, all_day, external_id, external_raw";

function rowToException(row: EventExceptionRow): EventException {
    return {
        id: row.id,
        masterEventId: row.master_event_id,
        originalStartTime: row.original_start_time,
        isCancelled: row.is_cancelled,
        title: row.title,
        description: row.description,
        location: row.location,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        allDay: row.all_day,
        externalId: row.external_id,
        externalRaw: row.external_raw,
    };
}

/** The fields a single-occurrence edit can override -- the same shape as
 *  what the edit modal collects, minus recurrence (a single occurrence
 *  can't have its own repeat rule). */
interface EventExceptionFields {
    title: string;
    description: string;
    location: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
}

interface CalendarState {
    userId: string | null;
    events: CalendarEvent[];
    calendars: Calendar[];
    exceptions: EventException[];
    settings: CalendarSettings;
    loading: boolean;
    settingsLoading: boolean;
    error: string | null;
    settingsError: string | null;
    load: (userId: string) => Promise<void>;
    loadEvents: (start: string, end: string) => Promise<void>;
    saveSettings: (settings: CalendarSettings) => Promise<boolean>;
    addEvent: (
        event: Omit<CalendarEvent, "id" | "updatedAt" | OptionalEventFields> &
            Partial<Pick<CalendarEvent, OptionalEventFields>>,
    ) => Promise<CalendarEvent | null>;
    updateEvent: (
        id: string,
        event: Omit<CalendarEvent, "id" | "updatedAt" | OptionalEventFields> &
            Partial<Pick<CalendarEvent, OptionalEventFields>>,
    ) => Promise<boolean>;
    removeEvent: (id: string) => Promise<boolean>;
    /** READY-04: overrides one occurrence of a recurring series, upserting
     *  by (masterEventId, originalStartTime) -- creates a new exception the
     *  first time a given occurrence is edited, updates it in place on
     *  every edit after that. */
    saveEventException: (
        masterEventId: string,
        originalStartTime: string,
        fields: EventExceptionFields,
    ) => Promise<boolean>;
    /** READY-04: drops one occurrence of a recurring series from view,
     *  upserting the same way as saveEventException -- overwrites any
     *  existing override for that occurrence with a cancellation. */
    cancelEventOccurrence: (
        masterEventId: string,
        originalStartTime: string,
    ) => Promise<boolean>;
    clear: () => void;
}

function rowToEvent(row: CalendarEventRow): CalendarEvent {
    return {
        id: row.id,
        calendarId: row.calendar_id,
        title: row.title,
        description: row.description ?? "",
        location: row.location ?? "",
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        allDay: row.all_day,
        source: row.source as CalendarEventSource,
        externalId: row.external_id,
        recurrenceRule: row.recurrence_rule,
        dirty: row.dirty,
        eventTimeZone: row.event_time_zone,
        updatedAt: row.updated_at,
        externalRaw: row.external_raw,
    };
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
    userId: null,
    events: [],
    calendars: [],
    exceptions: [],
    settings: DEFAULT_CALENDAR_SETTINGS,
    loading: false,
    settingsLoading: false,
    error: null,
    settingsError: null,

    load: async (userId) => {
        set({ userId, settingsLoading: true, settingsError: null });
        const [settingsResult, calendarsResult] = await Promise.all([
            supabase
                .from("user_preferences")
                .select(
                    "week_start, date_format, time_format, time_zone, default_event_duration",
                )
                .eq("user_id", userId)
                .single(),
            supabase
                .from("calendars")
                .select(CALENDAR_COLUMNS)
                .eq("user_id", userId),
        ]);

        if (calendarsResult.error) {
            console.error(
                "Failed to load calendars:",
                calendarsResult.error.message,
            );
        } else {
            set({
                calendars: (calendarsResult.data as CalendarRow[]).map(
                    rowToCalendar,
                ),
            });
        }

        const { data, error } = settingsResult;
        if (error) {
            console.error("Failed to load Calendar settings:", error.message);
            set({ settingsLoading: false, settingsError: error.message });
            return;
        }

        set({
            settings: {
                weekStart:
                    data.week_start ?? DEFAULT_CALENDAR_SETTINGS.weekStart,
                dateFormat:
                    data.date_format ?? DEFAULT_CALENDAR_SETTINGS.dateFormat,
                timeFormat:
                    data.time_format ?? DEFAULT_CALENDAR_SETTINGS.timeFormat,
                timeZone: data.time_zone ?? DEFAULT_CALENDAR_SETTINGS.timeZone,
                defaultEventDuration:
                    data.default_event_duration ??
                    DEFAULT_CALENDAR_SETTINGS.defaultEventDuration,
            },
            settingsLoading: false,
        });
    },

    loadEvents: async (start, end) => {
        const userId = get().userId;
        if (!userId) return;
        set({ loading: true, error: null });

        // Two separate queries, not one overlap filter: a recurring event's
        // own stored starts_at/ends_at describe only its first occurrence,
        // which can sit far outside [start, end) while its *expanded*
        // occurrences (computed client-side in expandRecurringEvents) still
        // fall inside it -- so recurring rows are fetched by starts_at
        // alone, with no upper-bound on how long ago they began and no
        // lower-bound from ends_at at all.
        // Both queries exclude tombstoned (soft-deleted) rows -- deleted_at
        // is set instead of hard-deleting so a future sync can still push
        // the deletion to the external provider, but they should never
        // appear in the app itself, same as if they were actually gone.
        const [plain, recurring] = await Promise.all([
            supabase
                .from("calendar_events")
                .select(EVENT_COLUMNS)
                .is("recurrence_rule", null)
                .is("deleted_at", null)
                .lt("starts_at", end)
                .gt("ends_at", start),
            supabase
                .from("calendar_events")
                .select(EVENT_COLUMNS)
                .not("recurrence_rule", "is", null)
                .is("deleted_at", null)
                .lt("starts_at", end),
        ]);

        if (plain.error || recurring.error) {
            const message =
                plain.error?.message ?? recurring.error?.message ?? "";
            console.error("Failed to load calendar events:", message);
            set({ loading: false, error: message });
            return;
        }

        const rows = [
            ...(plain.data as CalendarEventRow[]),
            ...(recurring.data as CalendarEventRow[]),
        ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

        // Exceptions are only ever consulted (by expandRecurringEvents) for
        // a recurring master that's actually loaded, so it's enough to fetch
        // them for just the recurring masters in this result set, not every
        // exception the user has.
        const masterIds = rows
            .filter((row) => row.recurrence_rule)
            .map((row) => row.id);
        let exceptions: EventException[] = [];
        if (masterIds.length) {
            const { data: exceptionRows, error: exceptionsError } =
                await supabase
                    .from("calendar_event_exceptions")
                    .select(EXCEPTION_COLUMNS)
                    .in("master_event_id", masterIds)
                    .is("deleted_at", null);
            if (exceptionsError) {
                console.error(
                    "Failed to load calendar event exceptions:",
                    exceptionsError.message,
                );
            } else {
                exceptions = (exceptionRows as EventExceptionRow[]).map(
                    rowToException,
                );
            }
        }

        set({
            events: rows.map(rowToEvent),
            exceptions,
            loading: false,
        });
    },

    saveSettings: async (settings) => {
        const userId = get().userId;
        if (!userId) return false;
        set({ settingsError: null });
        const { error } = await supabase
            .from("user_preferences")
            .update({
                week_start: settings.weekStart,
                date_format: settings.dateFormat,
                time_format: settings.timeFormat,
                time_zone: settings.timeZone,
                default_event_duration: settings.defaultEventDuration,
            })
            .eq("user_id", userId);

        if (error) {
            set({ settingsError: error.message });
            return false;
        }

        set({ settings });
        return true;
    },

    addEvent: async (event) => {
        const userId = get().userId;
        if (!userId) return null;
        // No calendar picker in the UI yet -- every locally-created event
        // lands on the user's primary calendar unless a caller (e.g. a
        // future Google-sync pull) explicitly names one.
        const calendarId =
            event.calendarId ??
            get().calendars.find((calendar) => calendar.isPrimary)?.id;
        if (!calendarId) {
            console.error("Failed to add calendar event: no calendar found");
            return null;
        }
        const { data, error } = await supabase
            .from("calendar_events")
            .insert({
                user_id: userId,
                calendar_id: calendarId,
                title: event.title,
                description: event.description,
                location: event.location,
                starts_at: event.startsAt,
                ends_at: event.endsAt,
                all_day: event.allDay ?? false,
                source: event.source ?? "local",
                external_id: event.externalId ?? null,
                recurrence_rule: event.recurrenceRule,
                // A freshly created event has never been pushed anywhere,
                // regardless of what (if anything) the caller passed.
                dirty: true,
                // null (the local UI's implicit "authored in the calendar's
                // own time zone") unless a caller explicitly provides
                // Google's own per-event time zone -- see expandRecurringEvents.
                event_time_zone: event.eventTimeZone ?? null,
                // A freshly created local event has no Google data to hold
                // onto yet -- see mergeGoogleEventPatch in lib/calendar.ts.
                external_raw: event.externalRaw ?? null,
            })
            .select(EVENT_COLUMNS)
            .single();

        if (error || !data) {
            console.error("Failed to add calendar event:", error?.message);
            return null;
        }
        const nextEvent = rowToEvent(data as CalendarEventRow);
        set((state) => ({
            events: [...state.events, nextEvent].sort((a, b) =>
                a.startsAt.localeCompare(b.startsAt),
            ),
        }));
        return nextEvent;
    },

    updateEvent: async (id, event) => {
        // allDay/source/externalId are only included when the caller actually
        // provides them, so editing an event through the local UI (which
        // doesn't know about them) can't clobber a mirrored event's Google
        // linkage back to its defaults. dirty and eventTimeZone are the
        // opposite: they're always forced here, regardless of what (if
        // anything) the caller passed. dirty is always true -- any local
        // edit means this event needs to be pushed. eventTimeZone defaults
        // to null (falls back to the calendar's own time zone) unless the
        // caller explicitly provides Google's own per-event time zone --
        // a *local* edit re-authors recurrenceRule using the calendar's
        // time zone, so any previously-stored Google time zone would be
        // stale and must be cleared, not just left alone.
        const { error } = await supabase
            .from("calendar_events")
            .update({
                title: event.title,
                description: event.description,
                location: event.location,
                starts_at: event.startsAt,
                ends_at: event.endsAt,
                recurrence_rule: event.recurrenceRule,
                dirty: true,
                event_time_zone: event.eventTimeZone ?? null,
                ...(event.allDay !== undefined && { all_day: event.allDay }),
                ...(event.source !== undefined && { source: event.source }),
                ...(event.externalId !== undefined && {
                    external_id: event.externalId,
                }),
                ...(event.calendarId !== undefined && {
                    calendar_id: event.calendarId,
                }),
                // READY-05: never included by the local edit UI, so this
                // column is simply omitted from the update -- left exactly
                // as it was, not clobbered back to null.
                ...(event.externalRaw !== undefined && {
                    external_raw: event.externalRaw,
                }),
            })
            .eq("id", id);
        if (error) {
            console.error("Failed to update calendar event:", error.message);
            return false;
        }
        set((state) => ({
            events: state.events
                .map((item) =>
                    item.id === id
                        ? {
                              ...item,
                              ...event,
                              dirty: true,
                              eventTimeZone: event.eventTimeZone ?? null,
                          }
                        : item,
                )
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        }));
        return true;
    },

    removeEvent: async (id) => {
        // Soft delete: sets a tombstone instead of removing the row, so a
        // future sync can still push the deletion to the external provider
        // before the row is actually purged. loadEvents already excludes
        // deleted_at rows, and this optimistically drops it from local
        // state too, so it disappears from the UI immediately either way.
        const { error } = await supabase
            .from("calendar_events")
            .update({ deleted_at: new Date().toISOString(), dirty: true })
            .eq("id", id);
        if (error) {
            console.error("Failed to delete calendar event:", error.message);
            return false;
        }
        set((state) => ({
            events: state.events.filter((event) => event.id !== id),
        }));
        return true;
    },

    saveEventException: async (masterEventId, originalStartTime, fields) => {
        const userId = get().userId;
        if (!userId) return false;
        const { data, error } = await supabase
            .from("calendar_event_exceptions")
            .upsert(
                {
                    user_id: userId,
                    master_event_id: masterEventId,
                    original_start_time: originalStartTime,
                    is_cancelled: false,
                    title: fields.title,
                    description: fields.description,
                    location: fields.location,
                    starts_at: fields.startsAt,
                    ends_at: fields.endsAt,
                    all_day: fields.allDay,
                    dirty: true,
                },
                { onConflict: "master_event_id,original_start_time" },
            )
            .select(EXCEPTION_COLUMNS)
            .single();
        if (error || !data) {
            console.error("Failed to save event exception:", error?.message);
            return false;
        }
        const next = rowToException(data as EventExceptionRow);
        set((state) => ({
            exceptions: [
                ...state.exceptions.filter((item) => item.id !== next.id),
                next,
            ],
        }));
        return true;
    },

    cancelEventOccurrence: async (masterEventId, originalStartTime) => {
        const userId = get().userId;
        if (!userId) return false;
        const { data, error } = await supabase
            .from("calendar_event_exceptions")
            .upsert(
                {
                    user_id: userId,
                    master_event_id: masterEventId,
                    original_start_time: originalStartTime,
                    is_cancelled: true,
                    title: null,
                    description: null,
                    location: null,
                    starts_at: null,
                    ends_at: null,
                    all_day: null,
                    dirty: true,
                },
                { onConflict: "master_event_id,original_start_time" },
            )
            .select(EXCEPTION_COLUMNS)
            .single();
        if (error || !data) {
            console.error(
                "Failed to cancel event occurrence:",
                error?.message,
            );
            return false;
        }
        const next = rowToException(data as EventExceptionRow);
        set((state) => ({
            exceptions: [
                ...state.exceptions.filter((item) => item.id !== next.id),
                next,
            ],
        }));
        return true;
    },

    clear: () =>
        set({
            userId: null,
            events: [],
            calendars: [],
            exceptions: [],
            settings: DEFAULT_CALENDAR_SETTINGS,
            loading: false,
            settingsLoading: false,
            error: null,
            settingsError: null,
        }),
}));
