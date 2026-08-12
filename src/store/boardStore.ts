import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type {
    BoardWidget,
    PomodoroSettings,
    WidgetLayout,
    WidgetType,
} from "../types";

const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
    focusSeconds: 25 * 60,
    shortBreakSeconds: 5 * 60,
    longBreakSeconds: 15 * 60,
    longBreakInterval: 4,
    autoStartBreaks: false,
    autoStartFocus: false,
};

interface WidgetRow {
    id: string;
    user_id: string;
    type: WidgetType;
    layout: WidgetLayout;
    z_index: number;
    mobile_order: number;
    data: BoardWidget["data"];
    created_at: string;
}

function rowToWidget(row: WidgetRow): BoardWidget {
    return {
        id: row.id,
        type: row.type,
        layout: row.layout,
        zIndex: row.z_index,
        mobileOrder: row.mobile_order,
        data: row.data,
    };
}

const DEFAULT_LAYOUTS: Record<WidgetType, WidgetLayout> = {
    todo: { x: 40, y: 40, width: 300, height: 360 },
    note: { x: 380, y: 40, width: 260, height: 220 },
    timer: { x: 40, y: 420, width: 260, height: 220 },
    image: { x: 40, y: 420, width: 260, height: 220 },
    calendar: { x: 40, y: 420, width: 420, height: 280 },
};

function defaultDataFor(
    type: WidgetType,
    pomodoroSettings: PomodoroSettings,
): BoardWidget["data"] {
    switch (type) {
        case "todo":
            return { maxItemsShown: 6 };
        case "note":
            return { text: "" };
        case "timer":
            return { mode: "pomodoro", ...pomodoroSettings };
        case "image":
            return { src: "", fileName: "" };
        case "calendar":
            return { view: "agenda" };
    }
}

// Debounce optimization: dragging, resizing, and repeatedly clicking a widget to bring
// it to front all fire on every event (every drag-stop, every mousedown). Local state
// still updates instantly for a responsive feel, but the remote Supabase write is
// coalesced per widget+field so a burst of rapid changes results in one network call
// after things settle, instead of one per event.
const DEBOUNCE_MS = 500;
const pendingWrites: Record<string, ReturnType<typeof setTimeout>> = {};

function scheduleWrite(key: string, run: () => void) {
    if (pendingWrites[key]) clearTimeout(pendingWrites[key]);
    pendingWrites[key] = setTimeout(() => {
        delete pendingWrites[key];
        run();
    }, DEBOUNCE_MS);
}

interface BoardState {
    widgets: BoardWidget[];
    userId: string | null;
    loading: boolean;
    pomodoroSettings: PomodoroSettings;
    pomodoroLoading: boolean;
    pomodoroError: string | null;
    loadWidgets: (userId: string) => Promise<void>;
    loadPomodoroSettings: (userId: string) => Promise<void>;
    setPomodoroSettings: (settings: PomodoroSettings) => void;
    clear: () => void;
    addWidget: (type: WidgetType) => void;
    removeWidget: (id: string) => void;
    updateLayout: (id: string, layout: Partial<WidgetLayout>) => void;
    updateData: (id: string, data: Partial<BoardWidget["data"]>) => void;
    bringToFront: (id: string) => void;
    reorderMobileWidgets: (orderedIds: string[]) => void;
}

