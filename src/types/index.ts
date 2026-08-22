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
    /** Due date (ms epoch, UTC midnight for the picked calendar date). `null`
     *  means the task has no due date and is permanent -- it never becomes
     *  overdue and must be excluded from any due-date-based sorting/expiry,
     *  not treated as due immediately or on any particular date. */
    dueDate: number | null;
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
    /** Fill for a task's due-date badge. Not yet backed by its own settings
     *  control or Supabase column -- always resolves to its palette default
     *  for now (see appearanceStore.ts's `load`) -- but it's a real field on
     *  the palette so wiring a picker in later is a drop-in, same as every
     *  other color here. */
    dueDateBadge: string;
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
