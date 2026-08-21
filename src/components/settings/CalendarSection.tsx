import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import { useAuth } from "../../auth/AuthContext";
import {
    DEFAULT_CALENDAR_SETTINGS,
    useCalendarStore,
} from "../../store/calendarStore";
import type {
    GoogleCalendarOption,
    MigrationOption,
} from "../../store/calendarStore";
import type { CalendarSettings } from "../../types/calendar";
import {
    buildGoogleAuthorizeUrl,
    isGoogleCalendarConfigured,
} from "../../lib/googleAuth";
import { inputClass, TimeZoneSelect } from "./shared";
import type { SettingsSectionHandle, SettingsSectionProps } from "./types";

export const CalendarSection = forwardRef<
    SettingsSectionHandle,
    SettingsSectionProps
>(function CalendarSection({ onStatusChange }, ref) {
    const { user } = useAuth();
    const storeCalendarSettings = useCalendarStore((s) => s.settings);
    const calendarLoading = useCalendarStore((s) => s.settingsLoading);
    const calendarLoadError = useCalendarStore((s) => s.settingsError);
    const saveStoreCalendarSettings = useCalendarStore((s) => s.saveSettings);
    const googleConnection = useCalendarStore((s) => s.googleConnection);
    const googleConnectionLoading = useCalendarStore(
        (s) => s.googleConnectionLoading,
    );
    const loadGoogleConnection = useCalendarStore(
        (s) => s.loadGoogleConnection,
    );
    const startGoogleConnect = useCalendarStore((s) => s.startGoogleConnect);
    const disconnectGoogleConnection = useCalendarStore(
        (s) => s.disconnectGoogleConnection,
    );
    const calendars = useCalendarStore((s) => s.calendars);
    const googleSyncing = useCalendarStore((s) => s.googleSyncing);
    const countMigratableEvents = useCalendarStore(
        (s) => s.countMigratableEvents,
    );
    const listGoogleCalendars = useCalendarStore((s) => s.listGoogleCalendars);
    const migrateLocalEvents = useCalendarStore((s) => s.migrateLocalEvents);
    const syncGoogleCalendar = useCalendarStore((s) => s.syncGoogleCalendar);

    const [calendarForm, setCalendarForm] = useState<CalendarSettings>(
        storeCalendarSettings,
    );
    const [savedCalendarForm, setSavedCalendarForm] =
        useState<CalendarSettings>(storeCalendarSettings);
    const [calendarSynced, setCalendarSynced] = useState(false);
    const [calendarError, setCalendarError] = useState<string | null>(null);
    const [calendarSuccess, setCalendarSuccess] = useState<string | null>(
        null,
    );
    const [calendarSaving, setCalendarSaving] = useState(false);
    const [googleConnecting, setGoogleConnecting] = useState(false);
    const [googleDisconnecting, setGoogleDisconnecting] = useState(false);
    const [googleError, setGoogleError] = useState<string | null>(null);
    const [googleMessage, setGoogleMessage] = useState<string | null>(null);
    // Phase 3 migration prompt. `migrationCount` doubles as the open/closed
    // flag -- it's only ever set once the check below finds local-only
    // events that actually need a decision.
    const [migrationCount, setMigrationCount] = useState<number | null>(null);
    const [migrationOption, setMigrationOption] =
        useState<MigrationOption>("newCalendar");
    const [googleCalendarOptions, setGoogleCalendarOptions] = useState<
        GoogleCalendarOption[]
    >([]);
    const [selectedGoogleCalendar, setSelectedGoogleCalendar] = useState("");
    const [migrating, setMigrating] = useState(false);

    useEffect(() => {
        if (calendarLoading || calendarSynced) return;
        const form = storeCalendarSettings ?? DEFAULT_CALENDAR_SETTINGS;
        setCalendarForm(form);
        setSavedCalendarForm(form);
        setCalendarSynced(true);
    }, [calendarLoading, calendarSynced, storeCalendarSettings]);

    // google-oauth-callback redirects back here with a `google` query param
    // describing how the attempt went -- read it once, show the right
    // message, then scrub it from the URL so refreshing doesn't re-trigger
    // it. (App.tsx is what actually navigates here when this param shows up
    // right after sign-in -- this effect only handles what to do once
    // already on this page.)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const result = params.get("google");
        if (!result) return;
        params.delete("google");
        const nextSearch = params.toString();
        window.history.replaceState(
            null,
            "",
            window.location.pathname + (nextSearch ? `?${nextSearch}` : ""),
        );
        if (result === "connected") {
            setGoogleMessage("Google Calendar connected.");
            if (user) void loadGoogleConnection(user.id);
        } else if (result === "denied") {
            setGoogleError("Google Calendar connection was cancelled.");
        } else {
            setGoogleError("Couldn't connect Google Calendar. Try again.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Phase 3: a connection whose calendar was never linked to a Google one
    // still has the "what about my existing events?" question outstanding.
    // With events to decide about, the prompt below opens; with none, the
    // question is moot, so the calendar is linked straight to the connected
    // account's own primary Google calendar and sync just starts working.
    const primaryCalendar = calendars.find((calendar) => calendar.isPrimary);
    const needsMigration = Boolean(
        googleConnection && primaryCalendar && !primaryCalendar.externalCalendarId,
    );
    const migrationCheckedRef = useRef(false);
    useEffect(() => {
        if (!needsMigration || migrationCheckedRef.current) return;
        migrationCheckedRef.current = true;
        void (async () => {
            const count = await countMigratableEvents();
            if (count > 0) {
                setMigrationCount(count);
                const options = await listGoogleCalendars();
                if (options) {
                    setGoogleCalendarOptions(options);
                    setSelectedGoogleCalendar(
                        options.find((option) => option.primary)?.id ??
                            options[0]?.id ??
                            "",
                    );
                }
                return;
            }
            const primaryGoogleId = googleConnection?.providerAccountId;
            if (primaryGoogleId) {
                await migrateLocalEvents("existingCalendar", primaryGoogleId);
            }
        })();
    }, [
        needsMigration,
        countMigratableEvents,
        listGoogleCalendars,
        migrateLocalEvents,
        googleConnection,
    ]);

    async function handleMigrate() {
        setGoogleError(null);
        setMigrating(true);
        const migrated = await migrateLocalEvents(
            migrationOption,
            migrationOption === "existingCalendar"
                ? selectedGoogleCalendar
                : undefined,
        );
        setMigrating(false);
        if (!migrated) {
            setGoogleError("Couldn't finish setting up the connection.");
            return;
        }
        setMigrationCount(null);
        setGoogleMessage(
            migrationOption === "delete"
                ? "Existing events removed."
                : "Existing events queued to sync with Google.",
        );
    }

    async function handleSyncNow() {
        setGoogleError(null);
        setGoogleMessage(null);
        const synced = await syncGoogleCalendar();
        setGoogleMessage(synced ? "Synced with Google Calendar." : null);
        if (!synced) setGoogleError("Couldn't sync. Try again.");
    }

    const isCalendarDirty =
        JSON.stringify(calendarForm) !== JSON.stringify(savedCalendarForm);

    function discard() {
        setCalendarForm(savedCalendarForm);
        setCalendarError(null);
    }

    async function handleConnectGoogle() {
        setGoogleError(null);
        setGoogleMessage(null);
        if (!isGoogleCalendarConfigured) {
            setGoogleError("Google Calendar isn't configured yet.");
            return;
        }
        setGoogleConnecting(true);
        const state = await startGoogleConnect();
        if (!state) {
            setGoogleError("Couldn't start the Google connection. Try again.");
            setGoogleConnecting(false);
            return;
        }
        window.location.href = buildGoogleAuthorizeUrl(state);
    }

    async function handleDisconnectGoogle() {
        setGoogleError(null);
        setGoogleMessage(null);
        setGoogleDisconnecting(true);
        const disconnected = await disconnectGoogleConnection();
        if (!disconnected) {
            setGoogleError("Couldn't disconnect Google Calendar. Try again.");
            setGoogleDisconnecting(false);
            return;
        }
        setGoogleMessage("Google Calendar disconnected.");
        setGoogleDisconnecting(false);
    }

    async function handleSaveCalendar() {
        if (!user) {
            setCalendarError("You must be signed in to update settings.");
            return;
        }
        setCalendarError(null);
        setCalendarSuccess(null);
        setCalendarSaving(true);
        const saved = await saveStoreCalendarSettings(calendarForm);
        if (!saved) {
            setCalendarError("Couldn't save Calendar settings.");
            setCalendarSaving(false);
            return;
        }
        setSavedCalendarForm(calendarForm);
        setCalendarSuccess("Calendar settings saved.");
        window.setTimeout(() => setCalendarSuccess(null), 4000);
        setCalendarSaving(false);
    }

    useImperativeHandle(ref, () => ({
        save: () => void handleSaveCalendar(),
        discard,
    }));

    useEffect(() => {
        onStatusChange({
            dirty: isCalendarDirty,
            canSave: isCalendarDirty && !calendarSaving,
            saving: calendarSaving,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCalendarDirty, calendarSaving]);

    return (
        <div className="space-y-5">
            <div>
                <h2 className="font-body text-lg font-semibold text-ink">
                    Calendar
                </h2>
                <p className="mt-1 font-body text-sm text-ink-soft">
                    Choose how your calendar displays dates and times.
                </p>
            </div>

            <div className="space-y-2 border-b border-paper-edge pb-5">
                <h3 className="font-body text-sm font-semibold text-ink">
                    Google Calendar
                </h3>
                {googleConnectionLoading ? (
                    <p className="text-xs text-ink-soft">
                        Checking connection…
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-ink-soft">
                            {googleConnection
                                ? `Connected${
                                      googleConnection.providerAccountId
                                          ? ` as ${googleConnection.providerAccountId}`
                                          : ""
                                  }.`
                                : "Connect your Google Calendar to see and manage its events from Coria."}
                        </p>
                        <div className="flex items-center gap-2">
                            {googleConnection ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void handleDisconnectGoogle()
                                        }
                                        disabled={googleDisconnecting}
                                        className="rounded-full border border-paper-edge px-4 py-2 text-sm font-semibold text-ink-soft hover:cursor-pointer hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {googleDisconnecting
                                            ? "Disconnecting…"
                                            : "Disconnect"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleSyncNow()}
                                        disabled={googleSyncing}
                                        className="rounded-full border border-paper-edge px-4 py-2 text-sm font-semibold text-ink-soft hover:cursor-pointer hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {googleSyncing
                                            ? "Syncing…"
                                            : "Sync now"}
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handleConnectGoogle()}
                                    disabled={
                                        googleConnecting ||
                                        !isGoogleCalendarConfigured
                                    }
                                    className="rounded-full bg-pin-todo px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:cursor-pointer hover:bg-pin-todo/90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {googleConnecting
                                        ? "Redirecting…"
                                        : "Connect Google Calendar"}
                                </button>
                            )}
                        </div>
                        {!isGoogleCalendarConfigured && (
                            <p className="text-xs text-ink-soft">
                                Missing VITE_GOOGLE_CLIENT_ID /
                                VITE_GOOGLE_REDIRECT_URI.
                            </p>
                        )}
                    </>
                )}
                {googleError && (
                    <p className="text-xs text-pin-timer">{googleError}</p>
                )}
                {googleMessage && (
                    <p className="text-xs text-pin-todo">{googleMessage}</p>
                )}
            </div>

            {calendarLoadError && (
                <p className="text-xs text-pin-timer">
                    Couldn't load your saved Calendar settings, showing
                    defaults instead.
                </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Preferred week start
                    </span>
                    <select
                        value={calendarForm.weekStart}
                        onChange={(event) =>
                            setCalendarForm({
                                ...calendarForm,
                                weekStart: Number(event.target.value),
                            })
                        }
                        className={inputClass}
                    >
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                    </select>
                </label>

                <label className="block space-y-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Date format
                    </span>
                    <select
                        value={calendarForm.dateFormat}
                        onChange={(event) =>
                            setCalendarForm({
                                ...calendarForm,
                                dateFormat: event.target
                                    .value as CalendarSettings["dateFormat"],
                            })
                        }
                        className={inputClass}
                    >
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                </label>

                <label className="block space-y-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Time format
                    </span>
                    <select
                        value={calendarForm.timeFormat}
                        onChange={(event) =>
                            setCalendarForm({
                                ...calendarForm,
                                timeFormat: event.target
                                    .value as CalendarSettings["timeFormat"],
                            })
                        }
                        className={inputClass}
                    >
                        <option value="12h">12-hour (AM/PM)</option>
                        <option value="24h">24-hour</option>
                    </select>
                </label>

                <label className="block space-y-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Time zone
                    </span>
                    <TimeZoneSelect
                        value={calendarForm.timeZone}
                        onChange={(value) =>
                            setCalendarForm({
                                ...calendarForm,
                                timeZone: value,
                            })
                        }
                    />
                </label>

                <label className="block space-y-2 md:col-span-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Default event duration (minutes)
                    </span>
                    <input
                        type="number"
                        min="15"
                        step="15"
                        value={calendarForm.defaultEventDuration}
                        onChange={(event) =>
                            setCalendarForm({
                                ...calendarForm,
                                defaultEventDuration: Math.max(
                                    15,
                                    Number(event.target.value),
                                ),
                            })
                        }
                        className={inputClass}
                    />
                </label>
            </div>

            {calendarError && (
                <p className="text-xs text-pin-timer">{calendarError}</p>
            )}
            {calendarSuccess && (
                <p className="text-xs text-pin-todo">{calendarSuccess}</p>
            )}

            {migrationCount !== null && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-paper-edge bg-paper p-5 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                        <h2 className="font-display text-lg font-semibold text-ink">
                            You have existing events
                        </h2>
                        <p className="mt-1 font-body text-sm text-ink-soft">
                            {migrationCount === 1
                                ? "1 event was created in Coria before you connected Google Calendar. What should happen to it?"
                                : `${migrationCount} events were created in Coria before you connected Google Calendar. What should happen to them?`}
                        </p>

                        <div className="mt-4 space-y-2">
                            {(
                                [
                                    [
                                        "newCalendar",
                                        "Create a new Google calendar",
                                        "Adds a calendar to your Google account and syncs these events into it.",
                                    ],
                                    [
                                        "existingCalendar",
                                        "Add them to an existing calendar",
                                        "Syncs these events into a Google calendar you already have.",
                                    ],
                                    [
                                        "delete",
                                        "Delete them",
                                        "Removes these events from Coria. Nothing is added to Google.",
                                    ],
                                ] as const
                            ).map(([value, label, description]) => (
                                <label
                                    key={value}
                                    className={`flex cursor-pointer gap-2 rounded-xl border p-3 ${
                                        migrationOption === value
                                            ? "border-pin-todo bg-pin-todo/10"
                                            : "border-paper-edge hover:bg-black/5"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="migration-option"
                                        checked={migrationOption === value}
                                        onChange={() =>
                                            setMigrationOption(value)
                                        }
                                        className="mt-0.5 accent-pin-todo"
                                    />
                                    <span>
                                        <span className="block font-body text-sm font-medium text-ink">
                                            {label}
                                        </span>
                                        <span className="block font-body text-xs text-ink-soft">
                                            {description}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>

                        {migrationOption === "existingCalendar" && (
                            <label className="mt-3 block space-y-2">
                                <span className="font-body text-sm font-medium text-ink">
                                    Google calendar
                                </span>
                                <select
                                    value={selectedGoogleCalendar}
                                    onChange={(event) =>
                                        setSelectedGoogleCalendar(
                                            event.target.value,
                                        )
                                    }
                                    className={inputClass}
                                >
                                    {googleCalendarOptions.map((option) => (
                                        <option
                                            key={option.id}
                                            value={option.id}
                                        >
                                            {option.summary}
                                            {option.primary ? " (primary)" : ""}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <div className="mt-5 flex justify-end">
                            <button
                                type="button"
                                onClick={() => void handleMigrate()}
                                disabled={
                                    migrating ||
                                    (migrationOption === "existingCalendar" &&
                                        !selectedGoogleCalendar)
                                }
                                className="rounded-full bg-pin-todo px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:cursor-pointer hover:bg-pin-todo/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {migrating ? "Working…" : "Continue"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});
