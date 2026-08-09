import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { BoardWidget, WidgetLayout, WidgetType } from "../types";

interface WidgetRow {
  id: string;
  user_id: string;
  type: WidgetType;
  layout: WidgetLayout;
  z_index: number;
  data: BoardWidget["data"];
  created_at: string;
}

function rowToWidget(row: WidgetRow): BoardWidget {
  return { id: row.id, type: row.type, layout: row.layout, zIndex: row.z_index, data: row.data };
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
  loadWidgets: (userId: string) => Promise<void>;
  clear: () => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  updateLayout: (id: string, layout: Partial<WidgetLayout>) => void;
  updateData: (id: string, data: Partial<BoardWidget["data"]>) => void;
  bringToFront: (id: string) => void;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  widgets: [],
  userId: null,
  loading: false,

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
      set({ widgets: (data as WidgetRow[]).map(rowToWidget), loading: false });
      return;
    }

    // First-ever login: seed a starter board so new users don't land on an empty canvas
    const seedRows = [
      {
        user_id: userId,
        type: "todo" as WidgetType,
        layout: DEFAULT_LAYOUTS.todo,
        z_index: 1,
        data: defaultDataFor("todo"),
      },
      {
        user_id: userId,
        type: "note" as WidgetType,
        layout: DEFAULT_LAYOUTS.note,
        z_index: 2,
        data: { text: "Welcome to your board — drag me anywhere, or add more widgets from the tray below." },
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
    set({ widgets: (seeded as WidgetRow[]).map(rowToWidget), loading: false });
  },

  clear: () => set({ widgets: [], userId: null }),

  addWidget: (type) => {
    const { userId, widgets } = get();
    if (!userId) return;
    const maxZ = Math.max(0, ...widgets.map((w) => w.zIndex));

    const tempId = `temp-${Date.now()}`;
    const optimisticWidget: BoardWidget = {
      id: tempId,
      type,
      layout: { ...DEFAULT_LAYOUTS[type] },
      zIndex: maxZ + 1,
      data: defaultDataFor(type),
    };
    set((state) => ({ widgets: [...state.widgets, optimisticWidget] }));

    supabase
      .from("board_widgets")
      .insert({
        user_id: userId,
        type,
        layout: optimisticWidget.layout,
        z_index: optimisticWidget.zIndex,
        data: optimisticWidget.data,
      })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.error("Failed to add widget:", error?.message);
          set((state) => ({ widgets: state.widgets.filter((w) => w.id !== tempId) }));
          return;
        }
        set((state) => ({
          widgets: state.widgets.map((w) => (w.id === tempId ? rowToWidget(data as WidgetRow) : w)),
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
        if (error) console.error("Failed to remove widget:", error.message);
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
          if (error) console.error("Failed to update widget layout:", error.message);
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
          if (error) console.error("Failed to update widget data:", error.message);
        });
    });
  },

  bringToFront: (id) => {
    const maxZ = Math.max(0, ...get().widgets.map((w) => w.zIndex));
    const nextZ = maxZ + 1;
    set((state) => ({
      widgets: state.widgets.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w)),
    }));
    scheduleWrite(`zindex:${id}`, () => {
      supabase
        .from("board_widgets")
        .update({ z_index: nextZ })
        .eq("id", id)
        .then(({ error }) => {
          if (error) console.error("Failed to bring widget to front:", error.message);
        });
    });
  },
}));
