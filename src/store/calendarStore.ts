import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type {
    CalendarEvent,
    CalendarEventSource,
    CalendarSettings,
} from "../types/calendar";

/** Fields a caller can create/update an event without specifying -- creation
 *  defaults them (see addEvent), and updates leave them untouched so editing
 *  an event through the local UI can't clobber a mirrored event's Google
 *  linkage. */
type OptionalEventFields = "allDay" | "source" | "externalId";

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
    weekStart: 0,
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    defaultEventDuration: 60,
};

interface CalendarEventRow {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    source: string;
    external_id: string | null;
    recurrence_rule: string | null;
}

const EVENT_COLUMNS =
    "id, title, description, location, starts_at, ends_at, all_day, source, external_id, recurrence_rule";

interface CalendarState {
    userId: string | null;
    events: CalendarEvent[];
    settings: CalendarSettings;
    loading: boolean;
    settingsLoading: boolean;
    error: string | null;
    settingsError: string | null;
    load: (userId: string) => Promise<void>;
    loadEvents: (start: string, end: string) => Promise<void>;
    saveSettings: (settings: CalendarSettings) => Promise<boolean>;
    addEvent: (
        event: Omit<CalendarEvent, "id" | OptionalEventFields> &
            Partial<Pick<CalendarEvent, OptionalEventFields>>,
    ) => Promise<CalendarEvent | null>;
    updateEvent: (
        id: string,
        event: Omit<CalendarEvent, "id" | OptionalEventFields> &
            Partial<Pick<CalendarEvent, OptionalEventFields>>,
    ) => Promise<boolean>;
    removeEvent: (id: string) => Promise<boolean>;
    clear: () => void;
}

function rowToEvent(row: CalendarEventRow): CalendarEvent {
    return {
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        location: row.location ?? "",
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        allDay: row.all_day,
        source: row.source as CalendarEventSource,
        externalId: row.external_id,
        recurrenceRule: row.recurrence_rule,
    };
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
    userId: null,
    events: [],
    settings: DEFAULT_CALENDAR_SETTINGS,
    loading: false,
    settingsLoading: false,
    error: null,
    settingsError: null,

    load: async (userId) => {
        set({ userId, settingsLoading: true, settingsError: null });
        const { data, error } = await supabase
            .from("user_preferences")
            .select(
                "week_start, date_format, time_format, time_zone, default_event_duration",
            )
            .eq("user_id", userId)
            .single();

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
        const [plain, recurring] = await Promise.all([
            supabase
                .from("calendar_events")
                .select(EVENT_COLUMNS)
                .is("recurrence_rule", null)
                .lt("starts_at", end)
                .gt("ends_at", start),
            supabase
                .from("calendar_events")
                .select(EVENT_COLUMNS)
                .not("recurrence_rule", "is", null)
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

        set({
            events: rows.map(rowToEvent),
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
        const { data, error } = await supabase
            .from("calendar_events")
            .insert({
                user_id: userId,
                title: event.title,
                description: event.description,
                location: event.location,
                starts_at: event.startsAt,
                ends_at: event.endsAt,
                all_day: event.allDay ?? false,
                source: event.source ?? "local",
                external_id: event.externalId ?? null,
                recurrence_rule: event.recurrenceRule,
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
        // linkage back to its defaults.
        const { error } = await supabase
            .from("calendar_events")
            .update({
                title: event.title,
                description: event.description,
                location: event.location,
                starts_at: event.startsAt,
                ends_at: event.endsAt,
                recurrence_rule: event.recurrenceRule,
                ...(event.allDay !== undefined && { all_day: event.allDay }),
                ...(event.source !== undefined && { source: event.source }),
                ...(event.externalId !== undefined && {
                    external_id: event.externalId,
                }),
            })
            .eq("id", id);
        if (error) {
            console.error("Failed to update calendar event:", error.message);
            return false;
        }
        set((state) => ({
            events: state.events
                .map((item) => (item.id === id ? { ...item, ...event } : item))
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        }));
        return true;
    },

    removeEvent: async (id) => {
        const { error } = await supabase
            .from("calendar_events")
            .delete()
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

    clear: () =>
        set({
            userId: null,
            events: [],
            settings: DEFAULT_CALENDAR_SETTINGS,
            loading: false,
            settingsLoading: false,
            error: null,
            settingsError: null,
        }),
}));
