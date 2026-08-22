import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { resolveUserId } from "../_shared/auth.ts";
import {
    SyncTokenExpiredError,
    deleteEvent,
    ensureFreshAccessToken,
    insertEvent,
    listAllCalendars,
    listEventColors,
    listEventsPage,
    moveEvent,
    updateEvent,
} from "../_shared/google.ts";
import {
    FALLBACK_EVENT_PALETTE,
    type EventPalette,
} from "../_shared/colors.ts";
import {
    buildGoogleEventBody,
    buildInstanceId,
    mapGoogleEvent,
    type MappedGoogleEvent,
} from "../_shared/eventMapping.ts";
import { corsHeaders } from "../_shared/cors.ts";

/** Phase 4: the two-way sync loop. Pull first, then push, per linked
 *  calendar -- so a remote change lands (and conflicts are settled) before
 *  local changes go out, and a row that loses a conflict isn't pushed on
 *  top of the version that just won.
 *
 *  Polling, not webhooks: READY-08 settled on the client asking for a sync
 *  rather than Google pushing notifications, so this is an ordinary
 *  request-scoped function with no channel registration or renewal. */

/** READY-03's conflict policy, applied at the one place it matters. Kept
 *  as its own two lines rather than imported from src/lib/calendar.ts's
 *  resolveEventConflict: that module is browser code that pulls in rrule
 *  and the whole calendar layout library, none of which belongs in an Edge
 *  Function. The rule itself must stay identical in both places -- last
 *  write wins, ties go to local. */
function localWins(localUpdatedAt: string, remoteUpdated: string): boolean {
    return new Date(localUpdatedAt) >= new Date(remoteUpdated);
}

interface LocalCalendar {
    id: string;
    external_calendar_id: string;
    sync_token: string | null;
    /** The calendar's color as Google last reported it -- events on it fall
     *  back to this when they carry no color of their own. */
    color: string | null;
    /** Whether Coria can actually write to the linked Google calendar --
     *  false for one added read-only through the "manage synced calendars"
     *  picker. Pulling still happens regardless; pushing is skipped
     *  entirely for these, since Google would just reject it and the UI
     *  already refuses to let a read-only calendar's events be edited in
     *  the first place -- this is the defense-in-depth backstop, not the
     *  primary guard. */
    is_writable: boolean;
}

interface LocalEventRow {
    id: string;
    external_id: string | null;
    updated_at: string;
    dirty: boolean;
    deleted_at: string | null;
    all_day: boolean;
}

/** Google can answer with an event whose end is not strictly after its
 *  start (a malformed entry, or the stub form a cancellation arrives in).
 *  Both calendar_events and calendar_event_exceptions carry a database
 *  check requiring ends_at > starts_at, so such a row would fail the write
 *  outright -- skipping it keeps one bad event from failing the sync. */
function hasUsableTimes(event: MappedGoogleEvent): boolean {
    return new Date(event.endsAt) > new Date(event.startsAt);
}

async function fetchRemoteEvents(
    accessToken: string,
    calendar: LocalCalendar,
): Promise<{ items: Record<string, unknown>[]; syncToken: string | null }> {
    const collect = async (syncToken: string | null) => {
        const items: Record<string, unknown>[] = [];
        let pageToken: string | undefined;
        let nextSyncToken: string | null = null;
        do {
            const page = await listEventsPage(
                accessToken,
                calendar.external_calendar_id,
                { syncToken, pageToken },
            );
            items.push(...page.items);
            pageToken = page.nextPageToken;
            nextSyncToken = page.nextSyncToken ?? nextSyncToken;
        } while (pageToken);
        return { items, syncToken: nextSyncToken };
    };

    try {
        return await collect(calendar.sync_token);
    } catch (error) {
        if (!(error instanceof SyncTokenExpiredError)) throw error;
        // Google expires sync tokens that fall too far behind. The
        // documented recovery is to forget it and list the calendar in
        // full, which re-establishes a fresh token.
        console.warn(
            "Sync token expired, falling back to full sync:",
            calendar.external_calendar_id,
        );
        return await collect(null);
    }
}

