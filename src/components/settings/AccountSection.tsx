import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthContext";
import { inputClass } from "./shared";
import type { SettingsSectionHandle, SettingsSectionProps } from "./types";

type AccountView = "details" | "change-password" | "forgot-password";

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

export const AccountSection = forwardRef<
    SettingsSectionHandle,
    SettingsSectionProps
>(function AccountSection({ onStatusChange }, ref) {
    const { user } = useAuth();
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
    const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
    const [accountSaving, setAccountSaving] = useState(false);

    const isAccountDirty =
        email !== savedEmail ||
        firstName !== savedFirstName ||
        currentPassword.length > 0 ||
        password.length > 0 ||
        confirmPassword.length > 0;

    function discard() {
        setEmail(savedEmail);
        setFirstName(savedFirstName);
        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setAccountView("details");
        setAccountError(null);
    }

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
            setAccountError("You must be signed in to update your account.");
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

    useImperativeHandle(ref, () => ({
        save: () => void handleSaveAccount(),
        discard,
    }));

    useEffect(() => {
        onStatusChange({
            dirty: isAccountDirty,
            canSave: isAccountDirty && !accountSaving,
            saving: accountSaving,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAccountDirty, accountSaving]);

    return (
        <div className="space-y-5">
            {accountView === "details" && (
                <>
                    <div>
                        <h2 className="font-body text-lg font-semibold text-ink">
                            Account
                        </h2>
                        <p className="mt-1 font-body text-sm text-ink-soft">
                            Update the basics for your account.
                        </p>
                    </div>

                    <label className="block space-y-2">
                        <span className="font-body text-sm font-medium text-ink">
                            Email
                        </span>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            className={inputClass}
                        />
                        {email.length > 0 && !EMAIL_REGEX.test(email) && (
                            <p className="text-xs text-pin-timer">
                                Please enter a valid email address.
                            </p>
                        )}
                    </label>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="font-body text-sm font-medium text-ink">
                                First name
                            </span>
                            <span className="text-xs text-ink-soft">
                                {firstName.length}/{FIRST_NAME_LIMIT}
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
                            setAccountView("change-password");
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
                                Update your password securely.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setAccountView("details");
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
                            type={showPassword ? "text" : "password"}
                            value={currentPassword}
                            onChange={(event) =>
                                setCurrentPassword(event.target.value)
                            }
                            className={inputClass}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={() => setAccountView("forgot-password")}
                        className="-mt-2 text-sm font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                    >
                        Forgot password?
                    </button>

                    <label className="block space-y-2">
                        <span className="font-body text-sm font-medium text-ink">
                            New password
                        </span>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            className={inputClass}
                        />
                    </label>

                    {password.length > 0 && (
                        <ul className="-mt-3 space-y-0.5">
                            {PASSWORD_REQUIREMENTS.map((req) => {
                                const satisfied = req.test(password);
                                return (
                                    <li
                                        key={req.label}
                                        className={`text-[11px] transition-colors ${
                                            satisfied
                                                ? "text-pin-todo"
                                                : "text-ink-soft"
                                        }`}
                                    >
                                        • {req.label}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <label className="block space-y-2">
                        <span className="font-body text-sm font-medium text-ink">
                            Confirm new password
                        </span>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) =>
                                setConfirmPassword(event.target.value)
                            }
                            className={inputClass}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="-mt-3 text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                    >
                        {showPassword ? "Hide password" : "Show password"}
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
                                We can help you start the recovery flow.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setAccountView("change-password")}
                            className="text-sm font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                        >
                            Back
                        </button>
                    </div>

                    <div className="rounded-2xl border border-paper-edge bg-board/40 p-4">
                        <p className="font-body text-sm text-ink-soft">
                            Password reset is handled through your
                            authentication provider. Return to the
                            change-password form whenever you are ready.
                        </p>
                        <button
                            type="button"
                            onClick={() => setAccountView("change-password")}
                            className="mt-3 rounded-full border border-paper-edge bg-paper px-4 py-2 font-body text-sm font-semibold text-ink transition hover:cursor-pointer hover:bg-paper/90"
                        >
                            Return to change password
                        </button>
                    </div>
                </>
            )}

            {accountError && (
                <p className="text-xs text-pin-timer">{accountError}</p>
            )}
            {accountSuccess && (
                <p className="text-xs text-pin-todo">{accountSuccess}</p>
            )}
        </div>
    );
});
