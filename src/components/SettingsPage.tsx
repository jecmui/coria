import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { useBoardStore } from "../store/boardStore";
import type {
    AppearanceColors,
    AppearanceSettings,
    PomodoroSettings,
    ThemeMode,
} from "../types";
import {
    DEFAULT_CALENDAR_SETTINGS,
    useCalendarStore,
} from "../store/calendarStore";
import type { CalendarSettings } from "../types/calendar";
import { useAppearanceStore } from "../store/appearanceStore";
import {
    colorsEqual,
    DARK_COLORS,
    DEFAULT_APPEARANCE,
    LIGHT_COLORS,
    usePrefersDark,
} from "../lib/appearance";

export type SettingsSection =
    | "account"
    | "preferences"
    | "pomodoro"
    | "calendar";
type AccountView = "details" | "change-password" | "forgot-password";

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
    { key: "pomodoro", label: "Pomodoro" },
    { key: "calendar", label: "Calendar" },
];

const FIRST_NAME_LIMIT = 35;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PasswordRequirement {
    label: string;
    test: (password: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
    { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
    {
        label: "A special character such as !@#$%^&*",
        test: (pw) => /[!@#$%^&*]/.test(pw),
    },
    { label: "An uppercase character", test: (pw) => /[A-Z]/.test(pw) },
    { label: "A lowercase character", test: (pw) => /[a-z]/.test(pw) },
    { label: "A number", test: (pw) => /[0-9]/.test(pw) },
];

const inputClass =
    "w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none";

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

function ToggleSwitch({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl bg-paper/70 px-3 py-2">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={() => onChange(!checked)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors hover:cursor-pointer ${
                    checked ? "bg-pin-todo" : "bg-paper-edge"
                }`}
            >
                <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper shadow transition-transform ${
                        checked ? "translate-x-0" : "-translate-x-4"
                    }`}
                />
            </button>
            <span className="font-body text-sm text-ink">{label}</span>
        </div>
    );
}

function ColorField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-3 rounded-xl bg-paper/70 px-3 py-2">
            <span className="font-body text-sm text-ink">{label}</span>
            <span className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase text-ink-soft">
                    {value}
                </span>
                <input
                    type="color"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    aria-label={label}
                    className="h-8 w-8 cursor-pointer rounded-md border border-paper-edge bg-transparent p-0.5"
                />
            </span>
        </label>
    );
}

