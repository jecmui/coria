import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { dateInputValue, zonedDateTimeToUtcIso } from "../lib/calendar";
import type {
    Task,
    TodayClearMode,
    TodayClearScope,
    TodayClearSettings,
} from "../types";

export const DEFAULT_TODAY_CLEAR_SETTINGS: TodayClearSettings = {
    mode: "manual",
    time: "18:00",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    scope: "completed",
};

interface TaskRow {
    id: string;
    user_id: string;
    title: string;
    done: boolean;
    focus_today: boolean;
    created_at: string;
    sort_order: number;
}

function rowToTask(row: TaskRow): Task {
    return {
        id: row.id,
        title: row.title,
        done: row.done,
        focusToday: row.focus_today,
        createdAt: new Date(row.created_at).getTime(),
        sortOrder: row.sort_order,
    };
}

interface TaskState {
    tasks: Task[];
    userId: string | null;
    loading: boolean;
    /** When false, "Delete task" skips its confirmation dialog. */
    confirmTaskDelete: boolean;
    todayClearSettings: TodayClearSettings;
    todayClearSettingsLoading: boolean;
    todayClearSettingsError: string | null;
    /** "YYYY-MM-DD" (in todayClearSettings.timeZone) the automatic clear last ran, so
     *  it only fires once per day even if the app stays open or reopens after. */
    lastAutoClearDate: string | null;
    loadTasks: (userId: string) => Promise<void>;
    loadConfirmTaskDelete: (userId: string) => Promise<void>;
    setConfirmTaskDelete: (value: boolean) => void;
    loadTodayClearSettings: (userId: string) => Promise<void>;
    saveTodayClearSettings: (settings: TodayClearSettings) => Promise<boolean>;
    /** Removes today-focused tasks from Today (does not delete them). Returns the
     *  cleared task ids. */
    clearFocusToday: (scope: TodayClearScope) => string[];
    /** Runs the scheduled automatic clear if it's due and hasn't already run today.
     *  Safe to call anytime -- a no-op outside "automatic" mode or before its time. */
    checkTodayAutoClear: () => void;
    clear: () => void;
    addTask: (title: string, focusToday?: boolean) => void;
    updateTask: (id: string, title: string) => void;
    removeTask: (id: string) => void;
    toggleDone: (id: string) => void;
    toggleFocusToday: (id: string) => void;
    reorderFocusTasks: (orderedIds: string[]) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
    tasks: [],
    userId: null,
    loading: false,
    confirmTaskDelete: true,
    todayClearSettings: DEFAULT_TODAY_CLEAR_SETTINGS,
    todayClearSettingsLoading: false,
    todayClearSettingsError: null,
    lastAutoClearDate: null,

    loadTasks: async (userId) => {
        set({ loading: true, userId });
        const { data, error } = await supabase
            .from("tasks")
            .select("*")
            .order("created_at", { ascending: true });

        if (error) {
            console.error("Failed to load tasks:", error.message);
            set({ loading: false });
            return;
        }
        set({ tasks: (data as TaskRow[]).map(rowToTask), loading: false });
    },

    loadConfirmTaskDelete: async (userId) => {
        const { data, error } = await supabase
            .from("user_preferences")
            .select("confirm_task_delete")
            .eq("user_id", userId)
            .single();

        if (error) {
            console.error("Failed to load task preferences:", error.message);
            return;
        }
        set({ confirmTaskDelete: data.confirm_task_delete ?? true });
    },

    setConfirmTaskDelete: (value) => {
        const { userId } = get();
        set({ confirmTaskDelete: value });
        if (!userId) return;

        supabase
            .from("user_preferences")
            .update({ confirm_task_delete: value })
            .eq("user_id", userId)
            .then(({ error }) => {
                if (error)
                    console.error(
                        "Failed to save task preferences:",
                        error.message,
                    );
            });
    },

    loadTodayClearSettings: async (userId) => {
        set({ todayClearSettingsLoading: true, todayClearSettingsError: null });
        const { data, error } = await supabase
            .from("user_preferences")
            .select(
                "today_clear_mode, today_clear_time, today_clear_time_zone, today_clear_scope, today_last_auto_clear_date",
            )
            .eq("user_id", userId)
            .single();

        if (error) {
            console.error(
                "Failed to load Today clear settings:",
                error.message,
            );
            set({
                todayClearSettingsLoading: false,
                todayClearSettingsError: error.message,
            });
            return;
        }

        set({
            todayClearSettings: {
                mode:
                    (data.today_clear_mode as TodayClearMode) ??
                    DEFAULT_TODAY_CLEAR_SETTINGS.mode,
                time:
                    data.today_clear_time ??
                    DEFAULT_TODAY_CLEAR_SETTINGS.time,
                timeZone:
                    data.today_clear_time_zone ??
                    DEFAULT_TODAY_CLEAR_SETTINGS.timeZone,
                scope:
                    (data.today_clear_scope as TodayClearScope) ??
                    DEFAULT_TODAY_CLEAR_SETTINGS.scope,
            },
            lastAutoClearDate: data.today_last_auto_clear_date,
            todayClearSettingsLoading: false,
        });
    },

    saveTodayClearSettings: async (settings) => {
        const userId = get().userId;
        if (!userId) return false;
        set({ todayClearSettingsError: null });
        const { error } = await supabase
            .from("user_preferences")
            .update({
                today_clear_mode: settings.mode,
                today_clear_time: settings.time,
                today_clear_time_zone: settings.timeZone,
                today_clear_scope: settings.scope,
            })
            .eq("user_id", userId);

        if (error) {
            set({ todayClearSettingsError: error.message });
            return false;
        }

        set({ todayClearSettings: settings });
        return true;
    },

