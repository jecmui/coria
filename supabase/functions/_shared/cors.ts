// APP_URL is also what google-oauth-callback redirects back to -- reusing
// it here means the app's own origin is the only one allowed to call these
// functions from browser JS, without a second env var to keep in sync.
const appUrl = Deno.env.get("APP_URL") ?? "*";

export const corsHeaders = {
    "Access-Control-Allow-Origin": appUrl,
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};
