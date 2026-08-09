import { useEffect, useState } from "react";
import { Board } from "./components/board/Board";
import { WidgetTray } from "./components/board/WidgetTray";
import { TaskListPage } from "./components/TaskListPage";
import { useAuth } from "./auth/AuthContext";
import { AuthScreen } from "./auth/AuthScreen";
import { useTaskStore } from "./store/taskStore";
import { useBoardStore } from "./store/boardStore";

type View = "board" | "tasks";

export default function App() {
    const { user, loading, signOut } = useAuth();
    const [view, setView] = useState<View>("board");

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
                <span className="font-body text-sm text-paper/60">
                    Loading your board...
                </span>
            </div>
        );
    }

    if (view === "tasks") {
        return (
            <div className="h-screen bg-board">
                <TaskListPage onBack={() => setView("board")} />
            </div>
        );
    }

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-board">
            <button
                onClick={signOut}
                className="fixed right-4 top-4 z-50 rounded-full border border-paper-edge bg-paper px-3 py-1.5 font-body text-xs font-medium text-ink-soft hover:text-ink"
            >
                Sign out
            </button>
            <Board onOpenFullList={() => setView("tasks")} />
            <WidgetTray />
        </div>
    );
}
