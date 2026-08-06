import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";
import type { Task } from "../types";

interface TaskState {
  tasks: Task[];
  addTask: (title: string) => void;
  removeTask: (id: string) => void;
  toggleDone: (id: string) => void;
  toggleFocusToday: (id: string) => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [
        { id: uuid(), title: "Pick two tasks to focus on today", done: false, focusToday: true, createdAt: Date.now() },
        { id: uuid(), title: "Everything else lives in the full list", done: false, focusToday: false, createdAt: Date.now() },
      ],
      addTask: (title) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            { id: uuid(), title, done: false, focusToday: false, createdAt: Date.now() },
          ],
        })),
      removeTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
      toggleDone: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        })),
      toggleFocusToday: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, focusToday: !t.focusToday } : t)),
        })),
    }),
    { name: "daily-board:tasks" }
  )
);
