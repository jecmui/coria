import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { ensureFreshAccessToken } from "../_shared/google.ts";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // config.toml sets verify_jwt = true for this function, so Supabase
    // already rejected the request before this code ran if the
    // Authorization header wasn't a valid session -- this client just
    // needs to read *whose* session it was.
    const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
            global: {
                headers: { Authorization: req.headers.get("Authorization")! },
            },
        },
    );
    const { data: userData, error: userError } =
        await authClient.auth.getUser();
    if (userError || !userData.user) {
        return json({ error: "Unauthorized" }, 401);
    }

    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin
        .from("calendar_connections")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("provider", "google")
        .maybeSingle();
    if (connectionError || !connection) {
        return json({ error: "No Google connection for this user" }, 404);
    }

    try {
        // Deliberately doesn't return the access token itself -- the
        // browser should never hold one, only ever a "connected" status.
        // Anything that actually needs to call Google's API runs
        // server-side (Phase 4's google-calendar-sync, which can call
        // ensureFreshAccessToken directly instead of over HTTP).
        await ensureFreshAccessToken(admin, connection.id);
        const { data: secret } = await admin
            .from("calendar_connection_secrets")
            .select("expires_at")
            .eq("connection_id", connection.id)
            .single();
        return json({ connected: true, expiresAt: secret?.expires_at });
    } catch (error) {
        console.error("google-token-refresh failed:", error);
        return json({ error: "Refresh failed" }, 500);
    }
});