async function applyRemoteMaster(
    admin: SupabaseClient,
    userId: string,
    calendar: LocalCalendar,
    remote: MappedGoogleEvent,
): Promise<void> {
    const { data: existing } = (await admin
        .from("calendar_events")
        .select("id, external_id, updated_at, dirty, deleted_at, all_day")
        .eq("calendar_id", calendar.id)
        .eq("external_id", remote.externalId)
        .maybeSingle()) as { data: LocalEventRow | null };

    if (remote.cancelled) {
        if (existing && !existing.deleted_at) {
            // Already gone on Google, so there is nothing left to push --
            // the tombstone is recorded and the row leaves the dirty queue.
            await admin
                .from("calendar_events")
                .update({
                    deleted_at: new Date().toISOString(),
                    dirty: false,
                })
                .eq("id", existing.id);
        }
        return;
    }

    if (!hasUsableTimes(remote)) {
        console.warn("Skipping remote event with unusable times:", remote.externalId);
        return;
    }

    const fields = {
        title: remote.title,
        description: remote.description,
        location: remote.location,
        starts_at: remote.startsAt,
        ends_at: remote.endsAt,
        all_day: remote.allDay,
        color: remote.color,
        recurrence_rule: remote.recurrenceRule,
        event_time_zone: remote.eventTimeZone,
        external_raw: remote.externalRaw,
        source: "google",
        synced_calendar_external_id: calendar.external_calendar_id,
    };

    if (!existing) {
        await admin.from("calendar_events").insert({
            ...fields,
            user_id: userId,
            calendar_id: calendar.id,
            external_id: remote.externalId,
            dirty: false,
        });
        return;
    }

    // The only case where a remote change is deliberately discarded: this
    // row has unpushed local edits *and* wins the last-write-wins
    // comparison. The push below then sends the local version on to
    // Google, which is what makes it the winner in fact and not just in
    // principle.
    if (existing.dirty && localWins(existing.updated_at, remote.updated)) {
        return;
    }

    await admin
        .from("calendar_events")
        .update({ ...fields, deleted_at: null, dirty: false })
        .eq("id", existing.id);
}

async function applyRemoteException(
    admin: SupabaseClient,
    userId: string,
    calendar: LocalCalendar,
    remote: MappedGoogleEvent,
): Promise<void> {
    if (!remote.recurringEventId || !remote.originalStartTime) return;

    const { data: master } = (await admin
        .from("calendar_events")
        .select("id")
        .eq("calendar_id", calendar.id)
        .eq("external_id", remote.recurringEventId)
        .maybeSingle()) as { data: { id: string } | null };
    if (!master) {
        // The series itself isn't in Coria (its own master may have been
        // filtered out, or arrive on a later incremental sync). An
        // exception with nothing to attach to is meaningless, so it's
        // dropped rather than orphaned.
        return;
    }

    const base = {
        user_id: userId,
        master_event_id: master.id,
        original_start_time: remote.originalStartTime,
        external_id: remote.externalId,
        external_raw: remote.externalRaw,
        dirty: false,
    };

    if (remote.cancelled) {
        // A cancelled occurrence of a still-live series: exactly what
        // is_cancelled models (READY-04), not a tombstone on the series.
        await admin.from("calendar_event_exceptions").upsert(
            {
                ...base,
                is_cancelled: true,
                title: null,
                description: null,
                location: null,
                starts_at: null,
                ends_at: null,
                all_day: null,
            },
            { onConflict: "master_event_id,original_start_time" },
        );
        return;
    }

    if (!hasUsableTimes(remote)) {
        console.warn(
            "Skipping remote exception with unusable times:",
            remote.externalId,
        );
        return;
    }

    await admin.from("calendar_event_exceptions").upsert(
        {
            ...base,
            is_cancelled: false,
            title: remote.title,
            description: remote.description,
            location: remote.location,
            starts_at: remote.startsAt,
            ends_at: remote.endsAt,
            all_day: remote.allDay,
        },
        { onConflict: "master_event_id,original_start_time" },
    );
}

async function pullCalendar(
    admin: SupabaseClient,
    accessToken: string,
    userId: string,
    calendar: LocalCalendar,
    palette: EventPalette,
): Promise<number> {
    const { items, syncToken } = await fetchRemoteEvents(
        accessToken,
        calendar,
    );
    const mapped = items.map((item) => mapGoogleEvent(item, palette));

    // Masters before exceptions, so a series and an override of it
    // arriving in the same batch are applied in an order where the
    // exception can actually find its master row.
    for (const remote of mapped.filter((item) => !item.recurringEventId)) {
        await applyRemoteMaster(admin, userId, calendar, remote);
    }
    for (const remote of mapped.filter((item) => item.recurringEventId)) {
        await applyRemoteException(admin, userId, calendar, remote);
    }

    if (syncToken) {
        await admin
            .from("calendars")
            .update({ sync_token: syncToken })
            .eq("id", calendar.id);
    }
    return mapped.length;
}

