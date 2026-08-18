export interface SettingsSectionStatus {
    dirty: boolean;
    /** dirty && internally valid && not already saving. */
    canSave: boolean;
    saving: boolean;
}

export interface SettingsSectionHandle {
    save: () => void;
    discard: () => void;
}

export interface SettingsSectionProps {
    onStatusChange: (status: SettingsSectionStatus) => void;
}
