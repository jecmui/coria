import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
    DEFAULT_CALENDAR_SETTINGS,
    useCalendarStore,
} from "../../store/calendarStore";
import type { CalendarSettings } from "../../types/calendar";
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

    useEffect(() => {
        if (calendarLoading || calendarSynced) return;
        const form = storeCalendarSettings ?? DEFAULT_CALENDAR_SETTINGS;
        setCalendarForm(form);
        setSavedCalendarForm(form);
        setCalendarSynced(true);
    }, [calendarLoading, calendarSynced, storeCalendarSettings]);

    const isCalendarDirty =
        JSON.stringify(calendarForm) !== JSON.stringify(savedCalendarForm);

    function discard() {
        setCalendarForm(savedCalendarForm);
        setCalendarError(null);
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
        </div>
    );
});
