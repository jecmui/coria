import { useEffect, useState } from "react";
import type { AppearanceColors, AppearanceSettings } from "../types";

// Mirrors the hardcoded values in src/index.css -- this is the app's
// out-of-the-box palette, and what every "Reset to defaults" control resets to.
export const LIGHT_COLORS: AppearanceColors = {
    board: "#e3ab7d",
    boardLine: "#c3834f",
    paper: "#fbf8f1",
    paperEdge: "#e8e1d0",
    ink: "#232320",
    inkSoft: "#656460",
    pinTodo: "#d8a93e",
    pinNote: "#89add9",
    pinTimer: "#c1553d",
    pinImage: "#6f9c76",
    pinCalendar: "#9c7bc9",
    dueDateBadge: "#e8e1d0",
};

export const DARK_COLORS: AppearanceColors = {
    board: "#1c1a17",
    boardLine: "#302a22",
    paper: "#26231e",
    paperEdge: "#3a352c",
    ink: "#f0ece2",
    inkSoft: "#a8a196",
    pinTodo: "#e8bd5a",
    pinNote: "#7fb0e0",
    pinTimer: "#e2775a",
    pinImage: "#7fbf8a",
    pinCalendar: "#b499e0",
    dueDateBadge: "#3a352c",
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
    theme: "system",
    colors: LIGHT_COLORS,
    snapToGrid: false,
};

const CSS_VAR_BY_FIELD: Record<keyof AppearanceColors, string> = {
    board: "--color-board",
    boardLine: "--color-board-line",
    paper: "--color-paper",
    paperEdge: "--color-paper-edge",
    ink: "--color-ink",
    inkSoft: "--color-ink-soft",
    pinTodo: "--color-pin-todo",
    pinNote: "--color-pin-note",
    pinTimer: "--color-pin-timer",
    pinImage: "--color-pin-image",
    pinCalendar: "--color-pin-calendar",
    dueDateBadge: "--color-due-date-badge",
};

/** Resolves the concrete color set a theme setting represents. Light, Dark, and
 * System always resolve to the built-in palettes above; only Custom uses the
 * user's own saved color values. */
export function resolveColors(
    settings: AppearanceSettings,
    prefersDark: boolean,
): AppearanceColors {
    switch (settings.theme) {
        case "light":
            return LIGHT_COLORS;
        case "dark":
            return DARK_COLORS;
        case "system":
            return prefersDark ? DARK_COLORS : LIGHT_COLORS;
        case "custom":
            return settings.colors;
    }
}

export function colorsEqual(a: AppearanceColors, b: AppearanceColors) {
    return (Object.keys(CSS_VAR_BY_FIELD) as (keyof AppearanceColors)[]).every(
        (field) => a[field] === b[field],
    );
}

/** Applies a resolved color set to the document as live CSS custom property
 * overrides, so every `var(--color-*)` reference (Tailwind utilities and
 * direct `var()` usage alike) picks it up immediately. */
export function applyColorsToDocument(colors: AppearanceColors) {
    const root = document.documentElement;
    (Object.keys(CSS_VAR_BY_FIELD) as (keyof AppearanceColors)[]).forEach(
        (field) => {
            root.style.setProperty(CSS_VAR_BY_FIELD[field], colors[field]);
        },
    );
}

/** Tracks the OS-level color scheme preference, used to resolve "System Default". */
export function usePrefersDark() {
    const [prefersDark, setPrefersDark] = useState(
        () =>
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches,
    );

    useEffect(() => {
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (event: MediaQueryListEvent) =>
            setPrefersDark(event.matches);
        mql.addEventListener("change", handleChange);
        return () => mql.removeEventListener("change", handleChange);
    }, []);

    return prefersDark;
}