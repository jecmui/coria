import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useAppearanceStore } from "../../store/appearanceStore";
import {
    colorsEqual,
    DARK_COLORS,
    DEFAULT_APPEARANCE,
    LIGHT_COLORS,
    usePrefersDark,
} from "../../lib/appearance";
import type { AppearanceColors, AppearanceSettings, ThemeMode } from "../../types";
import {
    AppearancePreview,
    ColorCategoryCard,
    ColorField,
    inputClass,
} from "./shared";
import type { SettingsSectionHandle, SettingsSectionProps } from "./types";

const CANVAS_FIELDS: (keyof AppearanceColors)[] = ["board", "boardLine"];
const WIDGET_FIELDS: (keyof AppearanceColors)[] = ["paper", "paperEdge"];
const ACCENT_FIELDS: (keyof AppearanceColors)[] = [
    "pinTodo",
    "pinNote",
    "pinTimer",
    "pinImage",
    "pinCalendar",
];

export const AppearanceSection = forwardRef<
    SettingsSectionHandle,
    SettingsSectionProps
>(function AppearanceSection({ onStatusChange }, ref) {
    const { user } = useAuth();
    const storeAppearanceSettings = useAppearanceStore((s) => s.settings);
    const appearanceLoading = useAppearanceStore((s) => s.settingsLoading);
    const appearanceLoadError = useAppearanceStore((s) => s.settingsError);
    const saveStoreAppearanceSettings = useAppearanceStore(
        (s) => s.saveSettings,
    );
    const prefersDark = usePrefersDark();

    const [appearanceForm, setAppearanceForm] =
        useState<AppearanceSettings>(() => storeAppearanceSettings);
    const [savedAppearanceForm, setSavedAppearanceForm] =
        useState<AppearanceSettings>(() => storeAppearanceSettings);
    const [appearanceSynced, setAppearanceSynced] = useState(false);
    const [appearanceError, setAppearanceError] = useState<string | null>(
        null,
    );
    const [appearanceSuccess, setAppearanceSuccess] = useState<
        string | null
    >(null);
    const [appearanceSaving, setAppearanceSaving] = useState(false);

    // Sync the editable form from the store once its initial load (kicked off
    // at login) resolves, without clobbering in-progress edits.
    useEffect(() => {
        if (appearanceLoading || appearanceSynced) return;
        const form = storeAppearanceSettings ?? DEFAULT_APPEARANCE;
        setAppearanceForm(form);
        setSavedAppearanceForm(form);
        setAppearanceSynced(true);
    }, [appearanceLoading, appearanceSynced, storeAppearanceSettings]);

    function updateAppearanceColor(
        field: keyof AppearanceColors,
        value: string,
    ) {
        setAppearanceForm((f) => ({
            ...f,
            theme: "custom",
            colors: { ...f.colors, [field]: value },
        }));
    }

    function handleThemeChange(theme: ThemeMode) {
        if (theme === "custom") {
            // Switching to Custom on its own shouldn't change any colors.
            setAppearanceForm((f) => ({ ...f, theme: "custom" }));
            return;
        }
        const colors =
            theme === "dark"
                ? DARK_COLORS
                : theme === "system"
                  ? prefersDark
                      ? DARK_COLORS
                      : LIGHT_COLORS
                  : LIGHT_COLORS;
        setAppearanceForm((f) => ({ ...f, theme, colors }));
    }

    function resetAppearanceCategory(fields: (keyof AppearanceColors)[]) {
        setAppearanceForm((f) => {
            const colors = { ...f.colors };
            fields.forEach((field) => {
                colors[field] = LIGHT_COLORS[field];
            });
            return { ...f, theme: "custom", colors };
        });
    }

    function handleResetAllAppearance() {
        setAppearanceForm((f) => ({
            ...f,
            theme: "system",
            colors: LIGHT_COLORS,
        }));
        setAppearanceError(null);
    }

    function categoryAtDefaults(fields: (keyof AppearanceColors)[]) {
        return fields.every(
            (field) => appearanceForm.colors[field] === LIGHT_COLORS[field],
        );
    }

    const isAppearanceAtDefaults =
        appearanceForm.theme === "system" &&
        colorsEqual(appearanceForm.colors, LIGHT_COLORS);

    const isAppearanceDirty =
        JSON.stringify(appearanceForm) !== JSON.stringify(savedAppearanceForm);

    function discard() {
        setAppearanceForm(savedAppearanceForm);
        setAppearanceError(null);
    }

    async function handleSaveAppearance() {
        if (!user) {
            setAppearanceError("You must be signed in to update settings.");
            return;
        }
        setAppearanceError(null);
        setAppearanceSuccess(null);
        setAppearanceSaving(true);
        const saved = await saveStoreAppearanceSettings(appearanceForm);
        if (!saved) {
            setAppearanceError("Couldn't save Appearance settings.");
            setAppearanceSaving(false);
            return;
        }
        setSavedAppearanceForm(appearanceForm);
        setAppearanceSuccess("Appearance settings saved.");
        window.setTimeout(() => setAppearanceSuccess(null), 4000);
        setAppearanceSaving(false);
    }

    useImperativeHandle(ref, () => ({
        save: () => void handleSaveAppearance(),
        discard,
    }));

    useEffect(() => {
        onStatusChange({
            dirty: isAppearanceDirty,
            canSave: isAppearanceDirty && !appearanceSaving,
            saving: appearanceSaving,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAppearanceDirty, appearanceSaving]);

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-body text-lg font-semibold text-ink">
                        Appearance
                    </h2>
                    <p className="mt-1 font-body text-sm text-ink-soft">
                        Customize the board, widgets, and accent colors.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleResetAllAppearance}
                    disabled={isAppearanceAtDefaults}
                    className="shrink-0 rounded-full border border-paper-edge bg-paper px-4 py-2 font-body text-sm font-semibold text-ink transition hover:cursor-pointer hover:bg-paper/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Reset all to defaults
                </button>
            </div>

            {appearanceLoadError && (
                <p className="text-xs text-pin-timer">
                    Couldn't load your saved Appearance settings, showing
                    defaults instead.
                </p>
            )}

            <label className="block max-w-xs space-y-2">
                <span className="font-body text-sm font-medium text-ink">
                    Theme
                </span>
                <select
                    value={appearanceForm.theme}
                    onChange={(event) =>
                        handleThemeChange(event.target.value as ThemeMode)
                    }
                    className={inputClass}
                >
                    <option value="light">Light Mode</option>
                    <option value="dark">Dark Mode</option>
                    <option value="system">System Default</option>
                    <option value="custom">Custom</option>
                </select>
            </label>

            <AppearancePreview colors={appearanceForm.colors} />

            <ColorCategoryCard
                title="Canvas"
                description="The bulletin board backdrop."
                resetDisabled={categoryAtDefaults(CANVAS_FIELDS)}
                onReset={() => resetAppearanceCategory(CANVAS_FIELDS)}
            >
                <ColorField
                    label="Board"
                    value={appearanceForm.colors.board}
                    onChange={(value) => updateAppearanceColor("board", value)}
                />
                <ColorField
                    label="Board dot pattern"
                    value={appearanceForm.colors.boardLine}
                    onChange={(value) =>
                        updateAppearanceColor("boardLine", value)
                    }
                />
            </ColorCategoryCard>

            <ColorCategoryCard
                title="Widgets"
                description="The paper card background shared by every widget."
                resetDisabled={categoryAtDefaults(WIDGET_FIELDS)}
                onReset={() => resetAppearanceCategory(WIDGET_FIELDS)}
            >
                <ColorField
                    label="Paper"
                    value={appearanceForm.colors.paper}
                    onChange={(value) => updateAppearanceColor("paper", value)}
                />
                <ColorField
                    label="Paper edge"
                    value={appearanceForm.colors.paperEdge}
                    onChange={(value) =>
                        updateAppearanceColor("paperEdge", value)
                    }
                />
            </ColorCategoryCard>

            <ColorCategoryCard
                title="Accents"
                description="The pin color for each widget type."
                resetDisabled={categoryAtDefaults(ACCENT_FIELDS)}
                onReset={() => resetAppearanceCategory(ACCENT_FIELDS)}
            >
                <ColorField
                    label="Today"
                    value={appearanceForm.colors.pinTodo}
                    onChange={(value) =>
                        updateAppearanceColor("pinTodo", value)
                    }
                />
                <ColorField
                    label="Note"
                    value={appearanceForm.colors.pinNote}
                    onChange={(value) =>
                        updateAppearanceColor("pinNote", value)
                    }
                />
                <ColorField
                    label="Pomodoro"
                    value={appearanceForm.colors.pinTimer}
                    onChange={(value) =>
                        updateAppearanceColor("pinTimer", value)
                    }
                />
                <ColorField
                    label="Image"
                    value={appearanceForm.colors.pinImage}
                    onChange={(value) =>
                        updateAppearanceColor("pinImage", value)
                    }
                />
                <ColorField
                    label="Calendar"
                    value={appearanceForm.colors.pinCalendar}
                    onChange={(value) =>
                        updateAppearanceColor("pinCalendar", value)
                    }
                />
            </ColorCategoryCard>

            {appearanceError && (
                <p className="text-xs text-pin-timer">{appearanceError}</p>
            )}
            {appearanceSuccess && (
                <p className="text-xs text-pin-todo">{appearanceSuccess}</p>
            )}
        </div>
    );
});
