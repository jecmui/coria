import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useAppearanceStore } from "../../store/appearanceStore";
import { useTaskStore } from "../../store/taskStore";
import { DEFAULT_APPEARANCE } from "../../lib/appearance";
import type {
    TodayClearMode,
    TodayClearScope,
    TodayClearSettings,
} from "../../types";
import {
    ColorCategoryCard,
    inputClass,
    TimeZoneSelect,
    ToggleSwitch,
} from "./shared";
import type { SettingsSectionHandle, SettingsSectionProps } from "./types";

export const BoardSection = forwardRef<
    SettingsSectionHandle,
    SettingsSectionProps
>(function BoardSection({ onStatusChange }, ref) {
    const { user } = useAuth();

    // ----- Board movement (snap-to-grid) -----
    const storeAppearanceSettings = useAppearanceStore((s) => s.settings);
    const appearanceLoading = useAppearanceStore((s) => s.settingsLoading);
    const saveStoreAppearanceSettings = useAppearanceStore(
        (s) => s.saveSettings,
    );

    const [snapToGrid, setSnapToGrid] = useState(
        () => storeAppearanceSettings.snapToGrid,
    );
    const [savedSnapToGrid, setSavedSnapToGrid] = useState(
        () => storeAppearanceSettings.snapToGrid,
    );
    const [snapToGridSynced, setSnapToGridSynced] = useState(false);

    useEffect(() => {
        if (appearanceLoading || snapToGridSynced) return;
        setSnapToGrid(storeAppearanceSettings.snapToGrid);
        setSavedSnapToGrid(storeAppearanceSettings.snapToGrid);
        setSnapToGridSynced(true);
    }, [appearanceLoading, snapToGridSynced, storeAppearanceSettings]);

    const isSnapToGridDirty = snapToGrid !== savedSnapToGrid;

    // ----- Today widget clearing -----
    const storeTodayClearSettings = useTaskStore((s) => s.todayClearSettings);
    const todayClearLoading = useTaskStore(
        (s) => s.todayClearSettingsLoading,
    );
    const saveStoreTodayClearSettings = useTaskStore(
        (s) => s.saveTodayClearSettings,
    );

    const [todayClearForm, setTodayClearForm] = useState<TodayClearSettings>(
        () => storeTodayClearSettings,
    );
    const [savedTodayClearForm, setSavedTodayClearForm] =
        useState<TodayClearSettings>(() => storeTodayClearSettings);
    const [todayClearSynced, setTodayClearSynced] = useState(false);

    useEffect(() => {
        if (todayClearLoading || todayClearSynced) return;
        setTodayClearForm(storeTodayClearSettings);
        setSavedTodayClearForm(storeTodayClearSettings);
        setTodayClearSynced(true);
    }, [todayClearLoading, todayClearSynced, storeTodayClearSettings]);

    const isTodayClearDirty =
        JSON.stringify(todayClearForm) !== JSON.stringify(savedTodayClearForm);
    const isTodayClearValid =
        todayClearForm.mode === "manual" ||
        todayClearForm.time.trim().length > 0;

    const [boardError, setBoardError] = useState<string | null>(null);
    const [boardSuccess, setBoardSuccess] = useState<string | null>(null);
    const [boardSaving, setBoardSaving] = useState(false);

    const isBoardDirty = isSnapToGridDirty || isTodayClearDirty;
    const canSaveBoard =
        isBoardDirty &&
        !boardSaving &&
        (!isTodayClearDirty || isTodayClearValid);

    function discard() {
        setSnapToGrid(savedSnapToGrid);
        setTodayClearForm(savedTodayClearForm);
        setBoardError(null);
    }

    async function handleSaveBoard() {
        if (!user) {
            setBoardError("You must be signed in to update settings.");
            return;
        }
        if (isTodayClearDirty && !isTodayClearValid) {
            setBoardError(
                "Please choose a time to clear Today automatically at.",
            );
            return;
        }
        setBoardError(null);
        setBoardSuccess(null);
        setBoardSaving(true);

        let ok = true;
        if (isSnapToGridDirty) {
            const saved = await saveStoreAppearanceSettings({
                ...useAppearanceStore.getState().settings,
                snapToGrid,
            });
            if (saved) setSavedSnapToGrid(snapToGrid);
            else ok = false;
        }
        if (isTodayClearDirty) {
            const saved = await saveStoreTodayClearSettings(todayClearForm);
            if (saved) setSavedTodayClearForm(todayClearForm);
            else ok = false;
        }

        if (!ok) {
            setBoardError("Couldn't save Board settings.");
            setBoardSaving(false);
            return;
        }
        setBoardSuccess("Board settings saved.");
        window.setTimeout(() => setBoardSuccess(null), 4000);
        setBoardSaving(false);
    }

    useImperativeHandle(ref, () => ({
        save: () => void handleSaveBoard(),
        discard,
    }));

    useEffect(() => {
        onStatusChange({
            dirty: isBoardDirty,
            canSave: canSaveBoard,
            saving: boardSaving,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isBoardDirty, canSaveBoard, boardSaving]);

    return (
        <div className="space-y-5">
            <div>
                <h2 className="font-body text-lg font-semibold text-ink">
                    Board
                </h2>
                <p className="mt-1 font-body text-sm text-ink-soft">
                    Configure how widgets move, and how the Today widget
                    clears itself.
                </p>
            </div>

            <ColorCategoryCard
                title="Board movement"
                description="How widgets move when you drag or resize them on the board."
                resetDisabled={snapToGrid === DEFAULT_APPEARANCE.snapToGrid}
                onReset={() => setSnapToGrid(DEFAULT_APPEARANCE.snapToGrid)}
            >
                <ToggleSwitch
                    checked={snapToGrid}
                    onChange={setSnapToGrid}
                    label="Snap to grid"
                />
                <p className="font-body text-xs text-ink-soft">
                    When on, widgets snap to an invisible grid as you drag or
                    resize them, instead of moving freely.
                </p>
            </ColorCategoryCard>

            <div className="space-y-3 rounded-2xl border border-paper-edge bg-board/40 p-4">
                <div>
                    <h3 className="font-body text-sm font-semibold text-ink">
                        Today
                    </h3>
                    <p className="mt-0.5 font-body text-xs text-ink-soft">
                        Choose how the Today widget clears itself. Clearing
                        only removes tasks from Today -- it doesn't delete
                        them from your full task list.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                        <span className="font-body text-sm font-medium text-ink">
                            Clearing
                        </span>
                        <select
                            value={todayClearForm.mode}
                            onChange={(event) =>
                                setTodayClearForm((f) => ({
                                    ...f,
                                    mode: event.target
                                        .value as TodayClearMode,
                                }))
                            }
                            className={inputClass}
                        >
                            <option value="manual">Manual</option>
                            <option value="automatic">Automatic</option>
                        </select>
                    </label>
                </div>

                {todayClearForm.mode === "manual" ? (
                    <p className="font-body text-xs text-ink-soft">
                        Right-click the Today widget to clear completed or
                        all tasks whenever you'd like.
                    </p>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block space-y-2">
                            <span className="font-body text-sm font-medium text-ink">
                                Clear at
                            </span>
                            <input
                                type="time"
                                value={todayClearForm.time}
                                onChange={(event) =>
                                    setTodayClearForm((f) => ({
                                        ...f,
                                        time: event.target.value,
                                    }))
                                }
                                className={inputClass}
                            />
                        </label>

                        <label className="block space-y-2">
                            <span className="font-body text-sm font-medium text-ink">
                                Time zone
                            </span>
                            <TimeZoneSelect
                                value={todayClearForm.timeZone}
                                onChange={(value) =>
                                    setTodayClearForm((f) => ({
                                        ...f,
                                        timeZone: value,
                                    }))
                                }
                            />
                        </label>

                        <label className="block space-y-2 md:col-span-2">
                            <span className="font-body text-sm font-medium text-ink">
                                What to clear
                            </span>
                            <select
                                value={todayClearForm.scope}
                                onChange={(event) =>
                                    setTodayClearForm((f) => ({
                                        ...f,
                                        scope: event.target
                                            .value as TodayClearScope,
                                    }))
                                }
                                className={inputClass}
                            >
                                <option value="completed">
                                    Completed tasks only
                                </option>
                                <option value="all">All tasks</option>
                            </select>
                        </label>
                    </div>
                )}
            </div>

            {boardError && (
                <p className="text-xs text-pin-timer">{boardError}</p>
            )}
            {boardSuccess && (
                <p className="text-xs text-pin-todo">{boardSuccess}</p>
            )}
        </div>
    );
});
