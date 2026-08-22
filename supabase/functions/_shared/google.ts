import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/** Refresh a bit before actual expiry, so a token that's technically still
 *  valid when checked doesn't expire mid-request against Google's API. */
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

interface GoogleTokenResponse {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    token_type: string;
}

function requireEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

/** First half of the OAuth dance -- trades the one-time `code` Google
 *  redirected back with for a real access/refresh token pair. Only ever
 *  called from google-oauth-callback, right after a user approves access.
 *  redirect_uri has to be byte-for-byte the same value used in the
 *  original authorize request (Phase 0's registered URI), or Google
 *  rejects the exchange. */
export async function exchangeCodeForTokens(
    code: string,
): Promise<GoogleTokenResponse> {
    const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: requireEnv("GOOGLE_CLIENT_ID"),
            client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
            redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
            grant_type: "authorization_code",
        }),
    });
    if (!response.ok) {
        throw new Error(
            `Google token exchange failed: ${response.status} ${await response.text()}`,
        );
    }
    return response.json();
}

/** Trades a stored refresh_token for a new access_token. Google doesn't
 *  send back a new refresh_token on this grant type -- the original one
 *  stays valid and reusable until the user revokes access from their
 *  Google account, so callers should never overwrite a stored
 *  refresh_token with the result of this call. */
async function refreshAccessToken(
    refreshToken: string,
): Promise<GoogleTokenResponse> {
    const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: requireEnv("GOOGLE_CLIENT_ID"),
            client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
            grant_type: "refresh_token",
        }),
    });
    if (!response.ok) {
        throw new Error(
            `Google token refresh failed: ${response.status} ${await response.text()}`,
        );
    }
    return response.json();
}

/** The primary calendar's own id *is* the Google account's email, by
 *  Google's own convention -- reading it this way (instead of hitting a
 *  separate userinfo endpoint) needs no scope beyond the .../auth/calendar
 *  one Phase 0 already grants, so provider_account_id can be populated
 *  without asking for a second, identity-specific scope. */
export async function fetchPrimaryCalendarId(
    accessToken: string,
): Promise<string> {
    const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary",
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
        throw new Error(
            `Failed to read primary calendar: ${response.status} ${await response.text()}`,
        );
    }
    const data = await response.json();
    return data.id as string;
}

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Thrown when Google rejects a stored syncToken as too old (HTTP 410).
 *  The documented recovery is to drop the token and re-list the calendar
 *  in full, which is exactly what google-calendar-sync does with this. */
export class SyncTokenExpiredError extends Error {
    constructor() {
        super("Google sync token expired");
        this.name = "SyncTokenExpiredError";
    }
}

async function googleFetch(
    accessToken: string,
    path: string,
    init: RequestInit = {},
): Promise<unknown> {
    const response = await fetch(`${CALENDAR_API}${path}`, {
        ...init,
        headers: {
            ...init.headers,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    if (response.status === 410) throw new SyncTokenExpiredError();
    if (!response.ok) {
        throw new Error(
            `Google Calendar API ${init.method ?? "GET"} ${path} failed: ` +
                `${response.status} ${await response.text()}`,
        );
    }
    // events.delete answers 204 with an empty body.
    if (response.status === 204) return null;
    return response.json();
}

export interface GoogleCalendarListEntry {
    id: string;
    summary: string;
    primary?: boolean;
    accessRole: string;
    /** The calendar's own color, as the hex Google shows it in. Every event
     *  on this calendar inherits it unless it carries a colorId of its own. */
    backgroundColor?: string;
}

/** The user's own Google calendars, for Phase 3's "add them to an existing
 *  calendar" option. Filtered to the ones they can actually write to --
 *  offering a read-only shared calendar as a migration target would only
 *  fail later, at the first push. */
export async function listWritableCalendars(
    accessToken: string,
): Promise<GoogleCalendarListEntry[]> {
    const data = (await googleFetch(
        accessToken,
        "/users/me/calendarList?minAccessRole=writer",
    )) as { items?: GoogleCalendarListEntry[] };
    return data.items ?? [];
}

/** Every calendar the user has access to, for the "manage synced calendars"
 *  picker (Settings > Calendar) -- unlike listWritableCalendars, this
 *  includes calendars they can only view (a subscribed holiday calendar, a
 *  shared read-only team calendar), since pulling events in doesn't need
 *  write access. Each entry's own accessRole is what the caller uses to
 *  decide is_writable when linking one. */
export async function listAllCalendars(
    accessToken: string,
): Promise<GoogleCalendarListEntry[]> {
    const data = (await googleFetch(
        accessToken,
        "/users/me/calendarList",
    )) as { items?: GoogleCalendarListEntry[] };
    return data.items ?? [];
}

/** Google's event color palette: colorId -> { background, foreground }. The
 *  eleven entries a colorId can name are served separately from the events
 *  themselves, so a pull has to resolve them here before it can store a real
 *  hex -- see colorIdToHex in colors.ts. */
export async function listEventColors(
    accessToken: string,
): Promise<Record<string, string>> {
    const data = (await googleFetch(accessToken, "/colors")) as {
        event?: Record<string, { background?: string }>;
    };
    const palette: Record<string, string> = {};
    for (const [id, value] of Object.entries(data.event ?? {})) {
        if (value.background) palette[id] = value.background;
    }
    return palette;
}

/** Phase 3's "create a new calendar for these events" option. */
export async function createCalendar(
    accessToken: string,
    summary: string,
    timeZone: string,
): Promise<GoogleCalendarListEntry> {
    return (await googleFetch(accessToken, "/calendars", {
        method: "POST",
        body: JSON.stringify({ summary, timeZone }),
    })) as GoogleCalendarListEntry;
}

export interface GoogleEventsPage {
    items: Record<string, unknown>[];
    nextPageToken?: string;
    nextSyncToken?: string;
}

/** One page of a calendar's events.
 *
 *  singleEvents is deliberately left off (false): Coria stores a recurring
 *  series as one master row plus rows in calendar_event_exceptions, which
 *  is exactly the shape Google returns in this mode -- masters carrying
 *  `recurrence`, and per-occurrence overrides carrying `recurringEventId`
 *  + `originalStartTime`. Asking Google to pre-expand instances instead
 *  would flatten that back into thousands of standalone rows.
 *
 *  showDeleted is required for incremental syncs to report deletions at
 *  all -- without it a cancelled event simply vanishes from the response
 *  and the local copy would linger forever. */
export async function listEventsPage(
    accessToken: string,
    calendarId: string,
    options: { syncToken?: string | null; pageToken?: string },
): Promise<GoogleEventsPage> {
    const params = new URLSearchParams({
        showDeleted: "true",
        maxResults: "250",
    });
    if (options.syncToken) params.set("syncToken", options.syncToken);
    if (options.pageToken) params.set("pageToken", options.pageToken);
    const data = (await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    )) as GoogleEventsPage;
    return { ...data, items: data.items ?? [] };
}

export async function insertEvent(
    accessToken: string,
    calendarId: string,
    body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    return (await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: "POST", body: JSON.stringify(body) },
    )) as Record<string, unknown>;
}

