import type { CalendarSettings } from "../types/calendar";

export const HOUR_HEIGHT = 56;
export const DAY_COLUMN_MIN_WIDTH = 200;

export function startOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

export function addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export function getWeekStart(date: Date, weekStart: number) {
    const result = startOfDay(date);
    const difference = (result.getDay() - weekStart + 7) % 7;
    result.setDate(result.getDate() - difference);
    return result;
}

export function formatDate(date: Date, settings: CalendarSettings) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    if (settings.dateFormat === "DD/MM/YYYY") return `${day}/${month}/${year}`;
    if (settings.dateFormat === "YYYY-MM-DD") return `${year}-${month}-${day}`;
    return `${month}/${day}/${year}`;
}

export function formatTime(date: Date, settings: CalendarSettings) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: settings.timeFormat === "12h",
    }).format(date);
}

export function formatHour(hour: number, settings: CalendarSettings) {
    const date = new Date(2000, 0, 1, hour, 0);
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: settings.timeFormat === "12h",
    }).format(date);
}

export function formatDayName(date: Date, settings: CalendarSettings) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        weekday: "short",
    }).format(date);
}

export function formatMonthDay(date: Date, settings: CalendarSettings) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timeZone,
        month: "short",
        day: "numeric",
    }).format(date);
}

export function sameCalendarDay(a: Date, b: Date, timeZone: string) {
    const parts = (value: Date) =>
        new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(value);
    return parts(a) === parts(b);
}

export function localWallTimeToUtcIso(date: Date, timeZone: string) {
    const desiredWallUtc = Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
    );
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(desiredWallUtc));
    const get = (type: string) =>
        Number(parts.find((part) => part.type === type)?.value);
    const actualWallUtc = Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
    );
    const offset = actualWallUtc - desiredWallUtc;
    return new Date(desiredWallUtc - offset).toISOString();
}

export function zonedDateTimeToUtcIso(
    date: Date,
    hour: number,
    minute: number,
    timeZone: string,
) {
    const wall = new Date(date);
    wall.setHours(hour, minute, 0, 0);
    return localWallTimeToUtcIso(wall, timeZone);
}

export function eventTopAndHeight(
    startsAt: string,
    endsAt: string,
    day: Date,
    timeZone: string,
) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const parts = (value: Date) => {
        const formatted = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(value);
        return {
            hour: Number(formatted.find((part) => part.type === "hour")?.value),
            minute: Number(
                formatted.find((part) => part.type === "minute")?.value,
            ),
        };
    };
    const startParts = parts(start);
    const endParts = parts(end);
    const top = (startParts.hour * 60 + startParts.minute) * (HOUR_HEIGHT / 60);
    const endMinutes = endParts.hour * 60 + endParts.minute;
    const startMinutes = startParts.hour * 60 + startParts.minute;
    const height = Math.max(
        HOUR_HEIGHT / 4,
        (endMinutes - startMinutes) * (HOUR_HEIGHT / 60),
    );
    void day;
    return { top, height };
}

export function dateInputValue(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    return `${year}-${month}-${day}`;
}

export function timeInputValue(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    return `${parts.find((part) => part.type === "hour")?.value ?? "00"}:${parts.find((part) => part.type === "minute")?.value ?? "00"}`;
}

export function inputValuesToUtcIso(
    dateValue: string,
    timeValue: string,
    timeZone: string,
) {
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
    const wall = new Date(year, month - 1, day, hour, minute, 0, 0);
    return localWallTimeToUtcIso(wall, timeZone);
}