async function pushCalendar(
    admin: SupabaseClient,
    accessToken: string,
    calendar: LocalCalendar,
    timeZone: string,
    /** Null unless the user turned colour push-back on -- see
     *  user_preferences.sync_event_colors. */
    palette: EventPalette | null,
): Promise<number> {
    const { data: rows } = await admin
        .from("calendar_events")
        .select(
            "id, external_id, deleted_at, title, description, location, starts_at, ends_at, all_day, color, recurrence_rule, event_time_zone, external_raw, synced_calendar_external_id",
        )
        .eq("calendar_id", calendar.id)
        .eq("dirty", true);

    let pushed = 0;
    for (const row of rows ?? []) {
        if (row.deleted_at) {
            if (row.external_id) {
                await deleteEvent(
                    accessToken,
                    calendar.external_calendar_id,
                    row.external_id,
                );
            }
            // The tombstone stays -- only its place in the dirty queue is
            // given up, since the deletion it represented is now done.
            await admin
                .from("calendar_events")
                .update({ dirty: false })
                .eq("id", row.id);
            pushed += 1;
            continue;
        }

        const body = buildGoogleEventBody(row, timeZone, palette);
        if (row.external_id) {
            // The event was moved to a different calendar in Coria. Google
            // keys an event id to the calendar holding it, so it has to be
            // relocated before anything can be written to it here -- an
            // update aimed at the destination would 404.
            const movedFrom = row.synced_calendar_external_id;
            if (movedFrom && movedFrom !== calendar.external_calendar_id) {
                await moveEvent(
                    accessToken,
                    movedFrom,
                    row.external_id,
                    calendar.external_calendar_id,
                );
            }
            const updated = await updateEvent(
                accessToken,
                calendar.external_calendar_id,
                row.external_id,
                body,
            );
            await admin
                .from("calendar_events")
                .update({
                    external_raw: updated,
                    dirty: false,
                    synced_calendar_external_id:
                        calendar.external_calendar_id,
                })
                .eq("id", row.id);
        } else {
            const created = await insertEvent(
                accessToken,
                calendar.external_calendar_id,
                body,
            );
            await admin
                .from("calendar_events")
                .update({
                    external_id: String(created.id),
                    external_raw: created,
                    source: "google",
                    dirty: false,
                    synced_calendar_external_id:
                        calendar.external_calendar_id,
                })
                .eq("id", row.id);
        }
        pushed += 1;
    }

    return pushed + (await pushExceptions(admin, accessToken, calendar, timeZone));
}

