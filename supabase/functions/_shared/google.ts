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
