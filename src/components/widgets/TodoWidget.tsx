import { useTaskStore } from "../../store/taskStore";

interface TodoWidgetProps {
    onOpenFullList: () => void;
}

export function TodoWidget({ onOpenFullList }: TodoWidgetProps) {
    const tasks = useTaskStore((s) => s.tasks);
    const toggleDone = useTaskStore((s) => s.toggleDone);
    const focusTasks = tasks.filter((t) => t.focusToday);

    return (
        <div className="flex h-full flex-col font-body text-sm">
            {focusTasks.length === 0 ? (
                <p className="flex-1 text-ink-soft">All done for today!</p>
            ) : (
                <ul className="flex-1 space-y-1.5">
                    {focusTasks.map((task) => (
                        <li key={task.id} className="flex items-start gap-2">
                            <input
                                type="checkbox"
                                checked={task.done}
                                onChange={() => toggleDone(task.id)}
                                className="mt-0.5 h-3.5 w-3.5 accent-pin-todo"
                            />
                            <span
                                className={
                                    task.done
                                        ? "text-ink-soft line-through"
                                        : "text-ink"
                                }
                            >
                                {task.title}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex place-content-between">
                <button className="mt-2 self-start text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer">
                    Add new task
                </button>
                <button
                    onClick={onOpenFullList}
                    className="mt-2 self-start text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                >
                    Open full list
                </button>
            </div>
        </div>
    );
}
