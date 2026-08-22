/** Google's event colors, and the translation between them and the plain hex
 *  strings Coria stores.
 *
 *  Google doesn't put a color on an event directly -- it stores a colorId
 *  naming one of eleven fixed palette entries, and the palette itself comes
 *  from a separate colors.get call. Coria stores the resolved hex instead, so
 *  nothing downstream (the UI, the widget, a local color picker) has to know
 *  about colorIds at all. Pushing back is the inverse: an arbitrary hex is
 *  snapped to whichever palette entry it's nearest, since colorId is the only
 *  thing Google will accept. */

export type EventPalette = Record<string, string>;

/** The palette as Google has served it for years. Only used when colors.get
 *  fails -- the live values win when they're available, since this is
 *  Google's data and Coria has no say in it. */
export const FALLBACK_EVENT_PALETTE: EventPalette = {
    "1": "#a4bdfc",
    "2": "#7ae7bf",
    "3": "#dbadff",
    "4": "#ff887c",
    "5": "#fbd75b",
    "6": "#ffb878",
    "7": "#46d6db",
    "8": "#e1e1e1",
    "9": "#5484ed",
    "10": "#51b749",
    "11": "#dc2127",
};

function parseHex(hex: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    const value = Number.parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** colorId -> hex, or null when the event has no color of its own (the
 *  common case -- most events just inherit their calendar's). */
export function colorIdToHex(
    colorId: string | undefined,
    palette: EventPalette,
): string | null {
    if (!colorId) return null;
    return palette[colorId] ?? FALLBACK_EVENT_PALETTE[colorId] ?? null;
}

/** hex -> the nearest colorId, for pushing a locally-chosen color back.
 *  Distance is measured in plain RGB space: the palette is eleven widely
 *  separated hues, so the extra accuracy of a perceptual color space would
 *  never change which one wins. */
export function hexToNearestColorId(
    hex: string,
    palette: EventPalette,
): string | null {
    const target = parseHex(hex);
    if (!target) return null;

    let bestId: string | null = null;
    let bestDistance = Infinity;
    for (const [id, value] of Object.entries(palette)) {
        const candidate = parseHex(value);
        if (!candidate) continue;
        const distance =
            (target[0] - candidate[0]) ** 2 +
            (target[1] - candidate[1]) ** 2 +
            (target[2] - candidate[2]) ** 2;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestId = id;
        }
    }
    return bestId;
}
