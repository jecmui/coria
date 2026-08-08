import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";

const FIRST_NAME_LIMIT = 35;

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

export function AuthScreen() {
    const { signIn, signUp } = useAuth();
    const [mode, setMode] = useState<"signin" | "signup">("signin");

    const [firstName, setFirstName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    function resetMessages() {
        setError(null);
        setNotice(null);
    }

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
        const result =
            mode === "signin"
                ? await signIn(email, password)
                : await signUp(email, password);

        if (result.error) {
            setError(result.error);
        } else if (mode === "signup") {
            setNotice(
                "Check your inbox to verify your account before signing in!",
            );
        }
        setSubmitting(false);
    }

    const inputClass =
        "mb-3 w-full rounded-md border border-paper-edge bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--color-pin-todo)]";

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-board board-texture">
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
                            ? "mb-2 w-full rounded-md border border-paper-edge bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--color-pin-todo)]"
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

                <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="mb-4 -mt-1 text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                >
                    {showPassword ? "Hide password" : "Show password"}
                </button>

                {error && (
                    <p className="mb-3 text-xs text-[var(--color-pin-timer)]">
                        {error}
                    </p>
                )}
                {notice && (
                    <p className="mb-3 text-xs text-[var(--color-pin-note)]">
                        {notice}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-md bg-[var(--color-pin-todo)] py-2 text-sm font-medium text-ink disabled:opacity-60 hover:cursor-pointer"
                >
                    {submitting
                        ? "..."
                        : mode === "signin"
                          ? "Sign in"
                          : "Sign up"}
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setMode(mode === "signin" ? "signup" : "signin");
                        resetMessages();
                    }}
                    className="mt-3 w-full text-center text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                >
                    {mode === "signin"
                        ? "Need an account? Sign up"
                        : "Already have an account? Sign in"}
                </button>
            </form>
        </div>
    );
}
