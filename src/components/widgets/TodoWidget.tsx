import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent, PointerEvent, RefObject } from "react";
import { useTaskStore } from "../../store/taskStore";
import { useAppearanceStore } from "../../store/appearanceStore";
import { useDragReorder } from "../../lib/useDragReorder";
import { ContextMenu } from "../ContextMenu";
import type { ContextMenuItem } from "../ContextMenu";

interface TodoWidgetProps {
    onOpenFullList: () => void;
}

/** How far a touch has to travel left before the row's actions are revealed. */
const SWIPE_THRESHOLD = 40;
/** Width of the revealed action strip, matched by the row's slide distance. */
const SWIPE_OFFSET = 76;
/** Sentinel for the widget-level (blank space) menu in openMenuKeyRef, which
 *  otherwise holds the id of whichever task's menu is open. */
const WIDGET_MENU_KEY = "__widget__";

function StarIcon() {
    return (
        <svg
            viewBox="0 0 576 512"
            width={14}
            height={14}
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg
            viewBox="0 0 448 512"
            width={14}
            height={14}
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M135.2 17.7L128 32 32 32C14.3 32 0 46.3 0 64s14.3 32 32 32l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-7.2-14.3C307.4 6.8 296.3 0 284.2 0L163.8 0c-12.1 0-23.2 6.8-28.6 17.7zM416 128L32 128 53.2 467c1.6 25.3 22.6 45 47.9 45l245.8 0c25.3 0 46.3-19.7 47.9-45L416 128z" />
        </svg>
    );
}

