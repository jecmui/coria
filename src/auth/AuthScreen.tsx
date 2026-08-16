import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";

const FIRST_NAME_LIMIT = 35;
const RESEND_COOLDOWN_SECONDS = 50;

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

type Mode =
    | "signin"
    | "signup"
    | "confirmEmail"
    | "requestPasswordReset"
    | "resetPassword";

export function AuthScreen() {
    const { signIn } = useAuth();
    const [mode, setMode] = useState<Mode>("signin");

    const [firstName, setFirstName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const [resendError, setResendError] = useState<string | null>(null);
    const [resending, setResending] = useState(false);
    const [unverifiedExisting, setUnverifiedExisting] = useState(false);

    function resetMessages() {
        setError(null);
        setResendError(null);
        setSuccessMessage(null);
    }

    // Countdown ticks once a second while on the confirm-email screen and cooldownSeconds > 0
    useEffect(() => {
        if (mode !== "confirmEmail" || cooldownSeconds <= 0) return;
        const timeout = setTimeout(
            () => setCooldownSeconds((s) => s - 1),
            1000,
        );
        return () => clearTimeout(timeout);
    }, [mode, cooldownSeconds]);

    useEffect(() => {
        let active = true;

        async function detectRecoverySession() {
            const {
                data: { session },
                error,
            } = await supabase.auth.getSession();
            if (!active) return;

            if (error) {
                setError(error.message);
                return;
            }

            if (session) {
                setMode("resetPassword");
                return;
            }

            const hash = window.location.hash;
            if (
                hash.includes("access_token") ||
                hash.includes("type=recovery")
            ) {
                setMode("resetPassword");
            }
        }

        void detectRecoverySession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") {
                setMode("resetPassword");
            }
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        resetMessages();

        if (mode === "signup") {
            if (!firstName.trim()) {
                setError("Please enter your first name.");
                return;
            }
            const unmetRequirement = PASSWORD_REQUIREMENTS.find(
                (req) => !req.test(password),
            );
            if (unmetRequirement) {
                setError(
                    "Your password doesn't meet all the requirements above.",
                );
                return;
            }
            if (password !== confirmPassword) {
                setError("Passwords don't match.");
                return;
            }
        }

        setSubmitting(true);

        if (mode === "signin") {
            const result = await signIn(email, password);
            if (result.error) setError(result.error);
            setSubmitting(false);
            return;
        }

        // Supabase returns a 200 with no error when signing up with an email that
        // already has an account (to avoid leaking which emails are registered), so
        // the only way to detect it is checking for an empty identities array on the
        // returned user. Calling supabase directly here (rather than through
        // useAuth().signUp) is what exposes that raw response.
        const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { first_name: firstName } },
        });

        if (signUpError) {
            setError(signUpError.message);
        } else if (
            data.user &&
            data.user.identities &&
            data.user.identities.length === 0
        ) {
            setError(
                "An account with this email already exists. Try signing in instead.",
            );
        } else {
            // A brand-new account has a created_at timestamp from right now. If the
            // returned user was created well in the past, this signUp call actually
            // hit an existing-but-unconfirmed account and just triggered a resend.
            const createdRecently =
                !!data.user &&
                Date.now() - new Date(data.user.created_at).getTime() < 10_000;
            setUnverifiedExisting(!createdRecently);
            setMode("confirmEmail");
            setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
        }
        setSubmitting(false);
    }

    async function handleResend() {
        if (cooldownSeconds > 0 || resending) return;
        setResendError(null);
        setResending(true);
        const { error: resendErr } = await supabase.auth.resend({
            type: "signup",
            email,
        });
        if (resendErr) {
            setResendError(resendErr.message);
        } else {
            setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
        }
        setResending(false);
    }

    async function handlePasswordResetRequest(e: FormEvent) {
        e.preventDefault();
        resetMessages();

        if (!email.trim()) {
            setError("Please enter your email.");
            return;
        }

        setSubmitting(true);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
            email,
            {
                redirectTo: `${window.location.origin}/`,
            },
        );

        if (resetError) {
            setError(resetError.message);
        } else {
            setSuccessMessage("Check your inbox for a password reset link.");
            setMode("signin");
        }

        setSubmitting(false);
    }

    async function handleResetPassword(e: FormEvent) {
        e.preventDefault();
        resetMessages();

        const unmetRequirement = PASSWORD_REQUIREMENTS.find(
            (req) => !req.test(password),
        );
        if (unmetRequirement) {
            setError("Your password doesn't meet all the requirements above.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords don't match.");
            return;
        }

        setSubmitting(true);
        const { error: updateError } = await supabase.auth.updateUser({
            password,
        });

        if (updateError) {
            setError(updateError.message);
        } else {
            await supabase.auth.signOut();
            setPassword("");
            setConfirmPassword("");
            setShowPassword(false);
            setMode("signin");
            setSuccessMessage("Successfully reset passowrd");
            window.setTimeout(() => {
                setSuccessMessage(null);
            }, 3000);
        }

        setSubmitting(false);
    }

    const inputClass =
        "mb-3 w-full rounded-md border border-[#e8e1d0] bg-white px-3 py-2 text-sm text-[#232320] [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-[var(--color-pin-todo)] autofill:[-webkit-text-fill-color:#232320] autofill:[-webkit-box-shadow:0_0_0px_1000px_#fff_inset] autofill:[caret-color:#232320]";

    if (mode === "confirmEmail") {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-board board-texture">
                <div className="relative w-full max-w-sm rounded-lg border border-paper-edge bg-paper p-6 pt-12 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                    <button
                        type="button"
                        onClick={() => {
                            setMode("signup");
                            setUnverifiedExisting(false);
                            resetMessages();
                        }}
                        className="absolute left-4 top-4 text-xs font-medium text-ink-soft hover:text-ink hover:cursor-pointer"
                    >
                        ← Back
                    </button>

                    <h1 className="mb-2 font-display text-2xl font-semibold text-ink">
                        almost there..
                    </h1>
                    {unverifiedExisting ? (
                        <p className="mb-5 text-sm text-ink-soft">
                            Your email was previously registered, but isn't
                            verified yet. You won't be able to sign in before
                            verifying.
                            <br />
                            <br />
                            We've sent a new email. Check your inbox to verify
                            your email and sign in.
                        </p>
                    ) : (
                        <p className="mb-5 text-sm text-ink-soft">
                            Check your inbox to verify your email and sign in.
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={cooldownSeconds > 0 || resending}
                        className="w-full rounded-md bg-pin-todo py-2 text-sm font-medium text-[#232320] [color-scheme:light] disabled:opacity-60"
                    >
                        {resending
                            ? "Sending..."
                            : cooldownSeconds > 0
                              ? `Resend email (${cooldownSeconds}s)`
                              : "Resend email"}
                    </button>

                    {resendError && (
                        <p className="mt-3 text-xs text-pin-timer">
                            {resendError}
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            setMode("signin");
                            setUnverifiedExisting(false);
                            resetMessages();
                        }}
                        className="mt-3 w-full text-center text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                    >
                        Already have an account? Sign in
                    </button>
                </div>
            </div>
        );
    }

    if (mode === "requestPasswordReset") {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-board board-texture">
                <div className="relative w-full max-w-sm rounded-lg border border-paper-edge bg-paper p-6 pt-12 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                    <button
                        type="button"
                        onClick={() => {
                            setMode("signin");
                            resetMessages();
                        }}
                        className="absolute left-4 top-4 text-xs font-medium text-ink-soft hover:text-ink hover:cursor-pointer"
                    >
                        ← Back
                    </button>

                    <h1 className="mb-2 font-display text-2xl font-semibold text-ink">
                        request password reset
                    </h1>
                    <p className="mb-5 text-sm text-ink-soft">
                        Enter your email for a link to reset your password.
                    </p>

                    <form onSubmit={handlePasswordResetRequest} noValidate>
                        <label className="mb-1 block text-xs font-medium text-ink-soft">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputClass}
                        />

                        {error && (
                            <p className="mb-3 text-xs text-pin-timer">
                                {error}
                            </p>
                        )}

                        {successMessage && (
                            <p className="mb-3 text-xs text-pin-todo">
                                {successMessage}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full rounded-md bg-pin-todo py-2 text-sm font-medium disabled:opacity-60 hover:cursor-pointer text-[#232320] [color-scheme:light]"
                        >
                            {submitting ? "..." : "Send Email"}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (mode === "resetPassword") {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-board board-texture">
                <form
                    onSubmit={handleResetPassword}
                    noValidate
                    className="w-full max-w-sm rounded-lg border border-paper-edge bg-paper p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                >
                    <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
                        reset password
                    </h1>
                    <p className="mb-5 text-sm text-ink-soft">
                        Choose a new password for your account.
                    </p>

                    <label className="mb-1 block text-xs font-medium text-ink-soft">
                        Password
                    </label>
                    <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mb-2 w-full rounded-md border border-paper-edge bg-white px-3 py-2 text-sm text-[#232320] [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-pin-todo autofill:[-webkit-text-fill-color:#232320] autofill:[-webkit-box-shadow:0_0_0px_1000px_#fff_inset] autofill:caret-ink"
                    />

                    <ul className="mb-3 space-y-0.5">
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

                    <label className="mb-1 block text-xs font-medium text-ink-soft">
                        Retype password
                    </label>
                    <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={inputClass}
                    />
                    <div
                        className="hover:cursor-pointer flex flex-row items-start mb-4 gap-1.5"
                        onClick={() => setShowPassword((s) => !s)}
                    >
                        <input
                            type="checkbox"
                            checked={showPassword}
                            className="h-3.5 w-3.5 shrink-0 accent-pin-todo hover:cursor-pointer"
                        />
                        <button
                            type="button"
                            className="text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                        >
                            Show password
                        </button>
                    </div>

                    {error && (
                        <p className="mb-3 text-xs text-pin-timer">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-md bg-pin-todo py-2 text-sm font-medium text-ink disabled:opacity-60 hover:cursor-pointer"
                    >
                        {submitting ? "..." : "Reset password"}
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-board board-texture">
            {successMessage && (
                <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md border border-paper-edge bg-paper px-4 py-2 text-sm font-medium text-ink shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                    {successMessage}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                noValidate
                className="w-full max-w-sm rounded-lg border border-paper-edge bg-paper p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            >
                <h1 className="mb-1 font-display text-2xl font-semibold text-ink">
                    {mode === "signin" ? "welcome back :)" : "create account"}
                </h1>
                <p className="mb-5 text-sm text-ink-soft">
                    {mode === "signin"
                        ? "Sign in to see your board."
                        : "Sign up to save your board."}
                </p>

                {mode === "signup" && (
                    <>
                        <div className="mb-1 flex items-center justify-between">
                            <label className="block text-xs font-medium text-ink-soft">
                                First name
                            </label>
                            <span className="text-xs text-ink-soft">
                                {firstName.length}/{FIRST_NAME_LIMIT}
                            </span>
                        </div>
                        <input
                            type="text"
                            value={firstName}
                            maxLength={FIRST_NAME_LIMIT}
                            onChange={(e) =>
                                setFirstName(
                                    e.target.value.slice(0, FIRST_NAME_LIMIT),
                                )
                            }
                            className={inputClass}
                        />
                    </>
                )}

                <label className="mb-1 block text-xs font-medium text-ink-soft">
                    Email
                </label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                />

                <label className="mb-1 block text-xs font-medium text-ink-soft">
                    Password
                </label>
                <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={
                        mode === "signup"
                            ? "mb-2 w-full rounded-md border border-paper-edge bg-white px-3 py-2 text-sm text-[#232320] [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-pin-todo autofill:[-webkit-text-fill-color:#232320] autofill:[-webkit-box-shadow:0_0_0px_1000px_#fff_inset] autofill:caret-ink"
                            : inputClass
                    }
                />

                {mode === "signup" && (
                    <ul className="mb-3 space-y-0.5">
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

                {mode === "signup" && (
                    <>
                        <label className="mb-1 block text-xs font-medium text-ink-soft">
                            Retype password
                        </label>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={inputClass}
                        />
                    </>
                )}

                <div
                    className="hover:cursor-pointer flex flex-row items-start mb-4 gap-1.5"
                    onClick={() => setShowPassword((s) => !s)}
                >
                    <input
                        type="checkbox"
                        checked={showPassword}
                        className="h-3.5 w-3.5 shrink-0 accent-pin-todo hover:cursor-pointer"
                    />
                    <button
                        type="button"
                        className="text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                    >
                        Show password
                    </button>
                </div>

                {error && (
                    <p className="mb-3 text-xs text-pin-timer">{error}</p>
                )}

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-md bg-pin-todo py-2 text-sm font-medium disabled:opacity-60 hover:cursor-pointer mb-2 text-[#232320] [color-scheme:light]"
                >
                    {submitting
                        ? "..."
                        : mode === "signin"
                          ? "Sign in"
                          : "Sign up"}
                </button>

                {mode === "signin" && (
                    <button
                        type="button"
                        onClick={() => {
                            setMode("requestPasswordReset");
                            resetMessages();
                        }}
                        className="mt-1 w-full text-center text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                    >
                        Forgot password?
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => {
                        setMode(mode === "signin" ? "signup" : "signin");
                        resetMessages();
                    }}
                    className="mt-1 w-full text-center text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                >
                    {mode === "signin"
                        ? "Need an account? Sign up"
                        : "Already have an account? Sign in"}
                </button>
            </form>
        </div>
    );
}
