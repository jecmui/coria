export interface CalendarEvent {
    id: string;
    title: string;
    description: string;
    location: string;
    startsAt: string;
    endsAt: string;
}

export interface CalendarSettings {
    weekStart: number;
    dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
    timeFormat: "12h" | "24h";
    timeZone: string;
    defaultEventDuration: number;
}
