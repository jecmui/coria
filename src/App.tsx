import { useState } from "react";
import { Board } from "./components/board/Board";
import { WidgetTray } from "./components/board/WidgetTray";
import { TaskListPage } from "./components/TaskListPage";

type View = "board" | "tasks";

export default function App() {
  const [view, setView] = useState<View>("board");

  if (view === "tasks") {
    return (
      <div className="h-screen bg-board">
        <TaskListPage onBack={() => setView("board")} />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-board">
      <Board onOpenFullList={() => setView("tasks")} />
      <WidgetTray />
    </div>
  );
}
