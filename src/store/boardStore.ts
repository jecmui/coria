import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";
import type { BoardWidget, WidgetLayout, WidgetType } from "../types";

interface BoardState {
  widgets: BoardWidget[];
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  updateLayout: (id: string, layout: Partial<WidgetLayout>) => void;
  updateData: (id: string, data: Partial<BoardWidget["data"]>) => void;
  bringToFront: (id: string) => void;
}

const DEFAULT_LAYOUTS: Record<WidgetType, WidgetLayout> = {
  todo: { x: 40, y: 40, width: 300, height: 360 },
  note: { x: 380, y: 40, width: 260, height: 220 },
  timer: { x: 40, y: 420, width: 260, height: 220 },
};

function defaultDataFor(type: WidgetType): BoardWidget["data"] {
  switch (type) {
    case "todo":
      return { maxItemsShown: 6 };
    case "note":
      return { text: "" };
    case "timer":
      return { mode: "pomodoro", durationSeconds: 25 * 60 };
  }
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      widgets: [
        {
          id: uuid(),
          type: "todo",
          layout: DEFAULT_LAYOUTS.todo,
          zIndex: 1,
          data: defaultDataFor("todo"),
        },
        {
          id: uuid(),
          type: "note",
          layout: DEFAULT_LAYOUTS.note,
          zIndex: 2,
          data: { text: "Welcome to your board — drag me anywhere, or add more widgets from the tray below." },
        },
      ],
      addWidget: (type) => {
        const maxZ = Math.max(0, ...get().widgets.map((w) => w.zIndex));
        set((state) => ({
          widgets: [
            ...state.widgets,
            {
              id: uuid(),
              type,
              layout: { ...DEFAULT_LAYOUTS[type] },
              zIndex: maxZ + 1,
              data: defaultDataFor(type),
            },
          ],
        }));
      },
      removeWidget: (id) =>
        set((state) => ({ widgets: state.widgets.filter((w) => w.id !== id) })),
      updateLayout: (id, layout) =>
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, layout: { ...w.layout, ...layout } } : w
          ),
        })),
      updateData: (id, data) =>
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, data: { ...w.data, ...data } as BoardWidget["data"] } : w
          ),
        })),
      bringToFront: (id) => {
        const maxZ = Math.max(0, ...get().widgets.map((w) => w.zIndex));
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, zIndex: maxZ + 1 } : w
          ),
        }));
      },
    }),
    { name: "daily-board:widgets" }
  )
);
