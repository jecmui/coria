import { isAllowedOrigin } from "./origins.ts";

/** Computed per-request (not a static object) so the Allow-Origin header
 *  actually names whichever allowed origin is calling right now -- a
 *  browser rejects a response whose Allow-Origin doesn't match the page's
 *  own origin, so a fixed value could only ever satisfy one environment.
 *  Callers not on ALLOWED_ORIGINS simply get no Allow-Origin header,
 *  which the browser treats as a normal CORS rejection. */
export function corsHeaders(req: Request): HeadersInit {
    const origin = req.headers.get("Origin");
    const headers: Record<string, string> = {
        "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
        // Tells any cache in front of this function that the response
        // varies by Origin, so it never serves one origin's CORS headers
        // to another.
        Vary: "Origin",
    };
    if (isAllowedOrigin(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
    }
    return headers;
}
