/** Event colors: working out what color an event should be, and what to
 *  paint on top of it.
 *
 *  Precedence follows Google's own: an event's own color wins, otherwise it
 *  inherits its calendar's, otherwise it falls back to the app's default
 *  event color. Those colors are arbitrary hex from Google rather than
 *  anything from Coria's theme, so nothing can assume dark text will read
 *  against them -- readableTextColor picks per color instead. */

import type { Calendar } from "../types/calendar";

/** Used when neither the event nor its calendar has a color -- a purely
 *  local calendar, or one linked before colors were pulled in. Matches the
 *  --color-pin-todo token every event used to be painted with. */
export const DEFAULT_EVENT_COLOR = "#d8a93e";

/** Google's eleven event colors, offered as the swatches in Coria's own
 *  picker so a color chosen here is one Google can represent exactly -- see
 *  hexToNearestColorId in supabase/functions/_shared/colors.ts, which maps
 *  back the other way when color push-back is switched on. Kept in step with
 *  FALLBACK_EVENT_PALETTE there; duplicated rather than shared because the
 *  two run in different runtimes, same as eventMapping.ts and this folder. */
export const EVENT_COLOR_SWATCHES: { name: string; hex: string }[] = [
    { name: "Lavender", hex: "#a4bdfc" },
    { name: "Sage", hex: "#7ae7bf" },
    { name: "Grape", hex: "#dbadff" },
    { name: "Flamingo", hex: "#ff887c" },
    { name: "Banana", hex: "#fbd75b" },
    { name: "Tangerine", hex: "#ffb878" },
    { name: "Peacock", hex: "#46d6db" },
    { name: "Graphite", hex: "#e1e1e1" },
    { name: "Blueberry", hex: "#5484ed" },
    { name: "Basil", hex: "#51b749" },
    { name: "Tomato", hex: "#dc2127" },
];

function parseHex(hex: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    const value = Number.parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The color to paint an event in: its own, else its calendar's, else the
 *  default. `calendars` is the loaded list -- an event whose calendar isn't
 *  in it (still loading) just falls through to the default.
 *
 *  An absent calendarId means the primary calendar, which is where addEvent
 *  puts an event that doesn't name one -- so a new event's draft previews
 *  the color it will actually get once saved. */
export function resolveEventColor(
    event: { color: string | null; calendarId?: string },
    calendars: Calendar[],
): string {
    if (event.color) return event.color;
    const calendar = event.calendarId
        ? calendars.find((item) => item.id === event.calendarId)
        : calendars.find((item) => item.isPrimary);
    return calendar?.color ?? DEFAULT_EVENT_COLOR;
}

/** Pure black rather than the app's softer --color-ink, and only ever used
 *  as event-block text on a colored fill. The extra contrast matters: with a
 *  #1a1a1a dark text, sweeping the whole color cube leaves about 7% of
 *  colors where neither dark nor light text reaches WCAG AA on the fill. At
 *  pure black the worst case anywhere is 4.58:1, so every color a user can
 *  pick stays legible. */
export const DARK_TEXT = "#000000";
export const LIGHT_TEXT = "#ffffff";

/** WCAG relative luminance -- weighted for the eye's sensitivity rather than
 *  a plain channel average, since a mid blue and a mid green of the same
 *  naive brightness are nothing alike to look at. */
function relativeLuminance(rgb: [number, number, number]): number {
    const [r, g, b] = rgb.map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: number, b: number): number {
    const [lighter, darker] = a > b ? [a, b] : [b, a];
    return (lighter + 0.05) / (darker + 0.05);
}

/** What an event block sits on. Matches --color-paper, so a translucent fill
 *  can be resolved to the color actually on screen. A custom theme can move
 *  --color-paper, which would make this an approximation rather than an
 *  exact match -- still far closer than ignoring the blend entirely. */
export const PAPER_BACKDROP = "#fbf8f1";

/** Dark or light text, whichever actually reads better on `background` once
 *  it's been drawn at `alpha` over the page.
 *
 *  Two things this gets right that the obvious version doesn't. It compares
 *  both candidates rather than thresholding luminance at a midpoint -- the
 *  mid-tones in Google's palette (Flamingo, Blueberry, Basil) sit right on
 *  any such threshold, and light text drops them to ~2.3:1 where dark gives
 *  ~6:1. And it judges the *composited* fill, not the raw color: a
 *  translucent fill over light paper is much lighter than the color itself,
 *  so Tomato at 0.7 wants dark text (5.19:1) while the same color opaque
 *  wants light (4.90:1). Judging the raw color gets that case backwards. */
export function readableTextColor(
    background: string,
    alpha = 1,
    backdrop = PAPER_BACKDROP,
): string {
    const rgb = parseHex(background);
    if (!rgb) return DARK_TEXT;
    const base = parseHex(backdrop) ?? [255, 255, 255];
    const composited = rgb.map((channel, index) =>
        Math.round(channel * alpha + base[index] * (1 - alpha)),
    ) as [number, number, number];

    const luminance = relativeLuminance(composited);
    const onDark = contrastRatio(luminance, relativeLuminance([26, 26, 26]));
    const onLight = contrastRatio(luminance, relativeLuminance([255, 255, 255]));
    return onDark >= onLight ? DARK_TEXT : LIGHT_TEXT;
}

/** `background` with `alpha` applied, as an rgba() string. Event blocks are
 *  drawn slightly translucent so the grid lines behind them stay readable,
 *  which the old bg-pin-todo/70 did with a Tailwind opacity suffix -- that
 *  isn't available for a runtime hex, so it's mixed here instead. */
export function withAlpha(hex: string, alpha: number): string {
    const rgb = parseHex(hex);
    if (!rgb) return hex;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** How much of the color shows through an event block when the "opaque
 *  events" setting is off. Low enough that the hour grid still reads behind
 *  a busy day. */
export const TRANSPARENT_FILL_ALPHA = 0.7;
/** The same, for the board widget's smaller event cards -- lighter, since
 *  they're stacked in a much tighter space. */
export const TRANSPARENT_CARD_ALPHA = 0.25;

/** Everything needed to paint one event block: the fill, a border of the
 *  same hue, and a text color that reads against the fill as composited --
 *  so the same color can correctly take dark text translucent and light text
 *  opaque. */
export function eventBlockStyle(
    color: string,
    fillAlpha = TRANSPARENT_FILL_ALPHA,
): { backgroundColor: string; borderColor: string; color: string } {
    return {
        backgroundColor: withAlpha(color, fillAlpha),
        // Kept a touch stronger than the fill so the edge stays defined even
        // when the fill is at its most translucent.
        borderColor: withAlpha(color, Math.min(1, fillAlpha + 0.2)),
        color: readableTextColor(color, fillAlpha),
    };
}
