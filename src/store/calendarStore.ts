import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { CalendarEvent, CalendarSettings } from "../types/calendar";

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
}

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
        event: Omit<CalendarEvent, "id">,
    ) => Promise<CalendarEvent | null>;
    updateEvent: (
        id: string,
        event: Omit<CalendarEvent, "id">,
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
            .from("profiles")
            .select(
                "calendar_week_start, calendar_date_format, calendar_time_format, calendar_time_zone, calendar_default_event_duration",
            )
            .eq("id", userId)
            .single();

        if (error) {
            console.error("Failed to load Calendar settings:", error.message);
            set({ settingsLoading: false, settingsError: error.message });
            return;
        }

        set({
            settings: {
                weekStart:
                    data.calendar_week_start ??
                    DEFAULT_CALENDAR_SETTINGS.weekStart,
                dateFormat:
                    data.calendar_date_format ??
                    DEFAULT_CALENDAR_SETTINGS.dateFormat,
                timeFormat:
                    data.calendar_time_format ??
                    DEFAULT_CALENDAR_SETTINGS.timeFormat,
                timeZone:
                    data.calendar_time_zone ??
                    DEFAULT_CALENDAR_SETTINGS.timeZone,
                defaultEventDuration:
                    data.calendar_default_event_duration ??
                    DEFAULT_CALENDAR_SETTINGS.defaultEventDuration,
            },
            settingsLoading: false,
        });
    },

    loadEvents: async (start, end) => {
        const userId = get().userId;
        if (!userId) return;
        set({ loading: true, error: null });

        const { data, error } = await supabase
            .from("calendar_events")
            .select("id, title, description, location, starts_at, ends_at")
            .gte("starts_at", start)
            .lt("starts_at", end)
            .order("starts_at", { ascending: true });

        if (error) {
            console.error("Failed to load calendar events:", error.message);
            set({ loading: false, error: error.message });
            return;
        }

        set({
            events: (data as CalendarEventRow[]).map(rowToEvent),
            loading: false,
        });
    },

    saveSettings: async (settings) => {
        const userId = get().userId;
        if (!userId) return false;
        set({ settingsError: null });
        const { error } = await supabase
            .from("profiles")
            .update({
                calendar_week_start: settings.weekStart,
                calendar_date_format: settings.dateFormat,
                calendar_time_format: settings.timeFormat,
                calendar_time_zone: settings.timeZone,
                calendar_default_event_duration: settings.defaultEventDuration,
            })
            .eq("id", userId);

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
            })
            .select("id, title, description, location, starts_at, ends_at")
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
        const { error } = await supabase
            .from("calendar_events")
            .update({
                title: event.title,
                description: event.description,
                location: event.location,
                starts_at: event.startsAt,
                ends_at: event.endsAt,
            })
            .eq("id", id);
        if (error) {
            console.error("Failed to update calendar event:", error.message);
            return false;
        }
        set((state) => ({
            events: state.events
                .map((item) => (item.id === id ? { id, ...event } : item))
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
