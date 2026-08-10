import { useState } from "react";

export type SettingsSection = "account" | "preferences" | "pomodoro";

interface SettingsPageProps {
    activeSection: SettingsSection;
    onSelectSection: (section: SettingsSection) => void;
}

const SECTIONS: { key: SettingsSection; label: string }[] = [
    { key: "account", label: "Account" },
    { key: "preferences", label: "Preferences" },
    { key: "pomodoro", label: "Pomodoro" },
];

export function SettingsPage({
    activeSection,
    onSelectSection,
}: SettingsPageProps) {
    const [email, setEmail] = useState("you@example.com");
    const [firstName, setFirstName] = useState("Alex");
    const [password, setPassword] = useState("");
    const [focusTime, setFocusTime] = useState(25);
    const [shortBreak, setShortBreak] = useState(5);
    const [longBreak, setLongBreak] = useState(15);
    const [autoStartBreaks, setAutoStartBreaks] = useState(false);
    const [autoStartFocus, setAutoStartFocus] = useState(false);
    const [longBreakInterval, setLongBreakInterval] = useState(4);

    return (
        <div className="flex h-full w-full flex-col bg-board px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex h-full w-full max-w-6xl flex-col rounded-[28px] border border-paper-edge/80 bg-paper/90 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)] backdrop-blur sm:p-6">
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
                        className="rounded-full border border-paper-edge bg-paper px-4 py-2 font-body text-sm font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition hover:cursor-pointer hover:bg-paper/90"
                    >
                        Save Changes
                    </button>
                </div>

                <div className="flex flex-1 flex-col gap-6 lg:flex-row">
                    <div className="flex min-h-55 flex-col rounded-2xl border border-paper-edge bg-board/50 p-3 lg:w-56">
                        {SECTIONS.map((section) => (
                            <button
                                key={section.key}
                                type="button"
                                onClick={() => onSelectSection(section.key)}
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

                    <div className="flex-1 rounded-2xl border border-paper-edge bg-paper/70 p-4 sm:p-6">
                        {activeSection === "account" && (
                            <div className="space-y-5">
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
                                        onChange={(event) =>
                                            setEmail(event.target.value)
                                        }
                                        className="w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="font-body text-sm font-medium text-ink">
                                        First name
                                    </span>
                                    <input
                                        type="text"
                                        value={firstName}
                                        onChange={(event) =>
                                            setFirstName(event.target.value)
                                        }
                                        className="w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="font-body text-sm font-medium text-ink">
                                        Password
                                    </span>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(event) =>
                                            setPassword(event.target.value)
                                        }
                                        placeholder="Enter a new password"
                                        className="w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none"
                                    />
                                </label>
                            </div>
                        )}

                        {activeSection === "preferences" && (
                            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-paper-edge bg-board/40 p-8 text-center">
                                <p className="font-body text-base text-ink-soft">
                                    Coming soon.
                                </p>
                            </div>
                        )}

                        {activeSection === "pomodoro" && (
                            <div className="space-y-5">
                                <div>
                                    <h2 className="font-body text-lg font-semibold text-ink">
                                        Pomodoro
                                    </h2>
                                    <p className="mt-1 font-body text-sm text-ink-soft">
                                        Tune the timer behavior to match your
                                        flow.
                                    </p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block space-y-2">
                                        <span className="font-body text-sm font-medium text-ink">
                                            Focus Time
                                        </span>
                                        <input
                                            type="number"
                                            min="1"
                                            value={focusTime}
                                            onChange={(event) =>
                                                setFocusTime(
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none"
                                        />
                                    </label>

                                    <label className="block space-y-2">
                                        <span className="font-body text-sm font-medium text-ink">
                                            Short Break Time
                                        </span>
                                        <input
                                            type="number"
                                            min="1"
                                            value={shortBreak}
                                            onChange={(event) =>
                                                setShortBreak(
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none"
                                        />
                                    </label>

                                    <label className="block space-y-2">
                                        <span className="font-body text-sm font-medium text-ink">
                                            Long Break Time
                                        </span>
                                        <input
                                            type="number"
                                            min="1"
                                            value={longBreak}
                                            onChange={(event) =>
                                                setLongBreak(
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none"
                                        />
                                    </label>

                                    <label className="block space-y-2">
                                        <span className="font-body text-sm font-medium text-ink">
                                            Interval for long breaks
                                        </span>
                                        <input
                                            type="number"
                                            min="1"
                                            value={longBreakInterval}
                                            onChange={(event) =>
                                                setLongBreakInterval(
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none"
                                        />
                                    </label>
                                </div>

                                <div className="space-y-3 rounded-2xl border border-paper-edge bg-board/40 p-4">
                                    <label className="flex items-center justify-between gap-3 rounded-xl bg-paper/70 px-3 py-2">
                                        <span className="font-body text-sm text-ink">
                                            Auto-start breaks
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={autoStartBreaks}
                                            onChange={(event) =>
                                                setAutoStartBreaks(
                                                    event.target.checked,
                                                )
                                            }
                                            className="h-4 w-4 rounded border-paper-edge"
                                        />
                                    </label>

                                    <label className="flex items-center justify-between gap-3 rounded-xl bg-paper/70 px-3 py-2">
                                        <span className="font-body text-sm text-ink">
                                            Auto-start focus
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={autoStartFocus}
                                            onChange={(event) =>
                                                setAutoStartFocus(
                                                    event.target.checked,
                                                )
                                            }
                                            className="h-4 w-4 rounded border-paper-edge"
                                        />
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
