const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined;
const GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI as
    | string
    | undefined;

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/** Whether the two frontend env vars this flow needs are actually set --
 *  checked lazily (not thrown eagerly like lib/supabase.ts's own required
 *  vars) since Google Calendar is an optional, newer feature that
 *  shouldn't break the rest of the app for anyone who hasn't configured
 *  it yet. */
export const isGoogleCalendarConfigured = Boolean(
    GOOGLE_CLIENT_ID && GOOGLE_REDIRECT_URI,
);

/** Builds the URL that kicks off Google's consent screen. access_type=
 *  offline + prompt=consent together are what make Google actually include
 *  a refresh_token in the response every time (see the Phase 0 guide's
 *  gotchas) -- without both, a returning user who already granted access
 *  once wouldn't get a new one on a second connect. `state` must be a
 *  google_oauth_states row's own id, already inserted by the caller (see
 *  calendarStore.ts's startGoogleConnect), so google-oauth-callback can
 *  resolve it back to this user once Google redirects there. redirect_uri
 *  has to be byte-for-byte the same value the Edge Function's own
 *  GOOGLE_REDIRECT_URI secret holds, or Google rejects the exchange. */
export function buildGoogleAuthorizeUrl(state: string): string {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
        throw new Error(
            "Missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_REDIRECT_URI",
        );
    }
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: GOOGLE_CALENDAR_SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
