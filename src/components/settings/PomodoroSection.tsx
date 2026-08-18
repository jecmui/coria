import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthContext";
import { useBoardStore } from "../../store/boardStore";
import type { PomodoroSettings } from "../../types";
import { inputClass, ToggleSwitch } from "./shared";
import type { SettingsSectionHandle, SettingsSectionProps } from "./types";

interface PomodoroFormState {
    focusMinutes: string;
    shortBreakMinutes: string;
    longBreakMinutes: string;
    longBreakInterval: string;
    autoStartBreaks: boolean;
    autoStartFocus: boolean;
}

type PomodoroNumericField =
    | "focusMinutes"
    | "shortBreakMinutes"
    | "longBreakMinutes"
    | "longBreakInterval";

const POMODORO_NUMERIC_FIELDS: PomodoroNumericField[] = [
    "focusMinutes",
    "shortBreakMinutes",
    "longBreakMinutes",
    "longBreakInterval",
];

function settingsToForm(settings: PomodoroSettings): PomodoroFormState {
    return {
        focusMinutes: String(Math.round(settings.focusSeconds / 60)),
        shortBreakMinutes: String(Math.round(settings.shortBreakSeconds / 60)),
        longBreakMinutes: String(Math.round(settings.longBreakSeconds / 60)),
        longBreakInterval: String(settings.longBreakInterval),
        autoStartBreaks: settings.autoStartBreaks,
        autoStartFocus: settings.autoStartFocus,
    };
}

function formToSettings(form: PomodoroFormState): PomodoroSettings {
    return {
        focusSeconds: Number(form.focusMinutes) * 60,
        shortBreakSeconds: Number(form.shortBreakMinutes) * 60,
        longBreakSeconds: Number(form.longBreakMinutes) * 60,
        longBreakInterval: Number(form.longBreakInterval),
        autoStartBreaks: form.autoStartBreaks,
        autoStartFocus: form.autoStartFocus,
    };
}

function getPomodoroFieldError(value: string): string | null {
    if (!/^[0-9]+$/.test(value)) {
        return "Enter a positive whole number greater than 0.";
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return "Enter a positive whole number greater than 0.";
    }

    return null;
}

function normalizePomodoroForm(form: PomodoroFormState): PomodoroFormState {
    return {
        ...form,
        focusMinutes: String(Number(form.focusMinutes)),
        shortBreakMinutes: String(Number(form.shortBreakMinutes)),
        longBreakMinutes: String(Number(form.longBreakMinutes)),
        longBreakInterval: String(Number(form.longBreakInterval)),
    };
}

export const PomodoroSection = forwardRef<
    SettingsSectionHandle,
    SettingsSectionProps
