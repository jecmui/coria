export type WidgetType = "todo" | "note" | "timer" | "image" | "calendar";

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
  data: NoteData | TodoWidgetData | TimerData | ImageData | CalendarWidgetData;
}

export interface NoteData {
  text: string;
}

export interface CalendarWidgetData {
  view: "agenda";
}

export interface ImageData {
  src: string;
  fileName: string;
}

export interface TodoWidgetData {
  // The todo widget just mirrors the global task list;
  // this is reserved for future per-widget display prefs (e.g. max items shown)
  maxItemsShown: number;
}

export interface PomodoroSettings {
  focusSeconds: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
  longBreakInterval: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export interface TimerData extends PomodoroSettings {
  mode: "pomodoro";
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  focusToday: boolean;
  createdAt: number;
}