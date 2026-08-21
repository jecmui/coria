import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import {
    exchangeCodeForTokens,
    fetchPrimaryCalendarId,
} from "../_shared/google.ts";
import { pickAllowedOrigin } from "../_shared/origins.ts";

/** How long a google_oauth_states row stays valid -- generous enough for a
 *  slow consent screen, tight enough that an old, abandoned row is never a
 *  meaningful replay target. */
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** `origin` is the caller's own return_origin (see startGoogleConnect in
 *  calendarStore.ts), already checked against ALLOWED_ORIGINS by the
 *  caller -- falls back to APP_URL when there's no resolved origin yet
 *  (the earliest failure paths, before the state row is even looked up)
 *  or when a row predates the return_origin column. A single static
 *  APP_URL can only ever be right for one environment, which is exactly
 *  the bug this whole redirectTo signature exists to avoid repeating. */
function redirectTo(path: string, origin?: string | null): Response {
    const target = origin ?? Deno.env.get("APP_URL") ?? "http://localhost:5173";
    return new Response(null, {
        status: 302,
        headers: { Location: `${target}${path}` },
    });
}

Deno.serve(async (req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    // The user clicked "Cancel" on Google's consent screen -- not a bug,
    // nothing to log.
    if (oauthError) {
        return redirectTo("/?google=denied");
    }
    if (!code || !state) {
        return redirectTo("/?google=invalid_request");
    }

    const admin = createAdminClient();

    // Delete-then-check consumes the row in the same step, so a replayed
    // callback with the same state (a retried request, a copy-pasted URL)
    // can't be used twice -- the second attempt simply finds nothing.
    const { data: stateRow, error: stateError } = await admin
        .from("google_oauth_states")
        .delete()
        .eq("state", state)
        .select("user_id, created_at, return_origin")
        .single();

    if (stateError || !stateRow) {
        console.error("Unknown or already-used oauth state:", state);
        return redirectTo("/?google=invalid_state");
    }
    const returnOrigin = pickAllowedOrigin(stateRow.return_origin);

    const stateAge = Date.now() - new Date(stateRow.created_at).getTime();
    if (stateAge > STATE_MAX_AGE_MS) {
        console.error("Expired oauth state:", state);
        return redirectTo("/?google=expired_state", returnOrigin);
    }

    // Opportunistic cleanup of anything abandoned mid-flow (a user who
    // started connecting and never finished) -- no cron exists in this
    // project, so a real callback sweeping stale rows as it goes is enough
    // to keep the table from growing unbounded.
    await admin
        .from("google_oauth_states")
        .delete()
        .lt(
            "created_at",
            new Date(Date.now() - STATE_MAX_AGE_MS).toISOString(),
        );

    try {
        const tokens = await exchangeCodeForTokens(code);
        const providerAccountId = await fetchPrimaryCalendarId(
            tokens.access_token,
        );

        const { data: connection, error: connectionError } = await admin
            .from("calendar_connections")
            .upsert(
                {
                    user_id: stateRow.user_id,
                    provider: "google",
                    provider_account_id: providerAccountId,
                    sync_enabled: true,
                },
                { onConflict: "user_id,provider" },
            )
            .select("id")
            .single();
        if (connectionError || !connection) {
            throw new Error(
                `Failed to upsert calendar_connections: ${connectionError?.message}`,
            );
        }

        // Google only sends a refresh_token on the very first consent (or
        // any consent where the authorize URL forced prompt=consent) --
        // preserve whatever's already stored if this particular response
        // didn't include one, instead of overwriting a valid token with
        // null on a routine re-authorization.
        const { data: existingSecret } = await admin
            .from("calendar_connection_secrets")
            .select("refresh_token")
            .eq("connection_id", connection.id)
            .maybeSingle();

        const refreshToken =
            tokens.refresh_token ?? existingSecret?.refresh_token;
        if (!refreshToken) {
            throw new Error(
                "Google returned no refresh_token and none was already stored -- " +
                    "check that the authorize URL includes access_type=offline&prompt=consent",
            );
        }

        const { error: secretError } = await admin
            .from("calendar_connection_secrets")
            .upsert(
                {
                    connection_id: connection.id,
                    access_token: tokens.access_token,
                    refresh_token: refreshToken,
                    expires_at: new Date(
                        Date.now() + tokens.expires_in * 1000,
                    ).toISOString(),
                    scope: tokens.scope,
                },
                { onConflict: "connection_id" },
            );
        if (secretError) {
            throw new Error(
                `Failed to upsert calendar_connection_secrets: ${secretError.message}`,
            );
        }

        return redirectTo("/?google=connected", returnOrigin);
    } catch (error) {
        console.error("google-oauth-callback failed:", error);
        return redirectTo("/?google=error", returnOrigin);
    }
});
