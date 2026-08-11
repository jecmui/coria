import { useEffect, useRef, useState } from "react";
import { useTaskStore } from "../../store/taskStore";

interface TodoWidgetProps {
    onOpenFullList: () => void;
}

export function TodoWidget({ onOpenFullList }: TodoWidgetProps) {
    const tasks = useTaskStore((s) => s.tasks);
    const addTask = useTaskStore((s) => s.addTask);
    const toggleDone = useTaskStore((s) => s.toggleDone);
    const focusTasks = tasks.filter((t) => t.focusToday);
    const updateTask = useTaskStore((s) => s.updateTask);
    const [draft, setDraft] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editingDraft, setEditingDraft] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const editingInputRef = useRef<HTMLInputElement>(null);
    const characterCount = draft.length;
    const CHARACTER_LIMIT = 250;

    useEffect(() => {
        if (isAdding) {
            inputRef.current?.focus();
        }
    }, [isAdding]);

    useEffect(() => {
        if (editingTaskId) {
            editingInputRef.current?.focus();
        }
    }, [editingTaskId]);

    function handleAdd() {
        const title = draft.trim();
        if (!title) return;
        addTask(title, true);
        setDraft("");
        setIsAdding(false);
    }

    function handleCancel() {
        setDraft("");
        setIsAdding(false);
    }

    function handleStartEdit(taskId: string, title: string) {
        setEditingTaskId(taskId);
        setEditingDraft(title);
    }

    function handleSaveEdit(taskId: string) {
        const trimmedTitle = editingDraft.trim();
        if (!trimmedTitle) return;
        updateTask(taskId, trimmedTitle);
        setEditingTaskId(null);
        setEditingDraft("");
    }

    return (
        <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-hidden font-body text-sm hover:overflow-y-auto scrollbar-gutter-stable scrollbar-thin scrollbar-thumb-pin-todo scrollbar-track-transparent">
                <div className="flex items-center gap-2">
                    {isAdding ? (
                        <>
                            <input
                                ref={inputRef}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAdd();
                                    } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        handleCancel();
                                    }
                                }}
                                onBlur={() => {
                                    if (draft.trim()) {
                                        handleAdd();
                                    } else {
                                        handleCancel();
                                    }
                                }}
                                placeholder="Add a task..."
                                maxLength={CHARACTER_LIMIT}
                                className="min-w-0 flex-1 rounded-md border border-paper-edge focus:border-pin-todo bg-paper px-2 py-1 text-sm text-ink focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleAdd}
                                className="shrink-0 rounded-md bg-pin-todo px-2.5 py-1 text-sm font-medium text-ink hover:cursor-pointer"
                            >
                                Add
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setIsAdding(true)}
                                className="flex min-w-0 flex-1 items-center hover:cursor-pointer text-ink-soft"
                            >
                                <span className="pr-1">
                                    <img
                                        src="/plus-solid-full.svg"
                                        width={18}
                                        height={18}
                                        alt=""
                                    />
                                </span>
                                <span>Add new task</span>
                            </button>
                        </>
                    )}
                </div>

                {isAdding ? (
                    <div className="mt-1 flex justify-start text-[11px] text-ink-soft">
                        <span
                            className={
                                characterCount >= CHARACTER_LIMIT
                                    ? "text-ink"
                                    : ""
                            }
                        >
                            {characterCount}/250
                        </span>
                    </div>
                ) : null}

                <div className="mt-2 flex-1">
                    {focusTasks.length === 0 ? (
                        <p className="text-ink-soft/80 items-center pt-2">
                            All done for today!
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {focusTasks.map((task) => (
                                <li
                                    key={task.id}
                                    className="flex items-start gap-2"
                                >
                                    <input
                                        type="checkbox"
                                        checked={task.done}
                                        onChange={() => toggleDone(task.id)}
                                        className="mt-1 h-3.5 w-3.5 shrink-0 accent-pin-todo"
                                    />
                                    {editingTaskId === task.id ? (
                                        <input
                                            ref={editingInputRef}
                                            value={editingDraft}
                                            onChange={(e) =>
                                                setEditingDraft(e.target.value)
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    handleSaveEdit(task.id);
                                                } else if (e.key === "Escape") {
                                                    e.preventDefault();
                                                    setEditingTaskId(null);
                                                    setEditingDraft("");
                                                }
                                            }}
                                            onBlur={() => {
                                                handleSaveEdit(task.id);
                                            }}
                                            maxLength={250}
                                            className="min-w-0 flex-1 border-none focus:border-none outline-none bg-paper text-sm text-ink text-wrap"
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleStartEdit(
                                                    task.id,
                                                    task.title,
                                                )
                                            }
                                            className={`min-w-0 flex-1 text-left hover:cursor-text ${
                                                task.done
                                                    ? "wrap-break-word text-ink-soft line-through"
                                                    : "wrap-break-word text-ink"
                                            }`}
                                        >
                                            {task.title}
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <div className="sticky bottom-0 bg-paper/95 pt-2">
                <button
                    type="button"
                    onClick={onOpenFullList}
                    className="w-full text-left text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink hover:cursor-pointer"
                >
                    Open full list
                </button>
            </div>
        </div>
    );
}