async function pushExceptions(
    admin: SupabaseClient,
    accessToken: string,
    calendar: LocalCalendar,
    timeZone: string,
): Promise<number> {
    // Only exceptions whose series lives on this calendar -- the join
    // shape Supabase returns for the embedded master is what limits it.
    const { data: rows } = await admin
        .from("calendar_event_exceptions")
        .select(
            "id, master_event_id, original_start_time, is_cancelled, title, description, location, starts_at, ends_at, all_day, external_raw, " +
                "master:calendar_events!inner(id, external_id, all_day, calendar_id)",
        )
        .eq("dirty", true)
        .eq("master.calendar_id", calendar.id);

    let pushed = 0;
    for (const row of rows ?? []) {
        const master = (
            Array.isArray(row.master) ? row.master[0] : row.master
        ) as { external_id: string | null; all_day: boolean } | undefined;
        // The series hasn't reached Google yet (it was created locally and
        // its own push either failed or runs later in this same pass).
        // Leaving this one dirty means the next sync retries it, by which
        // point the master has an id to hang the instance off.
        if (!master?.external_id) continue;

        const instanceId = buildInstanceId(
            master.external_id,
            row.original_start_time,
            master.all_day,
        );

        if (row.is_cancelled) {
            // Deleting a single instance is how Google represents a
            // cancelled occurrence -- the series itself is untouched.
            await deleteEvent(
                accessToken,
                calendar.external_calendar_id,
                instanceId,
            );
            await admin
                .from("calendar_event_exceptions")
                .update({ dirty: false, external_id: instanceId })
                .eq("id", row.id);
            pushed += 1;
            continue;
        }

        const updated = await updateEvent(
            accessToken,
            calendar.external_calendar_id,
            instanceId,
            buildGoogleEventBody(
                {
                    title: row.title ?? "",
                    description: row.description,
                    location: row.location,
                    starts_at: row.starts_at!,
                    ends_at: row.ends_at!,
                    all_day: row.all_day ?? master.all_day,
                    // An occurrence never carries a rule of its own.
                    recurrence_rule: null,
                    // Coria has no per-occurrence color, so there's nothing
                    // to push -- passing a null palette below leaves the
                    // occurrence's own colorId exactly as Google had it,
                    // rather than clearing it to match this null.
                    color: null,
                    event_time_zone: null,
                    external_raw: row.external_raw,
                },
                timeZone,
                null,
            ),
        );
        await admin
            .from("calendar_event_exceptions")
            .update({
                dirty: false,
                external_id: instanceId,
                external_raw: updated,
            })
            .eq("id", row.id);
        pushed += 1;
    }
    return pushed;
}

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

    const admin = createAdminClient();
    const { data: connection } = await admin
        .from("calendar_connections")
        .select("id, sync_enabled")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
    if (!connection) {
        return json({ error: "No Google connection for this user" }, 404);
    }
    if (!connection.sync_enabled) {
        return json({ skipped: "Sync is disabled for this connection" });
    }

    try {
        const accessToken = await ensureFreshAccessToken(admin, connection.id);
        const { data: preferences } = await admin
            .from("user_preferences")
            .select("time_zone, sync_event_colors")
            .eq("user_id", userId)
            .maybeSingle();
        const timeZone = preferences?.time_zone ?? "UTC";

        // Google serves the eleven event colors separately from the events
        // that reference them, so one lookup per sync pass resolves every
        // colorId that turns up below. A failure here isn't worth losing the
        // whole sync over -- the long-stable built-in palette stands in.
        let palette: EventPalette;
        try {
            palette = await listEventColors(accessToken);
        } catch (error) {
            console.warn("Couldn't load Google's color palette:", error);
            palette = FALLBACK_EVENT_PALETTE;
        }
        // Push-back is opt-in: without it, a local color stays local and
        // Google's own colorId is left untouched on every push.
        const pushPalette = preferences?.sync_event_colors ? palette : null;

        // A calendar's own color is Google's to set (Coria offers no picker
        // for it), so it's re-read every pass rather than only when the
        // calendar is first linked -- that way recoloring a calendar in
        // Google shows up here, and calendars linked before colors existed
        // pick one up without needing to be re-added.
        const calendarColors = new Map<string, string>();
        try {
            for (const entry of await listAllCalendars(accessToken)) {
                if (entry.backgroundColor) {
                    calendarColors.set(entry.id, entry.backgroundColor);
                }
            }
        } catch (error) {
            console.warn("Couldn't load Google's calendar colors:", error);
        }

        // Only calendars actually linked to a Google calendar take part --
        // a purely local one has nothing to sync against.
        const { data: calendars } = await admin
            .from("calendars")
            .select("id, external_calendar_id, sync_token, is_writable, color")
            .eq("user_id", userId)
            .not("external_calendar_id", "is", null);

        let pulled = 0;
        let pushed = 0;
        for (const calendar of (calendars ?? []) as LocalCalendar[]) {
            const remoteColor = calendarColors.get(
                calendar.external_calendar_id,
            );
            if (remoteColor && remoteColor !== calendar.color) {
                await admin
                    .from("calendars")
                    .update({ color: remoteColor })
                    .eq("id", calendar.id);
            }
            pulled += await pullCalendar(
                admin,
                accessToken,
                userId,
                calendar,
                palette,
            );
            if (calendar.is_writable) {
                pushed += await pushCalendar(
                    admin,
                    accessToken,
                    calendar,
                    timeZone,
                    pushPalette,
                );
            }
        }

        await admin
            .from("calendar_connections")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("id", connection.id);

        return json({ pulled, pushed });
    } catch (error) {
        console.error("google-calendar-sync failed:", error);
        return json({ error: "Sync failed" }, 500);
    }
});
