import { useEffect, useRef, useState } from "react";
import { Board } from "./components/board/Board";
import { AddWidget } from "./components/board/AddWidget";
import { TaskListPage } from "./components/TaskListPage";
import { SettingsPage, type SettingsSection } from "./components/SettingsPage";
import { useAuth } from "./auth/AuthContext";
import { AuthScreen } from "./auth/AuthScreen";
import { useTaskStore } from "./store/taskStore";
import { useBoardStore } from "./store/boardStore";

type View = "board" | "tasks" | "settings";

export default function App() {
    const { user, loading, signOut } = useAuth();
    const firstName = user?.user_metadata?.first_name as string | undefined;
    const [view, setView] = useState<View>("board");
    const [navOpen, setNavOpen] = useState(false);
    const [settingsSection, setSettingsSection] =
        useState<SettingsSection>("account");
    const navRef = useRef<HTMLDivElement>(null);

    const loadTasks = useTaskStore((s) => s.loadTasks);
    const clearTasks = useTaskStore((s) => s.clear);
    const loadWidgets = useBoardStore((s) => s.loadWidgets);
    const clearWidgets = useBoardStore((s) => s.clear);
    const tasksLoading = useTaskStore((s) => s.loading);
    const widgetsLoading = useBoardStore((s) => s.loading);
    const dataLoading = tasksLoading || widgetsLoading;

    useEffect(() => {
        if (user) {
            loadTasks(user.id);
            loadWidgets(user.id);
        } else {
            clearTasks();
            clearWidgets();
        }
        // Re-run whenever the logged-in user changes (login, logout, or switching accounts)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    useEffect(() => {
        if (!navOpen) return;

        const handlePointerDown = (event: MouseEvent | TouchEvent) => {
            if (
                navRef.current &&
                !navRef.current.contains(event.target as Node)
            ) {
                setNavOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
        };
    }, [navOpen]);

    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-board">
                <span className="font-body text-sm text-paper/60">
                    Loading...
                </span>
            </div>
        );
    }

    if (!user) {
        return <AuthScreen />;
    }

    if (dataLoading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-board">
                <span className="font-body text-sm text-ink">
                    Loading your board...
                </span>
            </div>
        );
    }

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-board">
            <button
                onClick={signOut}
                className="fixed right-4 top-4 z-60 rounded-full border border-paper-edge bg-paper px-3 py-1.5 font-body text-xs font-medium text-ink-soft shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:text-ink hover:cursor-pointer"
            >
                Sign out
            </button>

            <div ref={navRef} className="fixed left-0 top-0 z-70 h-screen">
                {!navOpen ? (
                    <button
                        type="button"
                        aria-label="Open navigation"
                        onClick={() => setNavOpen(true)}
                        className="flex h-12 w-12 items-center justify-center rounded-r-2xl  bg-paper/95 text-xl text-ink shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition hover:cursor-pointer"
                    >
                        ☰
                    </button>
                ) : (
                    <div className="flex h-full w-56 flex-col rounded-r-2xl bg-paper/95 p-2 shadow-[0_8px_24px_rgba(0,0,0,0.2)] backdrop-blur">
                        <div className="mb-2 flex items-center justify-between px-2 py-1 border-b border-paper-edge">
                            <span className="font-body text-md font-medium text-ink-soft">
                                {firstName
                                    ? `Welcome, ${firstName}`
                                    : "Welcome"}
                            </span>
                            <button
                                type="button"
                                aria-label="Close navigation"
                                onClick={() => setNavOpen(false)}
                                className="rounded-full p-1 text-sm text-ink-soft transition hover:bg-black/5 hover:cursor-pointer hover:text-ink"
                            >
                                ×
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setView("board");
                                setNavOpen(false);
                            }}
                            className={`rounded-xl px-3 py-2 text-left font-body text-sm font-medium hover:cursor-pointer transition ${
                                view === "board"
                                    ? "bg-board text-ink"
                                    : "text-ink-soft hover:bg-black/5 hover:text-ink"
                            }`}
                        >
                            Board
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setView("tasks");
                                setNavOpen(false);
                            }}
                            className={`rounded-xl px-3 py-2 text-left font-body text-sm font-medium hover:cursor-pointer transition ${
                                view === "tasks"
                                    ? "bg-board text-ink"
                                    : "text-ink-soft hover:bg-black/5 hover:text-ink"
                            }`}
                        >
                            Tasks
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setView("settings");
                                setSettingsSection("account");
                                setNavOpen(false);
                            }}
                            className={`rounded-xl px-3 py-2 text-left font-body text-sm font-medium hover:cursor-pointer transition ${
                                view === "settings"
                                    ? "bg-board text-ink"
                                    : "text-ink-soft hover:bg-black/5 hover:text-ink"
                            }`}
                        >
                            Settings
                        </button>

                        {view === "settings" && (
                            <div className="mt-2 flex flex-col gap-1 border-l border-paper-edge pl-3 pt-2">
                                {(
                                    [
                                        ["account", "Account"],
                                        ["preferences", "Preferences"],
                                        ["pomodoro", "Pomodoro"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setSettingsSection(key)}
                                        className={`flex w-full items-center rounded-xl px-3 py-2 text-left font-body text-sm transition ${
                                            settingsSection === key
                                                ? "bg-board text-ink"
                                                : "text-ink-soft hover:bg-black/5 hover:text-ink"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {view === "tasks" ? (
                <div className="h-full w-full">
                    <TaskListPage onBack={() => setView("board")} />
                </div>
            ) : view === "settings" ? (
                <SettingsPage
                    activeSection={settingsSection}
                    onSelectSection={setSettingsSection}
                />
            ) : (
                <div className="relative z-0 h-full w-full">
                    <Board onOpenFullList={() => setView("tasks")} />
                </div>
            )}

            {view === "board" && <AddWidget />}
        </div>
    );
}
