import { useState } from "react";
import { Board } from "./components/board/Board";
import { WidgetTray } from "./components/board/WidgetTray";
import { TaskListPage } from "./components/TaskListPage";
import { useAuth } from "./auth/AuthContext";
import { AuthScreen } from "./auth/AuthScreen";

type View = "board" | "tasks";

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [view, setView] = useState<View>("board");

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-board">
        <span className="font-body text-sm text-paper/60">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
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