export function TodoWidget({ onOpenFullList }: TodoWidgetProps) {
    const tasks = useTaskStore((s) => s.tasks);
    const addTask = useTaskStore((s) => s.addTask);
    const toggleDone = useTaskStore((s) => s.toggleDone);
    const reorderFocusTasks = useTaskStore((s) => s.reorderFocusTasks);
    const sortCompletedToBottom = useTaskStore((s) => s.sortCompletedToBottom);
    const focusTasks = [...tasks]
        .filter((t) => t.focusToday)
        .sort((a, b) => {
            // Done tasks sink below not-done ones when the setting is on --
            // checked as the primary sort key, so it dynamically applies the
            // moment a task's done state changes, ahead of sortOrder/manual
            // placement within each group.
            if (sortCompletedToBottom && a.done !== b.done) {
                return a.done ? 1 : -1;
            }
            return a.sortOrder - b.sortOrder || a.createdAt - b.createdAt;
        });
    const {
        containerRef,
        displayItems: orderedFocusTasks,
        draggingId,
        dragHandleProps,
    } = useDragReorder(focusTasks, reorderFocusTasks);
    const updateTask = useTaskStore((s) => s.updateTask);
    const toggleFocusToday = useTaskStore((s) => s.toggleFocusToday);
    const clearFocusToday = useTaskStore((s) => s.clearFocusToday);
    const removeTask = useTaskStore((s) => s.removeTask);
    const confirmTaskDelete = useTaskStore((s) => s.confirmTaskDelete);
    const setConfirmTaskDelete = useTaskStore((s) => s.setConfirmTaskDelete);
    const snapToGrid = useAppearanceStore((s) => s.settings.snapToGrid);
    const toggleSnapToGrid = useAppearanceStore((s) => s.toggleSnapToGrid);
    const [draft, setDraft] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editingDraft, setEditingDraft] = useState("");
    const [menu, setMenu] = useState<
        | { kind: "task"; taskId: string; x: number; y: number }
        | { kind: "widget"; x: number; y: number }
        | null
    >(null);
    const [swipedTaskId, setSwipedTaskId] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [dontAskAgain, setDontAskAgain] = useState(false);
    // The task ids most recently cleared from today, so Cmd/Ctrl+Z can restore them.
    const [lastClear, setLastClear] = useState<string[] | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const editingInputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    // Mirrors which menu is open (a task id, or the widget-level sentinel) so a
    // second right-click on the same thing can be detected before React state
    // has caught up.
    const openMenuKeyRef = useRef<string | null>(null);
    const swipeStartRef = useRef<{ x: number; y: number; id: string } | null>(
        null,
    );
    const characterCount = draft.length;
    const CHARACTER_LIMIT = 250;
    const pendingDeleteTask = pendingDeleteId
        ? tasks.find((t) => t.id === pendingDeleteId)
        : undefined;
    const hasCompletedFocusTask = focusTasks.some((t) => t.done);

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

    // Restores the most recently cleared tasks to today's list on Cmd/Ctrl+Z,
    // as long as focus isn't in a text field (which should keep its own
    // native undo behavior).
    useEffect(() => {
        if (!lastClear) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            const isUndo =
                (event.metaKey || event.ctrlKey) &&
                !event.shiftKey &&
                event.key.toLowerCase() === "z";
            if (!isUndo) return;
            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
            ) {
                return;
            }
            event.preventDefault();
            lastClear.forEach((taskId) => toggleFocusToday(taskId));
            setLastClear(null);
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [lastClear, toggleFocusToday]);

    // Touching anything other than the swiped row slides it back closed.
    useEffect(() => {
        if (!swipedTaskId) return;

        const handlePointerDown = (event: globalThis.PointerEvent) => {
            const row = (
                event.target as HTMLElement | null
            )?.closest<HTMLElement>("[data-drag-id]");
            if (row?.dataset.dragId !== swipedTaskId) setSwipedTaskId(null);
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () =>
            document.removeEventListener("pointerdown", handlePointerDown);
    }, [swipedTaskId]);

    function closeMenu() {
        openMenuKeyRef.current = null;
        setMenu(null);
    }

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

    function handleTaskContextMenu(event: MouseEvent, taskId: string) {
        // Shift + right-click, right-clicking while editing, and a second
        // right-click on the same row all fall through to the browser's menu.
        if (
            event.shiftKey ||
            editingTaskId === taskId ||
            openMenuKeyRef.current === taskId
        ) {
            closeMenu();
            return;
        }
        event.preventDefault();
        setSwipedTaskId(null);
        openMenuKeyRef.current = taskId;
        setMenu({ kind: "task", taskId, x: event.clientX, y: event.clientY });
    }

    function handleWidgetContextMenu(event: MouseEvent) {
        const target = event.target as HTMLElement;
        // Task rows handle their own menu, and right-clicking into a text
        // field should keep showing the browser's native (cut/copy/paste) menu.
        if (
            target.closest("[data-drag-id]") ||
            target.closest("input, textarea")
        ) {
            return;
        }
        if (event.shiftKey || openMenuKeyRef.current === WIDGET_MENU_KEY) {
            closeMenu();
            return;
        }
        event.preventDefault();
        setSwipedTaskId(null);
        openMenuKeyRef.current = WIDGET_MENU_KEY;
        setMenu({ kind: "widget", x: event.clientX, y: event.clientY });
    }

    function handleRemoveFromToday(taskId: string) {
        toggleFocusToday(taskId);
        closeMenu();
        setSwipedTaskId(null);
    }

    function handleDeleteTask(taskId: string) {
        closeMenu();
        setSwipedTaskId(null);
        if (!confirmTaskDelete) {
            removeTask(taskId);
            return;
        }
        setDontAskAgain(false);
        setPendingDeleteId(taskId);
    }

    function handleConfirmDelete() {
        if (!pendingDeleteId) return;
        if (dontAskAgain) setConfirmTaskDelete(false);
        removeTask(pendingDeleteId);
        setPendingDeleteId(null);
    }

    function handleClearCompleted() {
        const taskIds = clearFocusToday("completed");
        if (taskIds.length === 0) return;
        setLastClear(taskIds);
        closeMenu();
        setSwipedTaskId(null);
    }

    function handleClearAll() {
        const taskIds = clearFocusToday("all");
        if (taskIds.length === 0) return;
        setLastClear(taskIds);
        closeMenu();
        setSwipedTaskId(null);
    }

    function handleToggleSnapToGrid() {
        void toggleSnapToGrid();
        closeMenu();
    }

    function handleSwipeStart(event: PointerEvent, taskId: string) {
        if (event.pointerType === "mouse") return;
        swipeStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            id: taskId,
        };
    }

    function handleSwipeMove(event: PointerEvent, taskId: string) {
        const start = swipeStartRef.current;
        if (!start || start.id !== taskId) return;

        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        // Vertical gestures belong to drag-reordering, not to the swipe actions.
        if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

        if (deltaX <= -SWIPE_THRESHOLD) {
            setSwipedTaskId(taskId);
            swipeStartRef.current = null;
        } else if (deltaX >= SWIPE_THRESHOLD) {
            setSwipedTaskId((current) => (current === taskId ? null : current));
            swipeStartRef.current = null;
        }
    }

    function handleSwipeEnd() {
        swipeStartRef.current = null;
    }

    return (
        <div
            ref={rootRef}
            data-context-menu-owner
            onContextMenu={handleWidgetContextMenu}
            className="flex h-full flex-col"
        >
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
                                <span className="pr-2.5 text-lg">+</span>
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

                <div className="flex-1">
                    {focusTasks.length === 0 ? (
                        <p className="text-ink-soft/80 items-center pt-2">
                            All done for today!
                        </p>
                    ) : (
                        <ul
                            ref={
                                containerRef as RefObject<HTMLUListElement | null>
                            }
                            className="pb-2 hover:cursor-grab"
                            style={{
                                userSelect: draggingId ? "none" : undefined,
                            }}
                        >
                            {orderedFocusTasks.map((task) => {
                                const isSwiped = swipedTaskId === task.id;
                                // A swiped-open row hands its gestures to the
                                // action buttons instead of to drag-reordering.
                                const drag = isSwiped
                                    ? null
                                    : dragHandleProps(task.id);

                                return (
                                    <li
                                        key={task.id}
                                        data-drag-id={task.id}
                                        onPointerDown={(event) => {
                                            drag?.onPointerDown(event);
                                            handleSwipeStart(event, task.id);
                                        }}
                                        onPointerMove={(event) =>
                                            handleSwipeMove(event, task.id)
                                        }
                                        onPointerUp={handleSwipeEnd}
                                        onPointerCancel={handleSwipeEnd}
                                        onClickCapture={drag?.onClickCapture}
                                        onContextMenu={(event) =>
                                            handleTaskContextMenu(
                                                event,
                                                task.id,
                                            )
                                        }
                                        className={`group/task relative touch-none ${
                                            draggingId === task.id
                                                ? "opacity-60"
                                                : ""
                                        }`}
                                    >
                                        <div
                                            className={`absolute inset-y-0 right-0 flex items-center gap-1 transition-opacity ${
                                                isSwiped
                                                    ? "opacity-100"
                                                    : "pointer-events-none opacity-0"
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleRemoveFromToday(
                                                        task.id,
                                                    )
                                                }
                                                aria-label="Remove from today"
                                                tabIndex={isSwiped ? 0 : -1}
                                                className="flex h-7 w-8 items-center justify-center rounded-md bg-pin-todo text-ink hover:cursor-pointer"
                                            >
                                                <StarIcon />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleDeleteTask(task.id)
                                                }
                                                aria-label="Delete task"
                                                tabIndex={isSwiped ? 0 : -1}
                                                className="flex h-7 w-8 items-center justify-center rounded-md bg-pin-timer text-paper hover:cursor-pointer"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>

                                        <div
                                            className="relative -mx-1.5 flex items-start gap-2 rounded-md bg-paper px-1.5 py-1 transition-[background-color,transform] duration-200 group-hover/task:bg-black/5"
                                            style={{
                                                transform: isSwiped
                                                    ? `translateX(-${SWIPE_OFFSET}px)`
                                                    : undefined,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={task.done}
                                                onChange={() =>
                                                    toggleDone(task.id)
                                                }
                                                className="mt-1 h-3.5 w-3.5 shrink-0 accent-pin-todo"
                                            />
                                            {editingTaskId === task.id ? (
                                                <input
                                                    ref={editingInputRef}
                                                    value={editingDraft}
                                                    onChange={(e) =>
                                                        setEditingDraft(
                                                            e.target.value,
                                                        )
                                                    }
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            handleSaveEdit(
                                                                task.id,
                                                            );
                                                        } else if (
                                                            e.key === "Escape"
                                                        ) {
                                                            e.preventDefault();
                                                            setEditingTaskId(
                                                                null,
                                                            );
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
                                                    className={`min-w-0 flex-1 text-left transition-opacity group-hover/task:opacity-75 hover:cursor-grab active:cursor-grabbing ${
                                                        task.done
                                                            ? "wrap-break-word text-ink-soft line-through"
                                                            : "wrap-break-word text-ink"
                                                    }`}
                                                >
                                                    {task.title}
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
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

            {menu &&
                (() => {
                    const clearItems: ContextMenuItem[] = [
                        {
                            key: "clear-completed",
                            label: "Clear completed",
                            disabled: !hasCompletedFocusTask,
                            onSelect: handleClearCompleted,
                        },
                        {
                            key: "clear-all",
                            label: "Clear all",
                            disabled: focusTasks.length === 0,
                            onSelect: handleClearAll,
                        },
                    ];
                    const snapToGridItem: ContextMenuItem = {
                        key: "snap-to-grid",
                        label: "Snap to grid",
                        checked: snapToGrid,
                        onSelect: handleToggleSnapToGrid,
                    };
                    const items: ContextMenuItem[] =
                        menu.kind === "task"
                            ? [
                                  {
                                      key: "remove-from-today",
                                      label: "Remove from today",
                                      onSelect: () =>
                                          handleRemoveFromToday(menu.taskId),
                                  },
                                  {
                                      key: "delete-task",
                                      label: "Delete task",
                                      danger: true,
                                      onSelect: () =>
                                          handleDeleteTask(menu.taskId),
                                  },
                                  ...clearItems,
                                  snapToGridItem,
                              ]
                            : [...clearItems, snapToGridItem];

                    return (
                        <ContextMenu
                            x={menu.x}
                            y={menu.y}
                            items={items}
                            onClose={closeMenu}
                            boundaryRef={rootRef}
                        />
                    );
                })()}

            {pendingDeleteTask &&
                createPortal(
                    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 px-4">
                        <div className="w-full max-w-sm rounded-lg border border-paper-edge bg-paper p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                            <h2 className="mb-2 font-display text-lg font-semibold text-ink">
                                Delete this task?
                            </h2>
                            <p className="mb-4 font-body text-sm text-ink-soft">
                                "{pendingDeleteTask.title}" will be permanently
                                deleted from your full task list.
                            </p>
                            <label className="mb-5 flex items-center gap-2 font-body text-sm text-ink-soft hover:cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={dontAskAgain}
                                    onChange={(e) =>
                                        setDontAskAgain(e.target.checked)
                                    }
                                    className="h-3.5 w-3.5 shrink-0 accent-pin-todo"
                                />
                                Don't ask again
                            </label>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPendingDeleteId(null)}
                                    className="rounded-md border border-paper-edge px-4 py-2 font-body text-sm font-medium text-ink hover:cursor-pointer hover:bg-black/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmDelete}
                                    className="rounded-md bg-pin-timer px-4 py-2 font-body text-sm font-medium text-paper hover:cursor-pointer"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
}
