import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useModalDismiss } from "../lib/useModalDismiss";
import { AccountSection } from "./settings/AccountSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { BoardSection } from "./settings/BoardSection";
import { PomodoroSection } from "./settings/PomodoroSection";
import { CalendarSection } from "./settings/CalendarSection";
import type {
    SettingsSectionHandle,
    SettingsSectionStatus,
} from "./settings/types";

export type SettingsSection =
    | "account"
    | "preferences"
    | "board"
    | "pomodoro"
    | "calendar";

export interface SettingsPageHandle {
    /** Runs `action` immediately, or — if there are unsaved changes — shows the
     * leave-without-saving confirmation and only runs it once the user confirms. */
    requestNavigation: (action: () => void) => void;
}

interface SettingsPageProps {
    activeSection: SettingsSection;
    onSelectSection: (section: SettingsSection) => void;
}

const SECTIONS: { key: SettingsSection; label: string }[] = [
    { key: "account", label: "Account" },
    { key: "preferences", label: "Appearance" },
    { key: "board", label: "Board" },
    { key: "pomodoro", label: "Pomodoro" },
    { key: "calendar", label: "Calendar" },
];

const EMPTY_STATUS: SettingsSectionStatus = {
    dirty: false,
    canSave: false,
    saving: false,
};

// Each section owns its own form state and persistence and is only ever
// mounted while active (see the render below), so at most one section can be
// dirty at a time -- switching sections or navigating away while dirty is
// always gated through the confirmation dialog first. That lets this shell
// stay thin: it just relays Save/discard to whichever section is mounted and
// reflects the status that section reports back.
export const SettingsPage = forwardRef<SettingsPageHandle, SettingsPageProps>(
    function SettingsPage({ activeSection, onSelectSection }, ref) {
        const [status, setStatus] =
            useState<SettingsSectionStatus>(EMPTY_STATUS);
        const sectionRef = useRef<SettingsSectionHandle>(null);
        const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
        const pendingActionRef = useRef<(() => void) | null>(null);
        const dismissLeaveConfirm = useModalDismiss(
            showLeaveConfirm,
            cancelLeave,
        );

        function requestNavigation(action: () => void) {
            if (status.dirty) {
                pendingActionRef.current = action;
                setShowLeaveConfirm(true);
            } else {
                action();
            }
        }

        useImperativeHandle(ref, () => ({ requestNavigation }));

        function handleSelectSection(section: SettingsSection) {
            requestNavigation(() => onSelectSection(section));
        }

        function cancelLeave() {
            pendingActionRef.current = null;
            setShowLeaveConfirm(false);
        }

        function confirmDiscard() {
            sectionRef.current?.discard();
            setShowLeaveConfirm(false);
            const action = pendingActionRef.current;
            pendingActionRef.current = null;
            action?.();
        }

        function handleSaveChanges() {
            sectionRef.current?.save();
        }

        const sectionProps = { onStatusChange: setStatus };

        return (
            <div className="flex h-full min-h-0 w-full flex-col bg-board px-4 py-6 sm:px-6 lg:px-8">
                <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col rounded-[28px] border border-paper-edge/80 bg-paper/90 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)] backdrop-blur sm:p-6">
                    <div className="mb-6 flex items-center justify-between border-b border-paper-edge pb-4">
                        <div>
                            <p className="font-body text-xs uppercase tracking-[0.28em] text-ink-soft">
                                Settings
                            </p>
                            <h1 className="mt-1 font-body text-2xl font-semibold text-ink">
                                Manage your workspace
                            </h1>
                        </div>
                        <button
                            type="button"
                            onClick={handleSaveChanges}
                            disabled={!status.canSave}
                            className="rounded-full border border-paper-edge bg-paper px-4 py-2 font-body text-sm font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition hover:cursor-pointer hover:bg-paper/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {status.saving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
                        <div className="flex min-h-0 flex-col rounded-2xl border border-paper-edge bg-board/50 p-3 lg:w-56">
                            {SECTIONS.map((section) => (
                                <button
                                    key={section.key}
                                    type="button"
                                    onClick={() =>
                                        handleSelectSection(section.key)
                                    }
                                    className={`rounded-xl px-3 py-2 text-left font-body text-sm font-medium transition hover:cursor-pointer ${
                                        activeSection === section.key
                                            ? "bg-paper text-ink shadow-sm"
                                            : "text-ink-soft hover:bg-paper/70 hover:text-ink"
                                    }`}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-paper-edge bg-paper/70 p-4 sm:p-6">
                            {activeSection === "account" && (
                                <AccountSection
                                    ref={sectionRef}
                                    {...sectionProps}
                                />
                            )}
                            {activeSection === "preferences" && (
                                <AppearanceSection
                                    ref={sectionRef}
                                    {...sectionProps}
                                />
                            )}
                            {activeSection === "board" && (
                                <BoardSection
                                    ref={sectionRef}
                                    {...sectionProps}
                                />
                            )}
                            {activeSection === "pomodoro" && (
                                <PomodoroSection
                                    ref={sectionRef}
                                    {...sectionProps}
                                />
                            )}
                            {activeSection === "calendar" && (
                                <CalendarSection
                                    ref={sectionRef}
                                    {...sectionProps}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {showLeaveConfirm && (
                    <div
                        className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 px-4"
                        onClick={dismissLeaveConfirm}
                    >
                        <div className="w-full max-w-sm rounded-lg border border-paper-edge bg-paper p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                            <h2 className="mb-2 font-display text-lg font-semibold text-ink">
                                Are you sure you want to leave without making
                                changes?
                            </h2>
                            <p className="mb-5 font-body text-sm text-ink-soft">
                                You have unsaved changes on this page.
                            </p>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={cancelLeave}
                                    className="rounded-md border border-paper-edge px-4 py-2 font-body text-sm font-medium text-ink hover:cursor-pointer hover:bg-black/5"
                                >
                                    Go Back
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDiscard}
                                    className="rounded-md bg-pin-timer px-4 py-2 font-body text-sm font-medium text-paper hover:cursor-pointer"
                                >
                                    Don't Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    },
);
