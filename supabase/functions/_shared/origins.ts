/** ALLOWED_ORIGINS is a comma-separated list (e.g.
 *  "http://localhost:5173,https://coria-livid.vercel.app") -- a single
 *  static origin can't correctly serve both local development and
 *  production at once, since a browser calling from either one needs the
 *  response to actually name *its* origin, not whichever one happened to
 *  be configured. Every function that needs to know "is this caller
 *  allowed" (CORS headers, and google-oauth-callback's post-auth redirect
 *  target) goes through this same list, so there's one place to update
 *  when a new environment (a preview deploy, a different dev port) needs
 *  to be trusted. */
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export function isAllowedOrigin(
    origin: string | null | undefined,
): origin is string {
    return Boolean(origin && allowedOrigins.includes(origin));
}

/** Returns `origin` if it's on the allowlist, otherwise null -- callers
 *  that need a redirect target or header value use this instead of
 *  trusting an unvalidated value (e.g. a stored google_oauth_states row)
 *  outright. */
export function pickAllowedOrigin(
    origin: string | null | undefined,
): string | null {
    return isAllowedOrigin(origin) ? origin : null;
}