export async function updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    return (await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: "PUT", body: JSON.stringify(body) },
    )) as Record<string, unknown>;
}

/** Relocates an event to another calendar, keeping its id and everything
 *  hanging off it -- attendees and their responses, any Meet link, the
 *  revision history. Google models this as its own operation precisely
 *  because a plain update can't do it: an event id only exists within the
 *  calendar that holds it, so writing to the destination would just 404. */
export async function moveEvent(
    accessToken: string,
    fromCalendarId: string,
    eventId: string,
    toCalendarId: string,
): Promise<Record<string, unknown>> {
    return (await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(fromCalendarId)}/events/${encodeURIComponent(eventId)}/move` +
            `?destination=${encodeURIComponent(toCalendarId)}`,
        { method: "POST" },
    )) as Record<string, unknown>;
}

/** Deletes an event, treating "already gone" as success -- a 404 here means
 *  the deletion this push exists to perform has effectively happened, and
 *  failing the whole sync over it would just retry forever. */
export async function deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
): Promise<void> {
    const response = await fetch(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (response.ok || response.status === 404 || response.status === 410) {
        return;
    }
    throw new Error(
        `Google Calendar delete failed: ${response.status} ${await response.text()}`,
    );
}

/** Returns a definitely-usable access token for a connection, refreshing
 *  and persisting a new one first if the stored one is expired or close
 *  to it. The one place both google-token-refresh and (later) Phase 4's
 *  sync logic should go through, so "is this token still good, and if not
 *  fix it" only needs to be correct in one place. Never touches
 *  refresh_token -- see refreshAccessToken above. */
export async function ensureFreshAccessToken(
    admin: SupabaseClient,
    connectionId: string,
): Promise<string> {
    const { data: secret, error } = await admin
        .from("calendar_connection_secrets")
        .select("access_token, refresh_token, expires_at")
        .eq("connection_id", connectionId)
        .single();
    if (error || !secret) {
        throw new Error(`No stored tokens for connection ${connectionId}`);
    }

    const expiresAt = new Date(secret.expires_at).getTime();
    if (expiresAt - Date.now() > EXPIRY_BUFFER_MS) {
        return secret.access_token;
    }

    const refreshed = await refreshAccessToken(secret.refresh_token);
    const newExpiresAt = new Date(
        Date.now() + refreshed.expires_in * 1000,
    ).toISOString();

    const { error: updateError } = await admin
        .from("calendar_connection_secrets")
        .update({
            access_token: refreshed.access_token,
            expires_at: newExpiresAt,
        })
        .eq("connection_id", connectionId);
    if (updateError) {
        throw new Error(
            `Failed to persist refreshed token: ${updateError.message}`,
        );
    }

    return refreshed.access_token;
}
