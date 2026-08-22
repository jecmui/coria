export type WidgetType =
    | "todo"
    | "note"
    | "timer"
    | "image"
    | "calendar"
    | "now";

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
    /** Position in the mobile stacked view, reorderable by drag. Independent of `layout`,
     *  which only applies to the free-form desktop canvas. */
    mobileOrder: number;
    /** Widget-specific payload, shape depends on `type` */
    data:
        | NoteData
        | TodoWidgetData
        | TimerData
        | ImageData
        | CalendarWidgetData
        | NowData;
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

/** The "Currently working on..." widget: one task and a stopwatch.
 *
 *  `running` is deliberately absent. Closing the tab pauses the stopwatch
 *  without stopping it, so a restored widget is always paused -- what has to
 *  survive is the time banked so far, not whether it was counting. Stopping
 *  is the only thing that clears the title and puts elapsedMs back to 0, so
 *  those two fields are enough to tell "paused mid-task" from "idle". */
export interface NowData {
    /** The task being worked on; "" when idle. */
    title: string;
    /** The task row this points at, or null for a title with no task behind
     *  it yet (only possible transiently -- picking or creating always sets
     *  one). */
    taskId: string | null;
    /** Milliseconds banked across every run since the last stop. */
    elapsedMs: number;
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
    /** Drag-reorder position among today's focus tasks, as shown in the Today widget. */
    sortOrder: number;
}

export type ThemeMode = "light" | "dark" | "system" | "custom";

export interface AppearanceColors {
    board: string;
    boardLine: string;
    paper: string;
    paperEdge: string;
    ink: string;
    inkSoft: string;
    pinTodo: string;
    pinNote: string;
    pinTimer: string;
    pinImage: string;
    pinCalendar: string;
}

export interface AppearanceSettings {
    theme: ThemeMode;
    /** The user's custom color set. Only actually applied when `theme` is "custom" --
     *  Light/Dark/System always resolve to their built-in palettes instead. */
    colors: AppearanceColors;
    /** When true, widgets snap to a grid on the board as they're dragged or resized. */
    snapToGrid: boolean;
}

export type TodayClearMode = "manual" | "automatic";
export type TodayClearScope = "all" | "completed";

export interface TodayClearSettings {
    /** "manual" leaves clearing to right-clicking the Today widget; "automatic"
     *  additionally clears it on its own every day at `time`. */
    mode: TodayClearMode;
    /** 24-hour wall-clock time ("HH:MM") the automatic clear runs at, in `timeZone`. */
    time: string;
    timeZone: string;
    /** Whether the automatic clear removes every task from Today, or only the done ones. */
    scope: TodayClearScope;
}
