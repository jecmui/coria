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
    /** Position in the mobile stacked view, reorderable by drag. Independent of `layout`,
     *  which only applies to the free-form desktop canvas. */
    mobileOrder: number;
    /** Widget-specific payload, shape depends on `type` */
    data:
        | NoteData
        | TodoWidgetData
        | TimerData
        | ImageData
        | CalendarWidgetData;
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
}
