import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Task } from "../types";

interface TaskRow {
    id: string;
    user_id: string;
    title: string;
    done: boolean;
    focus_today: boolean;
    created_at: string;
}

function rowToTask(row: TaskRow): Task {
    return {
        id: row.id,
        title: row.title,
        done: row.done,
        focusToday: row.focus_today,
        createdAt: new Date(row.created_at).getTime(),
    };
}

interface TaskState {
    tasks: Task[];
    userId: string | null;
    loading: boolean;
    loadTasks: (userId: string) => Promise<void>;
    clear: () => void;
    addTask: (title: string, focusToday?: boolean) => void;
    updateTask: (id: string, title: string) => void;
    removeTask: (id: string) => void;
    toggleDone: (id: string) => void;
    toggleFocusToday: (id: string) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
    tasks: [],
    userId: null,
    loading: false,

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

    clear: () => set({ tasks: [], userId: null }),

    addTask: (title, focusToday = false) => {
        const { userId } = get();
        if (!userId) return;

        // Optimistic: show the task immediately with a temp id, then reconcile
        // with the real row once Supabase confirms the insert.
        const tempId = `temp-${Date.now()}`;
        const optimisticTask: Task = {
            id: tempId,
            title,
            done: false,
            focusToday,
            createdAt: Date.now(),
        };
        set((state) => ({ tasks: [...state.tasks, optimisticTask] }));

        supabase
            .from("tasks")
            .insert({ title, focus_today: focusToday, user_id: userId })
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
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        const next = !task.focusToday;
        set((state) => ({
            tasks: state.tasks.map((t) =>
                t.id === id ? { ...t, focusToday: next } : t,
            ),
        }));
        supabase
            .from("tasks")
            .update({ focus_today: next })
            .eq("id", id)
            .then(({ error }) => {
                if (error)
                    console.error("Failed to update task:", error.message);
            });
    },
}));
