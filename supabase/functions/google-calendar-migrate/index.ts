import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { resolveUserId } from "../_shared/auth.ts";
import {
    createCalendar,
    ensureFreshAccessToken,
    listWritableCalendars,
} from "../_shared/google.ts";
import { corsHeaders } from "../_shared/cors.ts";

/** Phase 3: what happens to events a user already created locally, at the
 *  moment they first connect Google Calendar. Runs once, on demand from
 *  the Settings UI -- never as part of the ongoing sync.
 *
 *  Two actions:
 *    "list"    -> the Google calendars they could migrate into
 *    "migrate" -> perform the choice they made:
 *        newCalendar      create a Google calendar, link Coria's to it
 *        existingCalendar link Coria's calendar to one they already have
 *        delete           tombstone the local-only events, link nothing
 *
 *  The first two both end with the local calendar carrying an
 *  external_calendar_id and its events marked dirty, which is all Phase
 *  4's push needs to mirror them upward on the next sync -- this function
 *  never talks to Google about individual events itself. */

Deno.serve(async (req) => {
    const cors = corsHeaders(req);
    function json(body: unknown, status = 200): Response {
        return new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json" },
        });
    }

    if (req.method === "OPTIONS") {
        return new Response(null, { headers: cors });
    }

    const userId = await resolveUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    let payload: { action?: string; option?: string; calendarId?: string };
    try {
        payload = await req.json();
    } catch {
        return json({ error: "Invalid request body" }, 400);
    }

    const admin = createAdminClient();
    const { data: connection } = await admin
        .from("calendar_connections")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
    if (!connection) {
        return json({ error: "No Google connection for this user" }, 404);
    }

    try {
        const accessToken = await ensureFreshAccessToken(
            admin,
            connection.id,
        );

        if (payload.action === "list") {
            const calendars = await listWritableCalendars(accessToken);
            return json({
                calendars: calendars.map((calendar) => ({
                    id: calendar.id,
                    summary: calendar.summary,
                    primary: calendar.primary ?? false,
                })),
            });
        }

        if (payload.action !== "migrate") {
            return json({ error: "Unknown action" }, 400);
        }

        // Coria's own calendar to migrate. There's no calendar-management
        // UI yet, so this is always the primary one auto-created at signup
        // (READY-01).
        const { data: localCalendar } = await admin
            .from("calendars")
            .select("id, name")
            .eq("user_id", userId)
            .eq("is_primary", true)
            .maybeSingle();
        if (!localCalendar) {
            return json({ error: "No local calendar found" }, 404);
        }

        if (payload.option === "delete") {
            // Soft delete, same as removeEvent does -- but these events
            // were never on Google, so there's no deletion to push and
            // they're left un-dirty rather than queued for a push.
            const { error } = await admin
                .from("calendar_events")
                .update({ deleted_at: new Date().toISOString() })
                .eq("calendar_id", localCalendar.id)
                .is("deleted_at", null);
            if (error) throw new Error(error.message);
            return json({ migrated: 0, deleted: true });
        }

        let externalCalendarId: string;
        if (payload.option === "newCalendar") {
            const { data: preferences } = await admin
                .from("user_preferences")
                .select("time_zone")
                .eq("user_id", userId)
                .maybeSingle();
            const created = await createCalendar(
                accessToken,
                localCalendar.name,
                preferences?.time_zone ?? "UTC",
            );
            externalCalendarId = created.id;
        } else if (payload.option === "existingCalendar") {
            if (!payload.calendarId) {
                return json({ error: "Missing calendarId" }, 400);
            }
            externalCalendarId = payload.calendarId;
        } else {
            return json({ error: "Unknown option" }, 400);
        }

        const { error: linkError } = await admin
            .from("calendars")
            .update({ external_calendar_id: externalCalendarId })
            .eq("id", localCalendar.id);
        if (linkError) throw new Error(linkError.message);

        // Marking them dirty is the whole hand-off to Phase 4: the next
        // sync sees rows with no external_id and inserts them into the now-
        // linked Google calendar. Only events that never came *from* a
        // provider are touched, so this can't disturb anything already
        // mirrored.
        const { data: marked, error: markError } = await admin
            .from("calendar_events")
            .update({ dirty: true })
            .eq("calendar_id", localCalendar.id)
            .eq("source", "local")
            .is("deleted_at", null)
            .select("id");
        if (markError) throw new Error(markError.message);

        return json({
            migrated: marked?.length ?? 0,
            externalCalendarId,
        });
    } catch (error) {
        console.error("google-calendar-migrate failed:", error);
        return json({ error: "Migration failed" }, 500);
    }
});