function ColorCategoryCard({
    title,
    description,
    resetDisabled,
    onReset,
    children,
}: {
    title: string;
    description: string;
    resetDisabled: boolean;
    onReset: () => void;
    children: ReactNode;
}) {
    return (
        <div className="space-y-3 rounded-2xl border border-paper-edge bg-board/40 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-body text-sm font-semibold text-ink">
                        {title}
                    </h3>
                    <p className="mt-0.5 font-body text-xs text-ink-soft">
                        {description}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onReset}
                    disabled={resetDisabled}
                    className="shrink-0 rounded-full border border-paper-edge bg-paper px-3 py-1.5 font-body text-xs font-semibold text-ink transition hover:cursor-pointer hover:bg-paper/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Reset to defaults
                </button>
            </div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function AppearancePreview({ colors }: { colors: AppearanceColors }) {
    const cards: { label: string; pin: string }[] = [
        { label: "Today", pin: colors.pinTodo },
        { label: "Note", pin: colors.pinNote },
        { label: "Pomodoro", pin: colors.pinTimer },
        { label: "Image", pin: colors.pinImage },
        { label: "Calendar", pin: colors.pinCalendar },
    ];

    return (
        <div
            className="space-y-3 rounded-2xl border border-paper-edge p-4"
            style={{
                backgroundColor: colors.board,
                backgroundImage: `radial-gradient(${colors.boardLine} 1px, transparent 1px)`,
                backgroundSize: "20px 20px",
            }}
        >
            <p
                className="font-body text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: colors.ink }}
            >
                Preview
            </p>
            <div className="flex flex-wrap gap-3">
                {cards.map((card) => (
                    <div
                        key={card.label}
                        className="w-28 rounded-lg border p-2 shadow-sm"
                        style={{
                            backgroundColor: colors.paper,
                            borderColor: colors.paperEdge,
                        }}
                    >
                        <span
                            className="mb-1.5 block h-2 w-2 rounded-full"
                            style={{ backgroundColor: card.pin }}
                        />
                        <span
                            className="block font-body text-[11px] font-medium"
                            style={{ color: colors.ink }}
                        >
                            {card.label}
                        </span>
                        <span
                            className="mt-0.5 block font-body text-[10px]"
                            style={{ color: colors.inkSoft }}
                        >
                            Sample text
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export const SettingsPage = forwardRef<SettingsPageHandle, SettingsPageProps>(
    function SettingsPage({ activeSection, onSelectSection }, ref) {
        const { user } = useAuth();
        const storePomodoroSettings = useBoardStore((s) => s.pomodoroSettings);
        const pomodoroLoading = useBoardStore((s) => s.pomodoroLoading);
        const pomodoroLoadError = useBoardStore((s) => s.pomodoroError);
        const setStorePomodoroSettings = useBoardStore(
            (s) => s.setPomodoroSettings,
        );
        const storeCalendarSettings = useCalendarStore((s) => s.settings);
        const calendarLoading = useCalendarStore((s) => s.settingsLoading);
        const calendarLoadError = useCalendarStore((s) => s.settingsError);
        const saveStoreCalendarSettings = useCalendarStore(
            (s) => s.saveSettings,
        );
        const storeAppearanceSettings = useAppearanceStore((s) => s.settings);
        const appearanceLoading = useAppearanceStore((s) => s.settingsLoading);
        const appearanceLoadError = useAppearanceStore((s) => s.settingsError);
        const saveStoreAppearanceSettings = useAppearanceStore(
            (s) => s.saveSettings,
        );
        const prefersDark = usePrefersDark();

        // ----- Account section state -----
        const initialFirstName =
            (user?.user_metadata?.first_name as string | undefined) ?? "";
        const [email, setEmail] = useState(user?.email ?? "");
        const [savedEmail, setSavedEmail] = useState(user?.email ?? "");
        const [firstName, setFirstName] = useState(initialFirstName);
        const [savedFirstName, setSavedFirstName] = useState(initialFirstName);
        const [currentPassword, setCurrentPassword] = useState("");
        const [password, setPassword] = useState("");
        const [confirmPassword, setConfirmPassword] = useState("");
        const [showPassword, setShowPassword] = useState(false);
        const [accountView, setAccountView] = useState<AccountView>("details");
        const [accountError, setAccountError] = useState<string | null>(null);
        const [accountSuccess, setAccountSuccess] = useState<string | null>(
            null,
        );
        const [accountSaving, setAccountSaving] = useState(false);

        // ----- Pomodoro section state -----
        const [pomodoroForm, setPomodoroForm] = useState<PomodoroFormState>(
            () => settingsToForm(storePomodoroSettings),
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

        // ----- Calendar section state -----
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

        // ----- Appearance section state -----
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

        // Sync the editable Pomodoro form from the store once its initial load
        // (kicked off at login) resolves, without clobbering in-progress edits.
        useEffect(() => {
            if (pomodoroLoading || pomodoroSynced) return;
            const form = settingsToForm(storePomodoroSettings);
            setPomodoroForm(form);
            setSavedPomodoroForm(form);
            setPomodoroSynced(true);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [pomodoroLoading, pomodoroSynced]);

        useEffect(() => {
            if (calendarLoading || calendarSynced) return;
            const form = storeCalendarSettings ?? DEFAULT_CALENDAR_SETTINGS;
            setCalendarForm(form);
            setSavedCalendarForm(form);
            setCalendarSynced(true);
        }, [calendarLoading, calendarSynced, storeCalendarSettings]);

        useEffect(() => {
            if (appearanceLoading || appearanceSynced) return;
            const form = storeAppearanceSettings ?? DEFAULT_APPEARANCE;
            setAppearanceForm(form);
            setSavedAppearanceForm(form);
            setAppearanceSynced(true);
        }, [appearanceLoading, appearanceSynced, storeAppearanceSettings]);

        // ----- Appearance handlers -----
        function updateAppearanceColor(
            field: keyof AppearanceColors,
            value: string,
        ) {
            setAppearanceForm((f) => ({
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
            setAppearanceForm({ theme, colors });
        }

        function resetAppearanceCategory(fields: (keyof AppearanceColors)[]) {
            setAppearanceForm((f) => {
                const colors = { ...f.colors };
                fields.forEach((field) => {
                    colors[field] = LIGHT_COLORS[field];
                });
                return { theme: "custom", colors };
            });
        }

        function handleResetAllAppearance() {
            setAppearanceForm({ theme: "system", colors: LIGHT_COLORS });
            setAppearanceError(null);
        }

        const CANVAS_FIELDS: (keyof AppearanceColors)[] = [
            "board",
            "boardLine",
        ];
        const WIDGET_FIELDS: (keyof AppearanceColors)[] = [
            "paper",
            "paperEdge",
        ];
        const ACCENT_FIELDS: (keyof AppearanceColors)[] = [
            "pinTodo",
            "pinNote",
            "pinTimer",
            "pinImage",
            "pinCalendar",
        ];

        function categoryAtDefaults(fields: (keyof AppearanceColors)[]) {
            return fields.every(
                (field) => appearanceForm.colors[field] === LIGHT_COLORS[field],
            );
        }

        const isAppearanceAtDefaults =
            appearanceForm.theme === "system" &&
            colorsEqual(appearanceForm.colors, LIGHT_COLORS);

        function updatePomodoroField<K extends keyof PomodoroFormState>(
            key: K,
            value: PomodoroFormState[K],
        ) {
            if (POMODORO_NUMERIC_FIELDS.includes(key as PomodoroNumericField)) {
                const numericValue = String(value)
                    .replace(/\D/g, "")
                    .slice(0, 3);
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
            longBreakMinutes: getPomodoroFieldError(
                pomodoroForm.longBreakMinutes,
            ),
            longBreakInterval: getPomodoroFieldError(
                pomodoroForm.longBreakInterval,
            ),
        } satisfies Record<PomodoroNumericField, string | null>;
        const isPomodoroValid = POMODORO_NUMERIC_FIELDS.every(
            (field) => !pomodoroFieldErrors[field],
        );

        const isAccountDirty =
            email !== savedEmail ||
            firstName !== savedFirstName ||
            currentPassword.length > 0 ||
            password.length > 0 ||
            confirmPassword.length > 0;

        const isPomodoroDirty =
            JSON.stringify(pomodoroForm) !== JSON.stringify(savedPomodoroForm);
        const isCalendarDirty =
            JSON.stringify(calendarForm) !== JSON.stringify(savedCalendarForm);
        const isAppearanceDirty =
            JSON.stringify(appearanceForm) !==
            JSON.stringify(savedAppearanceForm);

        const isDirty =
            isAccountDirty ||
            isPomodoroDirty ||
            isCalendarDirty ||
            isAppearanceDirty;

        // ----- Leave-without-saving confirmation -----
        const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
        const pendingActionRef = useRef<(() => void) | null>(null);

        function resetAccountFields() {
            setEmail(savedEmail);
            setFirstName(savedFirstName);
            setCurrentPassword("");
            setPassword("");
            setConfirmPassword("");
            setShowPassword(false);
            setAccountView("details");
            setAccountError(null);
        }

        function resetPomodoroFields() {
            setPomodoroForm(savedPomodoroForm);
            setPomodoroError(null);
        }

        function resetCalendarFields() {
            setCalendarForm(savedCalendarForm);
            setCalendarError(null);
        }

        function resetAppearanceFields() {
            setAppearanceForm(savedAppearanceForm);
            setAppearanceError(null);
        }

        function requestNavigation(action: () => void) {
            if (isDirty) {
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
            resetAccountFields();
            resetPomodoroFields();
            resetCalendarFields();
            resetAppearanceFields();
            setShowLeaveConfirm(false);
            const action = pendingActionRef.current;
            pendingActionRef.current = null;
            action?.();
        }

        useEffect(() => {
            if (activeSection !== "account") {
                setAccountView("details");
            }
        }, [activeSection]);

        // ----- Save handlers -----
        async function handleSaveAccount() {
            setAccountError(null);
            setAccountSuccess(null);

            if (!EMAIL_REGEX.test(email)) {
                setAccountError("Please enter a valid email address.");
                return;
            }
            if (!firstName.trim()) {
                setAccountError("Please enter your first name.");
                return;
            }

            const changingPassword =
                currentPassword.length > 0 ||
                password.length > 0 ||
                confirmPassword.length > 0;
            if (changingPassword) {
                if (!currentPassword.trim()) {
                    setAccountError("Please enter your current password.");
                    return;
                }
                if (!password.trim()) {
                    setAccountError("Please enter a new password.");
                    return;
                }
                if (!confirmPassword.trim()) {
                    setAccountError("Please confirm your new password.");
                    return;
                }
                const unmetRequirement = PASSWORD_REQUIREMENTS.find(
                    (req) => !req.test(password),
                );
                if (unmetRequirement) {
                    setAccountError(
                        "Your password doesn't meet all the requirements above.",
                    );
                    return;
                }
                if (password !== confirmPassword) {
                    setAccountError("Passwords don't match.");
                    return;
                }
                if (!user?.email) {
                    setAccountError(
                        "You must be signed in to update your password.",
                    );
                    return;
                }
                const { error: reauthError } =
                    await supabase.auth.signInWithPassword({
                        email: user.email,
                        password: currentPassword,
                    });
                if (reauthError) {
                    setAccountError("Your current password is incorrect.");
                    setAccountSaving(false);
                    return;
                }
            }

            if (!user) {
                setAccountError(
                    "You must be signed in to update your account.",
                );
                return;
            }

            setAccountSaving(true);

            const emailChanged = email !== savedEmail;
            const firstNameChanged = firstName !== savedFirstName;

            if (emailChanged) {
                const { error } = await supabase.auth.updateUser({ email });
                if (error) {
                    setAccountError(error.message);
                    setAccountSaving(false);
                    return;
                }
            }

            if (firstNameChanged) {
                const { error: metaError } = await supabase.auth.updateUser({
                    data: { first_name: firstName },
                });
                if (metaError) {
                    setAccountError(metaError.message);
                    setAccountSaving(false);
                    return;
                }

                const { error: profileError } = await supabase
                    .from("profiles")
                    .update({ first_name: firstName })
                    .eq("id", user.id);
                if (profileError) {
                    setAccountError(profileError.message);
                    setAccountSaving(false);
                    return;
                }
            }

            if (changingPassword) {
                const { error } = await supabase.auth.updateUser({ password });
                if (error) {
                    setAccountError(error.message);
                    setAccountSaving(false);
                    return;
                }
            }

            setSavedEmail(email);
            setSavedFirstName(firstName);
            setCurrentPassword("");
            setPassword("");
            setConfirmPassword("");
            setShowPassword(false);
            setAccountView("details");
            setAccountSuccess(
                emailChanged
                    ? "Saved. Check your inbox to confirm your new email address."
                    : "Account updated.",
            );
            window.setTimeout(() => setAccountSuccess(null), 4000);
            setAccountSaving(false);
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

        function handleSaveChanges() {
            if (activeSection === "account") void handleSaveAccount();
            else if (activeSection === "pomodoro") void handleSavePomodoro();
            else if (activeSection === "calendar") void handleSaveCalendar();
            else if (activeSection === "preferences")
                void handleSaveAppearance();
        }

        const saveDisabled =
            (activeSection === "account" &&
                (!isAccountDirty || accountSaving)) ||
            (activeSection === "pomodoro" &&
                (!isPomodoroDirty || pomodoroSaving || !isPomodoroValid)) ||
            (activeSection === "calendar" &&
                (!isCalendarDirty || calendarSaving)) ||
            (activeSection === "preferences" &&
                (!isAppearanceDirty || appearanceSaving));

        const saving =
            (activeSection === "account" && accountSaving) ||
            (activeSection === "pomodoro" && pomodoroSaving) ||
            (activeSection === "calendar" && calendarSaving) ||
            (activeSection === "preferences" && appearanceSaving);

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
                            disabled={saveDisabled}
                            className="rounded-full border border-paper-edge bg-paper px-4 py-2 font-body text-sm font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition hover:cursor-pointer hover:bg-paper/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Save Changes"}
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
                                <div className="space-y-5">
                                    {accountView === "details" && (
                                        <>
                                            <div>
                                                <h2 className="font-body text-lg font-semibold text-ink">
                                                    Account
                                                </h2>
                                                <p className="mt-1 font-body text-sm text-ink-soft">
                                                    Update the basics for your
                                                    account.
                                                </p>
                                            </div>

                                            <label className="block space-y-2">
                                                <span className="font-body text-sm font-medium text-ink">
                                                    Email
                                                </span>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={(event) =>
                                                        setEmail(
                                                            event.target.value,
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                                {email.length > 0 &&
                                                    !EMAIL_REGEX.test(
                                                        email,
                                                    ) && (
                                                        <p className="text-xs text-pin-timer">
                                                            Please enter a valid
                                                            email address.
                                                        </p>
                                                    )}
                                            </label>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-body text-sm font-medium text-ink">
                                                        First name
                                                    </span>
                                                    <span className="text-xs text-ink-soft">
                                                        {firstName.length}/
                                                        {FIRST_NAME_LIMIT}
                                                    </span>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={firstName}
                                                    maxLength={FIRST_NAME_LIMIT}
                                                    onChange={(event) =>
                                                        setFirstName(
                                                            event.target.value.slice(
                                                                0,
                                                                FIRST_NAME_LIMIT,
                                                            ),
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAccountView(
                                                        "change-password",
                                                    );
                                                    setAccountError(null);
                                                    setAccountSuccess(null);
                                                }}
                                                className="rounded-full border border-paper-edge bg-paper px-4 py-2 font-body text-sm font-semibold text-ink transition hover:cursor-pointer hover:bg-paper/90"
                                            >
                                                Change password
                                            </button>
                                        </>
                                    )}

                                    {accountView === "change-password" && (
                                        <>
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h2 className="font-body text-lg font-semibold text-ink">
                                                        Change password
                                                    </h2>
                                                    <p className="mt-1 font-body text-sm text-ink-soft">
                                                        Update your password
                                                        securely.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAccountView(
                                                            "details",
                                                        );
                                                        setCurrentPassword("");
                                                        setPassword("");
                                                        setConfirmPassword("");
                                                        setShowPassword(false);
                                                        setAccountError(null);
                                                        setAccountSuccess(null);
                                                    }}
                                                    className="text-sm font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                                                >
                                                    Back
                                                </button>
                                            </div>

                                            <label className="block space-y-2">
                                                <span className="font-body text-sm font-medium text-ink">
                                                    Current password
                                                </span>
                                                <input
                                                    type={
                                                        showPassword
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    value={currentPassword}
                                                    onChange={(event) =>
                                                        setCurrentPassword(
                                                            event.target.value,
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setAccountView(
                                                        "forgot-password",
                                                    )
                                                }
                                                className="-mt-2 text-sm font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                                            >
                                                Forgot password?
                                            </button>

                                            <label className="block space-y-2">
                                                <span className="font-body text-sm font-medium text-ink">
                                                    New password
                                                </span>
                                                <input
                                                    type={
                                                        showPassword
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    value={password}
                                                    onChange={(event) =>
                                                        setPassword(
                                                            event.target.value,
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </label>

                                            {password.length > 0 && (
                                                <ul className="-mt-3 space-y-0.5">
                                                    {PASSWORD_REQUIREMENTS.map(
                                                        (req) => {
                                                            const satisfied =
                                                                req.test(
                                                                    password,
                                                                );
                                                            return (
                                                                <li
                                                                    key={
                                                                        req.label
                                                                    }
                                                                    className={`text-[11px] transition-colors ${
                                                                        satisfied
                                                                            ? "text-pin-todo"
                                                                            : "text-ink-soft"
                                                                    }`}
                                                                >
                                                                    •{" "}
                                                                    {req.label}
                                                                </li>
                                                            );
                                                        },
                                                    )}
                                                </ul>
                                            )}

                                            <label className="block space-y-2">
                                                <span className="font-body text-sm font-medium text-ink">
                                                    Confirm new password
                                                </span>
                                                <input
                                                    type={
                                                        showPassword
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    value={confirmPassword}
                                                    onChange={(event) =>
                                                        setConfirmPassword(
                                                            event.target.value,
                                                        )
                                                    }
                                                    className={inputClass}
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowPassword((s) => !s)
                                                }
                                                className="-mt-3 text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                                            >
                                                {showPassword
                                                    ? "Hide password"
                                                    : "Show password"}
                                            </button>
                                        </>
                                    )}

                                    {accountView === "forgot-password" && (
                                        <>
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h2 className="font-body text-lg font-semibold text-ink">
                                                        Forgot password?
                                                    </h2>
                                                    <p className="mt-1 font-body text-sm text-ink-soft">
                                                        We can help you start
                                                        the recovery flow.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setAccountView(
                                                            "change-password",
                                                        )
                                                    }
                                                    className="text-sm font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                                                >
                                                    Back
                                                </button>
                                            </div>

                                            <div className="rounded-2xl border border-paper-edge bg-board/40 p-4">
                                                <p className="font-body text-sm text-ink-soft">
                                                    Password reset is handled
                                                    through your authentication
                                                    provider. Return to the
                                                    change-password form
                                                    whenever you are ready.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setAccountView(
                                                            "change-password",
                                                        )
                                                    }
                                                    className="mt-3 rounded-full border border-paper-edge bg-paper px-4 py-2 font-body text-sm font-semibold text-ink transition hover:cursor-pointer hover:bg-paper/90"
                                                >
                                                    Return to change password
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {accountError && (
                                        <p className="text-xs text-pin-timer">
                                            {accountError}
                                        </p>
                                    )}
                                    {accountSuccess && (
                                        <p className="text-xs text-pin-todo">
                                            {accountSuccess}
                                        </p>
                                    )}
                                </div>
                            )}

                            {activeSection === "preferences" && (
                                <div className="space-y-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h2 className="font-body text-lg font-semibold text-ink">
                                                Appearance
                                            </h2>
                                            <p className="mt-1 font-body text-sm text-ink-soft">
                                                Customize the board, widgets,
                                                and accent colors.
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
                                            Couldn't load your saved Appearance
                                            settings, showing defaults instead.
                                        </p>
                                    )}

                                    <label className="block max-w-xs space-y-2">
                                        <span className="font-body text-sm font-medium text-ink">
                                            Theme
                                        </span>
                                        <select
                                            value={appearanceForm.theme}
                                            onChange={(event) =>
                                                handleThemeChange(
                                                    event.target
                                                        .value as ThemeMode,
                                                )
                                            }
                                            className={inputClass}
                                        >
                                            <option value="light">
                                                Light Mode
                                            </option>
                                            <option value="dark">
                                                Dark Mode
                                            </option>
                                            <option value="system">
                                                System Default
                                            </option>
                                            <option value="custom">
                                                Custom
                                            </option>
                                        </select>
                                    </label>

                                    <AppearancePreview
                                        colors={appearanceForm.colors}
                                    />

                                    <ColorCategoryCard
                                        title="Canvas"
                                        description="The bulletin board backdrop."
                                        resetDisabled={categoryAtDefaults(
                                            CANVAS_FIELDS,
                                        )}
                                        onReset={() =>
                                            resetAppearanceCategory(
                                                CANVAS_FIELDS,
                                            )
                                        }
                                    >
                                        <ColorField
                                            label="Board"
                                            value={appearanceForm.colors.board}
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "board",
                                                    value,
                                                )
                                            }
                                        />
                                        <ColorField
                                            label="Board dot pattern"
                                            value={
                                                appearanceForm.colors.boardLine
                                            }
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "boardLine",
                                                    value,
                                                )
                                            }
                                        />
                                    </ColorCategoryCard>

                                    <ColorCategoryCard
                                        title="Widgets"
                                        description="The paper card background shared by every widget."
                                        resetDisabled={categoryAtDefaults(
                                            WIDGET_FIELDS,
                                        )}
                                        onReset={() =>
                                            resetAppearanceCategory(
                                                WIDGET_FIELDS,
                                            )
                                        }
                                    >
                                        <ColorField
                                            label="Paper"
                                            value={appearanceForm.colors.paper}
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "paper",
                                                    value,
                                                )
                                            }
                                        />
                                        <ColorField
                                            label="Paper edge"
                                            value={
                                                appearanceForm.colors.paperEdge
                                            }
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "paperEdge",
                                                    value,
                                                )
                                            }
                                        />
                                    </ColorCategoryCard>

                                    <ColorCategoryCard
                                        title="Accents"
                                        description="The pin color for each widget type."
                                        resetDisabled={categoryAtDefaults(
                                            ACCENT_FIELDS,
                                        )}
                                        onReset={() =>
                                            resetAppearanceCategory(
                                                ACCENT_FIELDS,
                                            )
                                        }
                                    >
                                        <ColorField
                                            label="Today"
                                            value={
                                                appearanceForm.colors.pinTodo
                                            }
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "pinTodo",
                                                    value,
                                                )
                                            }
                                        />
                                        <ColorField
                                            label="Note"
                                            value={
                                                appearanceForm.colors.pinNote
                                            }
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "pinNote",
                                                    value,
                                                )
                                            }
                                        />
                                        <ColorField
                                            label="Pomodoro"
                                            value={
                                                appearanceForm.colors.pinTimer
                                            }
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "pinTimer",
                                                    value,
                                                )
                                            }
                                        />
                                        <ColorField
                                            label="Image"
                                            value={
                                                appearanceForm.colors.pinImage
                                            }
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "pinImage",
                                                    value,
                                                )
                                            }
                                        />
                                        <ColorField
                                            label="Calendar"
                                            value={
                                                appearanceForm.colors
                                                    .pinCalendar
                                            }
                                            onChange={(value) =>
                                                updateAppearanceColor(
                                                    "pinCalendar",
                                                    value,
                                                )
                                            }
                                        />
                                    </ColorCategoryCard>

                                    {appearanceError && (
                                        <p className="text-xs text-pin-timer">
                                            {appearanceError}
                                        </p>
                                    )}
                                    {appearanceSuccess && (
                                        <p className="text-xs text-pin-todo">
                                            {appearanceSuccess}
                                        </p>
                                    )}
                                </div>
                            )}

                            {activeSection === "calendar" && (
                                <div className="space-y-5">
                                    <div>
                                        <h2 className="font-body text-lg font-semibold text-ink">
                                            Calendar
                                        </h2>
                                        <p className="mt-1 font-body text-sm text-ink-soft">
                                            Choose how your calendar displays
                                            dates and times.
                                        </p>
                                    </div>

                                    {calendarLoadError && (
                                        <p className="text-xs text-pin-timer">
                                            Couldn't load your saved Calendar
                                            settings, showing defaults instead.
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
                                                        weekStart: Number(
                                                            event.target.value,
                                                        ),
                                                    })
                                                }
                                                className={inputClass}
                                            >
                                                <option value={0}>
                                                    Sunday
                                                </option>
                                                <option value={1}>
                                                    Monday
                                                </option>
                                                <option value={2}>
                                                    Tuesday
                                                </option>
                                                <option value={3}>
                                                    Wednesday
                                                </option>
                                                <option value={4}>
                                                    Thursday
                                                </option>
                                                <option value={5}>
                                                    Friday
                                                </option>
                                                <option value={6}>
                                                    Saturday
                                                </option>
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
                                                <option value="MM/DD/YYYY">
                                                    MM/DD/YYYY
                                                </option>
                                                <option value="DD/MM/YYYY">
                                                    DD/MM/YYYY
                                                </option>
                                                <option value="YYYY-MM-DD">
                                                    YYYY-MM-DD
                                                </option>
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
                                                <option value="12h">
                                                    12-hour (AM/PM)
                                                </option>
                                                <option value="24h">
                                                    24-hour
                                                </option>
                                            </select>
                                        </label>

                                        <label className="block space-y-2">
                                            <span className="font-body text-sm font-medium text-ink">
                                                Time zone
                                            </span>
                                            <select
                                                value={calendarForm.timeZone}
                                                onChange={(event) =>
                                                    setCalendarForm({
                                                        ...calendarForm,
                                                        timeZone:
                                                            event.target.value,
                                                    })
                                                }
                                                className={inputClass}
                                            >
                                                {(typeof Intl.supportedValuesOf ===
                                                "function"
                                                    ? Intl.supportedValuesOf(
                                                          "timeZone",
                                                      )
                                                    : [calendarForm.timeZone]
                                                ).map((zone) => (
                                                    <option
                                                        key={zone}
                                                        value={zone}
                                                    >
                                                        {zone.replaceAll(
                                                            "_",
                                                            " ",
                                                        )}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="block space-y-2 md:col-span-2">
                                            <span className="font-body text-sm font-medium text-ink">
                                                Default event duration (minutes)
                                            </span>
                                            <input
                                                type="number"
                                                min="15"
                                                step="15"
                                                value={
                                                    calendarForm.defaultEventDuration
                                                }
                                                onChange={(event) =>
                                                    setCalendarForm({
                                                        ...calendarForm,
                                                        defaultEventDuration:
                                                            Math.max(
                                                                15,
                                                                Number(
                                                                    event.target
                                                                        .value,
                                                                ),
                                                            ),
                                                    })
                                                }
                                                className={inputClass}
                                            />
                                        </label>
                                    </div>

                                    {calendarError && (
                                        <p className="text-xs text-pin-timer">
                                            {calendarError}
                                        </p>
                                    )}
                                    {calendarSuccess && (
                                        <p className="text-xs text-pin-todo">
                                            {calendarSuccess}
                                        </p>
                                    )}
                                </div>
                            )}

                            {activeSection === "pomodoro" && (
                                <div className="space-y-5">
                                    <div>
                                        <h2 className="font-body text-lg font-semibold text-ink">
                                            Pomodoro
                                        </h2>
                                        <p className="mt-1 font-body text-sm text-ink-soft">
                                            Tune the timer behavior to match
                                            your flow.
                                        </p>
                                    </div>

                                    {pomodoroLoadError && (
                                        <p className="text-xs text-pin-timer">
                                            Couldn't load your saved Pomodoro
                                            settings, showing defaults instead.
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
                                                value={
                                                    pomodoroForm.focusMinutes
                                                }
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
                                                    {
                                                        pomodoroFieldErrors.focusMinutes
                                                    }
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
                                                value={
                                                    pomodoroForm.shortBreakMinutes
                                                }
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
                                                    {
                                                        pomodoroFieldErrors.shortBreakMinutes
                                                    }
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
                                                value={
                                                    pomodoroForm.longBreakMinutes
                                                }
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
                                                    {
                                                        pomodoroFieldErrors.longBreakMinutes
                                                    }
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
                                                value={
                                                    pomodoroForm.longBreakInterval
                                                }
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
                                                    {
                                                        pomodoroFieldErrors.longBreakInterval
                                                    }
                                                </p>
                                            )}
                                        </label>
                                    </div>

                                    <div className="space-y-3 rounded-2xl border border-paper-edge bg-board/40 p-4">
                                        <ToggleSwitch
                                            checked={
                                                pomodoroForm.autoStartBreaks
                                            }
                                            onChange={(value) =>
                                                updatePomodoroField(
                                                    "autoStartBreaks",
                                                    value,
                                                )
                                            }
                                            label="Auto-start breaks"
                                        />

                                        <ToggleSwitch
                                            checked={
                                                pomodoroForm.autoStartFocus
                                            }
                                            onChange={(value) =>
                                                updatePomodoroField(
                                                    "autoStartFocus",
                                                    value,
                                                )
                                            }
                                            label="Auto-start focus"
                                        />
                                    </div>

                                    {pomodoroError && (
                                        <p className="text-xs text-pin-timer">
                                            {pomodoroError}
                                        </p>
                                    )}
                                    {pomodoroSuccess && (
                                        <p className="text-xs text-pin-todo">
                                            {pomodoroSuccess}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {showLeaveConfirm && (
                    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 px-4">
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
