import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { resolveUserId } from "../_shared/auth.ts";
import { ensureFreshAccessToken, listAllCalendars } from "../_shared/google.ts";
import { corsHeaders } from "../_shared/cors.ts";

/** "Manage synced calendars" (Settings > Calendar): lets a user pull from
 *  any Google calendar they have access to, beyond the one primary
 *  calendar Phase 3's migration links. This is a distinct, repeatable
 *  concern from that one-time flow -- migration is "what happens to my
 *  existing events the moment I connect," this is "which of my other
 *  Google calendars should Coria show going forward" -- so it's its own
 *  function rather than a third action on google-calendar-migrate.
 *
 *  Two actions:
 *    "list" -> every Google calendar the user can see, minus the one
 *              already linked to their primary Coria calendar (that one
 *              isn't this picker's to manage), each flagged with whether
 *              it's currently selected
 *    "save" -> reconciles the local calendars table against the caller's
 *              full desired set: adds a local row (with is_writable set
 *              from Google's own accessRole) for each newly selected
 *              calendar, and deletes the local row -- cascading to every
 *              event ever pulled from it -- for each one just deselected
 *
 *  Deselecting removes the row outright rather than pausing it: there's no
 *  separate "enabled" flag here, the row's existence *is* the enrollment. */

function json(cors: HeadersInit, body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: cors });
    }

    const userId = await resolveUserId(req);
    if (!userId) return json(cors, { error: "Unauthorized" }, 401);

    let payload: { action?: string; calendarIds?: string[] };
    try {
        payload = await req.json();
    } catch {
        return json(cors, { error: "Invalid request body" }, 400);
    }

    const admin = createAdminClient();
    const { data: connection } = await admin
        .from("calendar_connections")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
    if (!connection) {
        return json(cors, { error: "No Google connection for this user" }, 404);
    }

    try {
        const accessToken = await ensureFreshAccessToken(
            admin,
            connection.id,
        );

        // Every local calendar this picker doesn't own: the primary one
        // (Phase 3's migration is what links/unlinks it) is excluded from
        // both actions below so this picker can never delete it.
        const { data: primaryCalendar } = await admin
            .from("calendars")
            .select("external_calendar_id")
            .eq("user_id", userId)
            .eq("is_primary", true)
            .maybeSingle();
        const primaryExternalId = primaryCalendar?.external_calendar_id ?? null;

        if (payload.action === "list") {
            const [googleCalendars, localResult] = await Promise.all([
                listAllCalendars(accessToken),
                admin
                    .from("calendars")
                    .select("external_calendar_id")
                    .eq("user_id", userId)
                    .eq("is_primary", false)
                    .not("external_calendar_id", "is", null),
            ]);
            const linkedRows = (localResult.data ?? []) as {
                external_calendar_id: string;
            }[];
            const selectedIds = new Set(
                linkedRows.map((row) => row.external_calendar_id),
            );
            return json(cors, {
                calendars: googleCalendars
                    .filter((calendar) => calendar.id !== primaryExternalId)
                    .map((calendar) => ({
                        id: calendar.id,
                        summary: calendar.summary,
                        accessRole: calendar.accessRole,
                        selected: selectedIds.has(calendar.id),
                    })),
            });
        }

        if (payload.action !== "save") {
            return json(cors, { error: "Unknown action" }, 400);
        }
        const desiredIds = new Set(payload.calendarIds ?? []);
        // Never let the primary calendar's own linkage be touched through
        // this picker, even if a stale client somehow sent its id.
        desiredIds.delete(primaryExternalId ?? "");

        const { data, error: existingError } = await admin
            .from("calendars")
            .select("id, external_calendar_id")
            .eq("user_id", userId)
            .eq("is_primary", false)
            .not("external_calendar_id", "is", null);
        if (existingError) throw new Error(existingError.message);
        const existingRows = (data ?? []) as {
            id: string;
            external_calendar_id: string;
        }[];

        const existingIds = new Set(
            existingRows.map((row) => row.external_calendar_id),
        );
        const toAdd = [...desiredIds].filter((id) => !existingIds.has(id));
        const toRemove = existingRows.filter(
            (row) => !desiredIds.has(row.external_calendar_id),
        );

        if (toRemove.length > 0) {
            const { error: removeError } = await admin
                .from("calendars")
                .delete()
                .in(
                    "id",
                    toRemove.map((row) => row.id),
                );
            if (removeError) throw new Error(removeError.message);
        }

        if (toAdd.length > 0) {
            const googleCalendars = await listAllCalendars(accessToken);
            const byId = new Map(
                googleCalendars.map((calendar) => [calendar.id, calendar]),
            );
            const rows = toAdd
                .map((id) => byId.get(id))
                .filter((calendar): calendar is NonNullable<typeof calendar> =>
                    Boolean(calendar),
                )
                .map((calendar) => ({
                    user_id: userId,
                    name: calendar.summary,
                    is_primary: false,
                    external_calendar_id: calendar.id,
                    // Every event on this calendar falls back to its color
                    // unless it carries one of its own.
                    color: calendar.backgroundColor ?? null,
                    is_writable:
                        calendar.accessRole === "owner" ||
                        calendar.accessRole === "writer",
                }));
            if (rows.length > 0) {
                const { error: addError } = await admin
                    .from("calendars")
                    .insert(rows);
                if (addError) throw new Error(addError.message);
            }
        }

        return json(cors, { added: toAdd.length, removed: toRemove.length });
    } catch (error) {
        console.error("google-calendar-selection failed:", error);
        return json(cors, { error: "Couldn't update synced calendars" }, 500);
    }
});