    clearFocusToday: (scope) => {
        const taskIds = get()
            .tasks.filter((t) => t.focusToday && (scope === "all" || t.done))
            .map((t) => t.id);
        taskIds.forEach((id) => get().toggleFocusToday(id));
        return taskIds;
    },

    checkTodayAutoClear: () => {
        const { userId, todayClearSettings, lastAutoClearDate } = get();
        if (!userId || todayClearSettings.mode !== "automatic") return;

        const [hour, minute] = todayClearSettings.time.split(":").map(Number);
        if (Number.isNaN(hour) || Number.isNaN(minute)) return;

        const now = new Date();
        const scheduledIso = zonedDateTimeToUtcIso(
            now,
            hour,
            minute,
            todayClearSettings.timeZone,
        );
        if (now.getTime() < new Date(scheduledIso).getTime()) return;

        const todayKey = dateInputValue(now, todayClearSettings.timeZone);
        if (lastAutoClearDate === todayKey) return;

        get().clearFocusToday(todayClearSettings.scope);
        set({ lastAutoClearDate: todayKey });
        supabase
            .from("user_preferences")
            .update({ today_last_auto_clear_date: todayKey })
            .eq("user_id", userId)
            .then(({ error }) => {
                if (error)
                    console.error(
                        "Failed to record auto-clear date:",
                        error.message,
                    );
            });
    },

    clear: () =>
        set({
            tasks: [],
            userId: null,
            confirmTaskDelete: true,
            todayClearSettings: DEFAULT_TODAY_CLEAR_SETTINGS,
            todayClearSettingsLoading: false,
            todayClearSettingsError: null,
            lastAutoClearDate: null,
        }),

    addTask: (title, focusToday = false) => {
        const { userId, tasks } = get();
        if (!userId) return;

        // New focus-today tasks land at the top of the Today widget's list --
        // one below the current lowest sortOrder (negative values are fine,
        // only relative order matters).
        const focusSortOrders = tasks
            .filter((t) => t.focusToday)
            .map((t) => t.sortOrder);
        const nextSortOrder = focusToday
            ? focusSortOrders.length
                ? Math.min(...focusSortOrders) - 1
                : 0
            : 0;

        // Optimistic: show the task immediately with a temp id, then reconcile
        // with the real row once Supabase confirms the insert.
        const tempId = `temp-${Date.now()}`;
        const optimisticTask: Task = {
            id: tempId,
            title,
            done: false,
            focusToday,
            createdAt: Date.now(),
            sortOrder: nextSortOrder,
        };
        set((state) => ({ tasks: [...state.tasks, optimisticTask] }));

        supabase
            .from("tasks")
            .insert({
                title,
                focus_today: focusToday,
                user_id: userId,
                sort_order: nextSortOrder,
            })
            .select()
            .single()
            .then(({ data, error }) => {
                if (error || !data) {
                    console.error("Failed to add task:", error?.message);
                    set((state) => ({
                        tasks: state.tasks.filter((t) => t.id !== tempId),
                    }));
                    return;
                }
                set((state) => ({
                    tasks: state.tasks.map((t) =>
                        t.id === tempId ? rowToTask(data as TaskRow) : t,
                    ),
                }));
            });
    },

    updateTask: (id, title) => {
        const trimmedTitle = title.trim();
        if (!trimmedTitle) return;

        set((state) => ({
            tasks: state.tasks.map((task) =>
                task.id === id ? { ...task, title: trimmedTitle } : task,
            ),
        }));

        supabase
            .from("tasks")
            .update({ title: trimmedTitle })
            .eq("id", id)
            .then(({ error }) => {
                if (error)
                    console.error("Failed to update task:", error.message);
            });
    },

    removeTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
        supabase
            .from("tasks")
            .delete()
            .eq("id", id)
            .then(({ error }) => {
                if (error)
                    console.error("Failed to delete task:", error.message);
            });
    },

    toggleDone: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        const nextDone = !task.done;
        set((state) => ({
            tasks: state.tasks.map((t) =>
                t.id === id ? { ...t, done: nextDone } : t,
            ),
        }));
        supabase
            .from("tasks")
            .update({ done: nextDone })
            .eq("id", id)
            .then(({ error }) => {
                if (error)
                    console.error("Failed to update task:", error.message);
            });
    },

    toggleFocusToday: (id) => {
        const { tasks } = get();
        const task = tasks.find((t) => t.id === id);
        if (!task) return;
        const next = !task.focusToday;
        // Turning focus on drops the task at the top of the Today widget's
        // list, same as addTask; turning it off leaves sortOrder as-is, it's
        // unused until re-starred.
        const focusSortOrders = tasks
            .filter((t) => t.focusToday)
            .map((t) => t.sortOrder);
        const nextSortOrder = next
            ? focusSortOrders.length
                ? Math.min(...focusSortOrders) - 1
                : 0
            : task.sortOrder;
        set((state) => ({
            tasks: state.tasks.map((t) =>
                t.id === id
                    ? { ...t, focusToday: next, sortOrder: nextSortOrder }
                    : t,
            ),
        }));
        supabase
            .from("tasks")
            .update({ focus_today: next, sort_order: nextSortOrder })
            .eq("id", id)
            .then(({ error }) => {
                if (error)
                    console.error("Failed to update task:", error.message);
            });
    },

    reorderFocusTasks: (orderedIds) => {
        set((state) => ({
            tasks: state.tasks.map((task) => {
                const index = orderedIds.indexOf(task.id);
                return index === -1 ? task : { ...task, sortOrder: index };
            }),
        }));

        orderedIds.forEach((id, index) => {
            supabase
                .from("tasks")
                .update({ sort_order: index })
                .eq("id", id)
                .then(({ error }) => {
                    if (error)
                        console.error("Failed to reorder task:", error.message);
                });
        });
    },
}));
