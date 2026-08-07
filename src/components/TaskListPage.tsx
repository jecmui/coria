import { useState } from "react";
import { useTaskStore } from "../store/taskStore";

interface TaskListPageProps {
  onBack: () => void;
}

export function TaskListPage({ onBack }: TaskListPageProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const toggleDone = useTaskStore((s) => s.toggleDone);
  const toggleFocusToday = useTaskStore((s) => s.toggleFocusToday);
  const removeTask = useTaskStore((s) => s.removeTask);
  const [draft, setDraft] = useState("");
  const CHARACTER_LIMIT = 250;

  function handleAdd() {
    const title = draft.trim();
    if (!title) return;
    addTask(title);
    setDraft("");
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-10 font-body text-ink">
      <button
        onClick={onBack}
        className="mb-6 self-start text-sm font-medium text-paper/70 underline decoration-dotted hover:text-paper"
      >
        ← Back to board
      </button>
      <h1 className="mb-1 font-display text-2xl font-semibold text-paper">Full task list</h1>
      <p className="mb-6 text-sm text-paper/60">
        Everything lives here. Star what you want to focus on today — it'll show up on the board.
      </p>

      <div className="mb-6 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a task..."
          maxLength={CHARACTER_LIMIT}
          className="flex-1 rounded-md border border-paper-edge bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--color-pin-todo)]"
        />
        <button
          onClick={handleAdd}
          className="rounded-md bg-[var(--color-pin-todo)] px-4 py-2 text-sm font-medium text-ink"
        >
          Add
        </button>
      </div>

      <ul className="flex-1 space-y-1.5 overflow-auto">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-3 rounded-md bg-paper px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleDone(task.id)}
              className="h-3.5 w-3.5 accent-[var(--color-pin-todo)]"
            />
            <span className={`flex-1 ${task.done ? "text-ink-soft line-through" : "text-ink"}`}>
              {task.title}
            </span>
            <button
              onClick={() => toggleFocusToday(task.id)}
              aria-label="Toggle focus for today"
              className={`text-lg leading-none ${
                task.focusToday ? "text-[var(--color-pin-todo)]" : "text-paper-edge"
              }`}
            >
              ★
            </button>
            <button
              onClick={() => removeTask(task.id)}
              aria-label="Delete task"
              className="text-ink-soft hover:text-ink"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