export const useBoardStore = create<BoardState>((set, get) => ({
    widgets: [],
    userId: null,
    loading: false,
    pomodoroSettings: DEFAULT_POMODORO_SETTINGS,
    pomodoroLoading: false,
    pomodoroError: null,

    loadWidgets: async (userId) => {
        set({ loading: true, userId });
        const { data, error } = await supabase
            .from("board_widgets")
            .select("*")
            .order("created_at", { ascending: true });

        if (error) {
            console.error("Failed to load widgets:", error.message);
            set({ loading: false });
            return;
        }

        if (data && data.length > 0) {
            set({
                widgets: (data as WidgetRow[]).map(rowToWidget),
                loading: false,
            });
            return;
        }

        // First-ever login: seed a starter board so new users don't land on an empty canvas
        const seedRows = [
            {
                user_id: userId,
                type: "todo" as WidgetType,
                layout: DEFAULT_LAYOUTS.todo,
                z_index: 1,
                mobile_order: 1,
                data: defaultDataFor("todo", get().pomodoroSettings),
            },
            {
                user_id: userId,
                type: "note" as WidgetType,
                layout: DEFAULT_LAYOUTS.note,
                z_index: 2,
                mobile_order: 2,
                data: {
                    text: "Welcome to your board — drag me anywhere, or add more widgets from the tray below.",
                },
            },
        ];
        const { data: seeded, error: seedError } = await supabase
            .from("board_widgets")
            .insert(seedRows)
            .select();

        if (seedError) {
            console.error("Failed to seed starter board:", seedError.message);
            set({ widgets: [], loading: false });
            return;
        }
        set({
            widgets: (seeded as WidgetRow[]).map(rowToWidget),
            loading: false,
        });
    },

    loadPomodoroSettings: async (userId) => {
        set({ pomodoroLoading: true, pomodoroError: null });
        const { data, error } = await supabase
            .from("profiles")
            .select(
                "focus_seconds, short_break_seconds, long_break_seconds, long_break_interval, auto_start_breaks, auto_start_focus",
            )
            .eq("id", userId)
            .single();

        if (error) {
            console.error("Failed to load Pomodoro settings:", error.message);
            set({ pomodoroLoading: false, pomodoroError: error.message });
            return;
        }

        set({
            pomodoroSettings: {
                focusSeconds:
                    data.focus_seconds ??
                    DEFAULT_POMODORO_SETTINGS.focusSeconds,
                shortBreakSeconds:
                    data.short_break_seconds ??
                    DEFAULT_POMODORO_SETTINGS.shortBreakSeconds,
                longBreakSeconds:
                    data.long_break_seconds ??
                    DEFAULT_POMODORO_SETTINGS.longBreakSeconds,
                longBreakInterval:
                    data.long_break_interval ??
                    DEFAULT_POMODORO_SETTINGS.longBreakInterval,
                autoStartBreaks:
                    data.auto_start_breaks ??
                    DEFAULT_POMODORO_SETTINGS.autoStartBreaks,
                autoStartFocus:
                    data.auto_start_focus ??
                    DEFAULT_POMODORO_SETTINGS.autoStartFocus,
            },
            pomodoroLoading: false,
        });
    },

    setPomodoroSettings: (settings) => set({ pomodoroSettings: settings }),

    clear: () =>
        set({
            widgets: [],
            userId: null,
            pomodoroSettings: DEFAULT_POMODORO_SETTINGS,
            pomodoroLoading: false,
            pomodoroError: null,
        }),

    addWidget: (type) => {
        const { userId, widgets, pomodoroSettings } = get();
        if (!userId) return;
        const maxZ = Math.max(0, ...widgets.map((w) => w.zIndex));
        const maxMobileOrder = Math.max(
            0,
            ...widgets.map((w) => w.mobileOrder),
        );

        const tempId = `temp-${Date.now()}`;
        const optimisticWidget: BoardWidget = {
            id: tempId,
            type,
            layout: { ...DEFAULT_LAYOUTS[type] },
            zIndex: maxZ + 1,
            mobileOrder: maxMobileOrder + 1,
            data: defaultDataFor(type, pomodoroSettings),
        };
        set((state) => ({ widgets: [...state.widgets, optimisticWidget] }));

        supabase
            .from("board_widgets")
            .insert({
                user_id: userId,
                type,
                layout: optimisticWidget.layout,
                z_index: optimisticWidget.zIndex,
                mobile_order: optimisticWidget.mobileOrder,
                data: optimisticWidget.data,
            })
            .select()
            .single()
            .then(({ data, error }) => {
                if (error || !data) {
                    console.error("Failed to add widget:", error?.message);
                    set((state) => ({
                        widgets: state.widgets.filter((w) => w.id !== tempId),
                    }));
                    return;
                }
                set((state) => ({
                    widgets: state.widgets.map((w) =>
                        w.id === tempId ? rowToWidget(data as WidgetRow) : w,
                    ),
                }));
            });
    },

    removeWidget: (id) => {
        set((state) => ({ widgets: state.widgets.filter((w) => w.id !== id) }));
        supabase
            .from("board_widgets")
            .delete()
            .eq("id", id)
            .then(({ error }) => {
                if (error)
                    console.error("Failed to remove widget:", error.message);
            });
    },

    updateLayout: (id, layout) => {
        let nextLayout: WidgetLayout | undefined;
        set((state) => ({
            widgets: state.widgets.map((w) => {
                if (w.id !== id) return w;
                nextLayout = { ...w.layout, ...layout };
                return { ...w, layout: nextLayout };
            }),
        }));
        if (!nextLayout) return;
        const layoutToSave = nextLayout;
        scheduleWrite(`layout:${id}`, () => {
            supabase
                .from("board_widgets")
                .update({ layout: layoutToSave })
                .eq("id", id)
                .then(({ error }) => {
                    if (error)
                        console.error(
                            "Failed to update widget layout:",
                            error.message,
                        );
                });
        });
    },

    updateData: (id, data) => {
        let nextData: BoardWidget["data"] | undefined;
        set((state) => ({
            widgets: state.widgets.map((w) => {
                if (w.id !== id) return w;
                nextData = { ...w.data, ...data } as BoardWidget["data"];
                return { ...w, data: nextData };
            }),
        }));
        if (!nextData) return;
        const dataToSave = nextData;
        scheduleWrite(`data:${id}`, () => {
            supabase
                .from("board_widgets")
                .update({ data: dataToSave })
                .eq("id", id)
                .then(({ error }) => {
                    if (error)
                        console.error(
                            "Failed to update widget data:",
                            error.message,
                        );
                });
        });
    },

    bringToFront: (id) => {
        const maxZ = Math.max(0, ...get().widgets.map((w) => w.zIndex));
        const nextZ = maxZ + 1;
        set((state) => ({
            widgets: state.widgets.map((w) =>
                w.id === id ? { ...w, zIndex: nextZ } : w,
            ),
        }));
        scheduleWrite(`zindex:${id}`, () => {
            supabase
                .from("board_widgets")
                .update({ z_index: nextZ })
                .eq("id", id)
                .then(({ error }) => {
                    if (error)
                        console.error(
                            "Failed to bring widget to front:",
                            error.message,
                        );
                });
        });
    },

    reorderMobileWidgets: (orderedIds) => {
        set((state) => ({
            widgets: state.widgets.map((w) => {
                const index = orderedIds.indexOf(w.id);
                return index === -1 ? w : { ...w, mobileOrder: index };
            }),
        }));

        orderedIds.forEach((id, index) => {
            supabase
                .from("board_widgets")
                .update({ mobile_order: index })
                .eq("id", id)
                .then(({ error }) => {
                    if (error)
                        console.error(
                            "Failed to reorder widget:",
                            error.message,
                        );
                });
        });
    },
}));