>(function PomodoroSection({ onStatusChange }, ref) {
    const { user } = useAuth();
    const storePomodoroSettings = useBoardStore((s) => s.pomodoroSettings);
    const pomodoroLoading = useBoardStore((s) => s.pomodoroLoading);
    const pomodoroLoadError = useBoardStore((s) => s.pomodoroError);
    const setStorePomodoroSettings = useBoardStore(
        (s) => s.setPomodoroSettings,
    );

    const [pomodoroForm, setPomodoroForm] = useState<PomodoroFormState>(() =>
        settingsToForm(storePomodoroSettings),
    );
    const [savedPomodoroForm, setSavedPomodoroForm] =
        useState<PomodoroFormState>(() =>
            settingsToForm(storePomodoroSettings),
        );
    const [pomodoroSynced, setPomodoroSynced] = useState(false);
    const [pomodoroError, setPomodoroError] = useState<string | null>(null);
    const [pomodoroSuccess, setPomodoroSuccess] = useState<string | null>(
        null,
    );
    const [pomodoroSaving, setPomodoroSaving] = useState(false);

    // Sync the editable form from the store once its initial load (kicked off
    // at login) resolves, without clobbering in-progress edits.
    useEffect(() => {
        if (pomodoroLoading || pomodoroSynced) return;
        const form = settingsToForm(storePomodoroSettings);
        setPomodoroForm(form);
        setSavedPomodoroForm(form);
        setPomodoroSynced(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pomodoroLoading, pomodoroSynced]);

    function updatePomodoroField<K extends keyof PomodoroFormState>(
        key: K,
        value: PomodoroFormState[K],
    ) {
        if (POMODORO_NUMERIC_FIELDS.includes(key as PomodoroNumericField)) {
            const numericValue = String(value).replace(/\D/g, "").slice(0, 3);
            setPomodoroForm((f) => ({ ...f, [key]: numericValue }));
            return;
        }

        setPomodoroForm((f) => ({ ...f, [key]: value }));
    }

    const pomodoroFieldErrors = {
        focusMinutes: getPomodoroFieldError(pomodoroForm.focusMinutes),
        shortBreakMinutes: getPomodoroFieldError(
            pomodoroForm.shortBreakMinutes,
        ),
        longBreakMinutes: getPomodoroFieldError(pomodoroForm.longBreakMinutes),
        longBreakInterval: getPomodoroFieldError(
            pomodoroForm.longBreakInterval,
        ),
    } satisfies Record<PomodoroNumericField, string | null>;
    const isPomodoroValid = POMODORO_NUMERIC_FIELDS.every(
        (field) => !pomodoroFieldErrors[field],
    );

    const isPomodoroDirty =
        JSON.stringify(pomodoroForm) !== JSON.stringify(savedPomodoroForm);

    function discard() {
        setPomodoroForm(savedPomodoroForm);
        setPomodoroError(null);
    }

    async function handleSavePomodoro() {
        if (!user) {
            setPomodoroError("You must be signed in to update settings.");
            return;
        }

        if (!isPomodoroValid) {
            setPomodoroError(
                "All Pomodoro values must be positive whole numbers greater than 0.",
            );
            return;
        }

        setPomodoroError(null);
        setPomodoroSuccess(null);
        setPomodoroSaving(true);

        const normalizedForm = normalizePomodoroForm(pomodoroForm);
        const settings = formToSettings(normalizedForm);
        const { error } = await supabase
            .from("user_preferences")
            .update({
                focus_seconds: settings.focusSeconds,
                short_break_seconds: settings.shortBreakSeconds,
                long_break_seconds: settings.longBreakSeconds,
                long_break_interval: settings.longBreakInterval,
                auto_start_breaks: settings.autoStartBreaks,
                auto_start_focus: settings.autoStartFocus,
            })
            .eq("user_id", user.id);

        if (error) {
            setPomodoroError(error.message);
            setPomodoroSaving(false);
            return;
        }

        setPomodoroForm(normalizedForm);
        setStorePomodoroSettings(settings);
        setSavedPomodoroForm(normalizedForm);
        setPomodoroSuccess("Pomodoro settings saved.");
        window.setTimeout(() => setPomodoroSuccess(null), 4000);
        setPomodoroSaving(false);
    }

    useImperativeHandle(ref, () => ({
        save: () => void handleSavePomodoro(),
        discard,
    }));

    useEffect(() => {
        onStatusChange({
            dirty: isPomodoroDirty,
            canSave: isPomodoroDirty && !pomodoroSaving && isPomodoroValid,
            saving: pomodoroSaving,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPomodoroDirty, pomodoroSaving, isPomodoroValid]);

    return (
        <div className="space-y-5">
            <div>
                <h2 className="font-body text-lg font-semibold text-ink">
                    Pomodoro
                </h2>
                <p className="mt-1 font-body text-sm text-ink-soft">
                    Tune the timer behavior to match your flow.
                </p>
            </div>

            {pomodoroLoadError && (
                <p className="text-xs text-pin-timer">
                    Couldn't load your saved Pomodoro settings, showing
                    defaults instead.
                </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Focus Time
                    </span>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        maxLength={3}
                        value={pomodoroForm.focusMinutes}
                        onChange={(event) =>
                            updatePomodoroField(
                                "focusMinutes",
                                event.target.value,
                            )
                        }
                        className={inputClass}
                    />
                    {pomodoroFieldErrors.focusMinutes && (
                        <p className="text-xs text-pin-timer">
                            {pomodoroFieldErrors.focusMinutes}
                        </p>
                    )}
                </label>

                <label className="block space-y-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Short Break Time
                    </span>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        maxLength={3}
                        value={pomodoroForm.shortBreakMinutes}
                        onChange={(event) =>
                            updatePomodoroField(
                                "shortBreakMinutes",
                                event.target.value,
                            )
                        }
                        className={inputClass}
                    />
                    {pomodoroFieldErrors.shortBreakMinutes && (
                        <p className="text-xs text-pin-timer">
                            {pomodoroFieldErrors.shortBreakMinutes}
                        </p>
                    )}
                </label>

                <label className="block space-y-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Long Break Time
                    </span>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        maxLength={3}
                        value={pomodoroForm.longBreakMinutes}
                        onChange={(event) =>
                            updatePomodoroField(
                                "longBreakMinutes",
                                event.target.value,
                            )
                        }
                        className={inputClass}
                    />
                    {pomodoroFieldErrors.longBreakMinutes && (
                        <p className="text-xs text-pin-timer">
                            {pomodoroFieldErrors.longBreakMinutes}
                        </p>
                    )}
                </label>

                <label className="block space-y-2">
                    <span className="font-body text-sm font-medium text-ink">
                        Interval for long breaks
                    </span>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        maxLength={3}
                        value={pomodoroForm.longBreakInterval}
                        onChange={(event) =>
                            updatePomodoroField(
                                "longBreakInterval",
                                event.target.value,
                            )
                        }
                        className={inputClass}
                    />
                    {pomodoroFieldErrors.longBreakInterval && (
                        <p className="text-xs text-pin-timer">
                            {pomodoroFieldErrors.longBreakInterval}
                        </p>
                    )}
                </label>
            </div>

            <div className="space-y-3 rounded-2xl border border-paper-edge bg-board/40 p-4">
                <ToggleSwitch
                    checked={pomodoroForm.autoStartBreaks}
                    onChange={(value) =>
                        updatePomodoroField("autoStartBreaks", value)
                    }
                    label="Auto-start breaks"
                />

                <ToggleSwitch
                    checked={pomodoroForm.autoStartFocus}
                    onChange={(value) =>
                        updatePomodoroField("autoStartFocus", value)
                    }
                    label="Auto-start focus"
                />
            </div>

            {pomodoroError && (
                <p className="text-xs text-pin-timer">{pomodoroError}</p>
            )}
            {pomodoroSuccess && (
                <p className="text-xs text-pin-todo">{pomodoroSuccess}</p>
            )}
        </div>
    );
});
