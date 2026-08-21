/** Translation between Google's Events resource and Coria's own
 *  calendar_events / calendar_event_exceptions rows.
 *
 *  The one genuinely subtle thing here is time. Coria stores starts_at /
 *  ends_at as plain UTC instants (timestamptz) plus a separate
 *  event_time_zone naming the zone the event was *authored* in. Google
 *  instead sends one of two shapes per endpoint:
 *    - timed:   { dateTime: "2026-08-21T09:00:00-04:00", timeZone: "..." }
 *    - all-day: { date: "2026-08-21" }
 *  A timed dateTime carries its own offset, so it parses straight to the
 *  right instant. An all-day `date` carries no time at all, and has to be
 *  read as midnight *in the calendar's zone* to land on the same instant
 *  the local UI would have produced for the same day -- see
 *  inputValuesToUtcIso in src/lib/calendar.ts, which this mirrors. Getting
 *  that wrong shifts every all-day event by the UTC offset, which is
 *  exactly how all-day events end up rendering a day early or late. */

/** A wall-clock time in `timeZone`, as the UTC instant it corresponds to.
 *  Mirrors localWallTimeToUtcIso in src/lib/calendar.ts -- same
 *  measure-the-offset-then-subtract-it trick, since neither runtime has a
 *  built-in "parse this wall time in that zone" primitive. */
export function wallTimeToUtcIso(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    timeZone: string,
): string {
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(desired));
    const get = (type: string) =>
        Number(parts.find((part) => part.type === type)?.value);
    const actual = Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
    );
    return new Date(desired - (actual - desired)).toISOString();
}

/** The calendar date (YYYY-MM-DD) a UTC instant falls on when read in
 *  `timeZone` -- the inverse of wallTimeToUtcIso for all-day events. */
export function utcIsoToDateValue(iso: string, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(iso));
    const get = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

export interface GoogleDateTime {
    date?: string;
    dateTime?: string;
    timeZone?: string;
}

/** Google's start/end shape -> a UTC instant. */
export function googleDateTimeToUtcIso(
    value: GoogleDateTime,
    calendarTimeZone: string,
): string {
    if (value.dateTime) return new Date(value.dateTime).toISOString();
    if (!value.date) {
        throw new Error("Google date/time had neither dateTime nor date");
    }
    const [year, month, day] = value.date.split("-").map(Number);
    // The event's own timeZone when Google supplied one, since an all-day
    // event on a calendar in another zone still means "that whole day
    // there", not here.
    return wallTimeToUtcIso(
        year,
        month,
        day,
        0,
        0,
        value.timeZone ?? calendarTimeZone,
    );
}

/** A UTC instant -> Google's start/end shape. All-day events collapse back
 *  to a bare date; Coria already stores their exclusive end (midnight of
 *  the day after), which is the same convention Google uses, so no
 *  off-by-one adjustment is needed in either direction. */
export function utcIsoToGoogleDateTime(
    iso: string,
    allDay: boolean,
    timeZone: string,
): GoogleDateTime {
    if (allDay) return { date: utcIsoToDateValue(iso, timeZone) };
    // timeZone alongside an offset-bearing dateTime is redundant for
    // one-off events but load-bearing for recurring ones -- it's the zone
    // Google expands the RRULE in.
    return { dateTime: new Date(iso).toISOString(), timeZone };
}

/** Google returns recurrence as an array of RFC 5545 lines (RRULE, plus
 *  possibly EXDATE/RDATE). Coria's recurrence_rule column holds a bare
 *  RRULE value with no prefix -- see its comment in schema.sql -- so pull
 *  out just that line's value. EXDATE/RDATE are intentionally dropped:
 *  Coria models per-occurrence removals as calendar_event_exceptions rows
 *  instead, and the raw lines survive verbatim in external_raw regardless. */
export function recurrenceToRule(
    recurrence: string[] | undefined,
): string | null {
    const rrule = recurrence?.find((line) => line.startsWith("RRULE:"));
    return rrule ? rrule.slice("RRULE:".length) : null;
}

export function ruleToRecurrence(rule: string | null): string[] | undefined {
    return rule ? [`RRULE:${rule}`] : undefined;
}

export interface MappedGoogleEvent {
    externalId: string;
    title: string;
    description: string;
    location: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    recurrenceRule: string | null;
    eventTimeZone: string | null;
    externalRaw: Record<string, unknown>;
    updated: string;
    cancelled: boolean;
    /** Set when this is a single-occurrence override of a series rather
     *  than an event in its own right -- Google's recurringEventId names
     *  the master, originalStartTime which occurrence. */
    recurringEventId: string | null;
    originalStartTime: string | null;
}

