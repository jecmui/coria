import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are reserved env var names --
 *  the Supabase Edge Runtime injects both automatically for every deployed
 *  function (and `supabase functions serve` injects them locally too), so
 *  they're never set by hand via `supabase secrets set`. The service role
 *  key bypasses RLS entirely, which is exactly why every table meant to be
 *  invisible to the browser (calendar_connection_secrets from READY-06,
 *  and google_oauth_states once a row is created) grants no policy to
 *  anon/authenticated at all -- this client is the only thing that can
 *  read or write them. */
export function createAdminClient() {
    return createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
}
