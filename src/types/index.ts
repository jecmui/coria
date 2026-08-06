export type WidgetType = "todo" | "note" | "timer";

export interface WidgetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardWidget {
  id: string;
  type: WidgetType;
  layout: WidgetLayout;
  zIndex: number;
  /** Widget-specific payload, shape depends on `type` */
  data: NoteData | TodoWidgetData | TimerData;
}

export interface NoteData {
  text: string;
}

export interface TodoWidgetData {
  // The todo widget just mirrors the global task list;
  // this is reserved for future per-widget display prefs (e.g. max items shown)
  maxItemsShown: number;
}

export interface TimerData {
  mode: "pomodoro";
  durationSeconds: number;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  focusToday: boolean;
  createdAt: number;
}