/** Normalizes one Google event into the fields Coria stores. Everything
 *  Coria has no column for (attendees, reminders, conferenceData, colorId,
 *  visibility, ...) is preserved wholesale in externalRaw -- see READY-05
 *  and mergeGoogleEventPatch in src/lib/calendar.ts. */
export function mapGoogleEvent(
    raw: Record<string, unknown>,
    calendarTimeZone: string,
): MappedGoogleEvent {
    const start = (raw.start ?? {}) as GoogleDateTime;
    const end = (raw.end ?? {}) as GoogleDateTime;
    const cancelled = raw.status === "cancelled";
    const allDay = Boolean(start.date);

    // A cancelled event often arrives as a stub carrying only id/status --
    // no start/end at all -- so the timestamps can't be derived. Nothing
    // downstream reads them for a cancellation (it becomes a tombstone),
    // so the epoch stands in rather than throwing.
    const hasTimes = Boolean(start.dateTime || start.date);
    const startsAt = hasTimes
        ? googleDateTimeToUtcIso(start, calendarTimeZone)
        : new Date(0).toISOString();
    const endsAt =
        hasTimes && (end.dateTime || end.date)
            ? googleDateTimeToUtcIso(end, calendarTimeZone)
            : startsAt;

    const originalStart = raw.originalStartTime as GoogleDateTime | undefined;

    return {
        externalId: String(raw.id),
        title: (raw.summary as string) ?? "",
        description: (raw.description as string) ?? "",
        location: (raw.location as string) ?? "",
        startsAt,
        endsAt,
        allDay,
        recurrenceRule: recurrenceToRule(raw.recurrence as string[]),
        eventTimeZone: start.timeZone ?? null,
        externalRaw: raw,
        updated: (raw.updated as string) ?? new Date().toISOString(),
        cancelled,
        recurringEventId: (raw.recurringEventId as string) ?? null,
        originalStartTime: originalStart
            ? googleDateTimeToUtcIso(originalStart, calendarTimeZone)
            : null,
    };
}

/** Fields Google derives itself. They ride along inside external_raw (kept
 *  verbatim so nothing is lost), but sending them back in a write is at
 *  best ignored and at worst rejected, so they're stripped on the way out. */
const READ_ONLY_FIELDS = [
    "kind",
    "etag",
    "htmlLink",
    "created",
    "updated",
    "iCalUID",
    "hangoutLink",
    "creator",
    "organizer",
    "attendeesOmitted",
    "eventType",
];

export interface CoriaEventForPush {
    title: string;
    description: string | null;
    location: string | null;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    recurrence_rule: string | null;
    event_time_zone: string | null;
    external_raw: Record<string, unknown> | null;
}

/** Builds the body for events.insert / events.update.
 *
 *  READY-05 in practice: the stored raw Google object is the base, and only
 *  the handful of fields Coria actually owns are laid over it, so an event
 *  round-tripping through Coria keeps its attendees, reminders, Meet link,
 *  and everything else Coria never modelled. A locally-created event has no
 *  raw object yet, so the patch simply stands alone. */
export function buildGoogleEventBody(
    event: CoriaEventForPush,
    calendarTimeZone: string,
): Record<string, unknown> {
    const timeZone = event.event_time_zone ?? calendarTimeZone;
    const patch: Record<string, unknown> = {
        summary: event.title,
        description: event.description ?? "",
        location: event.location ?? "",
        start: utcIsoToGoogleDateTime(
            event.starts_at,
            event.all_day,
            timeZone,
        ),
        end: utcIsoToGoogleDateTime(event.ends_at, event.all_day, timeZone),
    };
    const recurrence = ruleToRecurrence(event.recurrence_rule);
    if (recurrence) {
        patch.recurrence = recurrence;
    } else if (event.external_raw?.recurrence) {
        // Recurrence was removed locally -- an absent key would leave
        // Google's existing rule in place, so it has to be explicitly
        // emptied instead.
        patch.recurrence = [];
    }

    const merged = { ...(event.external_raw ?? {}), ...patch };
    for (const field of READ_ONLY_FIELDS) delete merged[field];
    return merged;
}

/** Google's id for one occurrence of a recurring series, used to push a
 *  single-occurrence edit or cancellation at the right instance. The format
 *  is documented and stable: the master's id, an underscore, then the
 *  occurrence's original start as a compact UTC timestamp (or bare date for
 *  an all-day series). */
export function buildInstanceId(
    masterExternalId: string,
    originalStartIso: string,
    allDay: boolean,
    timeZone: string,
): string {
    if (allDay) {
        return `${masterExternalId}_${utcIsoToDateValue(originalStartIso, timeZone).replace(/-/g, "")}`;
    }
    const compact = new Date(originalStartIso)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    return `${masterExternalId}_${compact}`;
}
