import { useEffect, useMemo, useRef, useState } from "react";
import { useBoardStore, NOW_WIDGET_HEIGHT } from "../../store/boardStore";
import { useTaskStore } from "../../store/taskStore";
import type { NowData } from "../../types";

export { NOW_WIDGET_HEIGHT };

/** How often the running stopwatch banks its progress to the widget's saved
 *  data. The tab closing pauses the stopwatch rather than stopping it, so
 *  whatever was last banked is what comes back -- this bounds how much can
 *  be lost to an abrupt close. Every ordinary exit (pause, stop, switching
 *  tabs, closing the tab) banks immediately as well, so this only matters
 *  for a crash or a force quit. */
const PERSIST_INTERVAL_MS = 5000;

/** Redraws often enough that the seconds digit never visibly lags. The time
 *  shown is always computed from timestamps, so the interval only controls
 *  smoothness, never accuracy. */
const TICK_MS = 250;

function formatElapsed(totalMs: number): string {
    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");
}

interface NowWidgetProps {
    widgetId: string;
    data: NowData;
}

export function NowWidget({ widgetId, data }: NowWidgetProps) {
    const updateData = useBoardStore((s) => s.updateData);
    const tasks = useTaskStore((s) => s.tasks);
    const addTask = useTaskStore((s) => s.addTask);

    const [title, setTitle] = useState(data.title);
    const [taskId, setTaskId] = useState<string | null>(data.taskId);
    /** Time banked by earlier runs. The current run's time is added on top. */
    const [bankedMs, setBankedMs] = useState(data.elapsedMs);
    /** When the current run began, or null while paused/idle. */
    const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const running = runStartedAt !== null;
    const elapsedMs =
        bankedMs + (runStartedAt === null ? 0 : now - runStartedAt);
    /** A stopwatch that has been started at least once, even if now paused --
     *  what tells "paused mid-task" apart from "idle". */
    const active = running || bankedMs > 0;

    // Redraw while running. The displayed time comes from `now - runStartedAt`
    // rather than a counter, so a throttled background tab catches up to the
    // real elapsed time on its next tick instead of drifting behind.
    useEffect(() => {
        if (!running) return;
        const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
        return () => window.clearInterval(id);
    }, [running]);

    // Everything the persistence effects below need, without them having to
    // re-subscribe every time the elapsed time changes.
    const latest = useRef({ title, taskId, bankedMs, runStartedAt });
    latest.current = { title, taskId, bankedMs, runStartedAt };

    /** Banks the run so far so a reload restores it, paused. */
    function persist() {
        const current = latest.current;
        const elapsed =
            current.bankedMs +
            (current.runStartedAt === null
                ? 0
                : Date.now() - current.runStartedAt);
        updateData(widgetId, {
            title: current.title,
            taskId: current.taskId,
            elapsedMs: elapsed,
        } as Partial<NowData>);
    }

    useEffect(() => {
        if (!running) return;
        const id = window.setInterval(persist, PERSIST_INTERVAL_MS);
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running]);

    // Closing or hiding the tab banks immediately, so the common case loses
    // nothing. pagehide covers the close; visibilitychange also fires when
    // switching away, which keeps a long background run checkpointed.
    useEffect(() => {
        function bank() {
            if (latest.current.runStartedAt !== null) persist();
        }
        function onVisibility() {
            if (document.visibilityState === "hidden") bank();
        }
        window.addEventListener("pagehide", bank);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("pagehide", bank);
            document.removeEventListener("visibilitychange", onVisibility);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Today's unfinished tasks, narrowed by what's been typed. This is the
    // same set the Today widget shows, so a suggestion always names
    // something the user can actually see and tick off there.
    const suggestions = useMemo(() => {
        const query = title.trim().toLowerCase();
        return tasks
            .filter((task) => task.focusToday && !task.done)
            .filter(
                (task) => !query || task.title.toLowerCase().includes(query),
            )
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }, [tasks, title]);

    const trimmed = title.trim();
    /** Creating is offered only when what's typed matches nothing in today's
     *  list at all. While a partial match is still on show, the likely intent
     *  is to pick it rather than to make a near-duplicate beside it.
     *  Committing with Enter still creates, so a genuinely new task whose
     *  name happens to sit inside an existing one is never unreachable. */
    const canCreate = trimmed.length > 0 && suggestions.length === 0;
    const showSuggestions =
        suggestionsOpen && (suggestions.length > 0 || canCreate);

    function chooseTask(nextTitle: string, nextTaskId: string | null) {
        setTitle(nextTitle);
        setTaskId(nextTaskId);
        setSuggestionsOpen(false);
        updateData(widgetId, {
            title: nextTitle,
            taskId: nextTaskId,
            elapsedMs: bankedMs,
        } as Partial<NowData>);
    }

    /** Resolves what was typed to a real task, creating one in Today when it
     *  doesn't match anything there yet. Returns the id, or null if there was
     *  nothing to resolve. */
    function commitTitle(): string | null {
        if (!trimmed) return null;
        const existing = tasks.find(
            (task) =>
                task.focusToday &&
                !task.done &&
                task.title.toLowerCase() === trimmed.toLowerCase(),
        );
        if (existing) {
            setTaskId(existing.id);
            return existing.id;
        }
        // addTask is optimistic and doesn't hand back an id, so the widget
        // keeps the title and picks the row up on the next render, once the
        // insert has come back.
        addTask(trimmed, true);
        setTaskId(null);
        return null;
    }

    function handleStart() {
        if (!trimmed) {
            inputRef.current?.focus();
            return;
        }
        const resolved = commitTitle();
        setSuggestionsOpen(false);
        const startedAt = Date.now();
        setRunStartedAt(startedAt);
        setNow(startedAt);
        updateData(widgetId, {
            title: trimmed,
            taskId: resolved ?? taskId,
            elapsedMs: bankedMs,
        } as Partial<NowData>);
    }

    function handlePause() {
        if (runStartedAt === null) return;
        const banked = bankedMs + (Date.now() - runStartedAt);
        setBankedMs(banked);
        setRunStartedAt(null);
        updateData(widgetId, {
            title,
            taskId,
            elapsedMs: banked,
        } as Partial<NowData>);
    }

    function handleStop() {
        setRunStartedAt(null);
        setBankedMs(0);
        setTitle("");
        setTaskId(null);
        setSuggestionsOpen(false);
        updateData(widgetId, {
            title: "",
            taskId: null,
            elapsedMs: 0,
        } as Partial<NowData>);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Escape") {
            setSuggestionsOpen(false);
            return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (running) {
            // Enter while running re-points the stopwatch at whatever was
            // typed without disturbing the time already banked -- editing the
            // task mid-run is expected, restarting the clock is not.
            const resolved = commitTitle();
            setSuggestionsOpen(false);
            updateData(widgetId, {
                title: trimmed,
                taskId: resolved ?? taskId,
                elapsedMs,
            } as Partial<NowData>);
            inputRef.current?.blur();
            return;
        }
        handleStart();
    }

    return (
        <div
            className={`flex h-full w-full flex-col justify-center gap-2 transition ${
                running ? "now-widget-running" : ""
            }`}
        >
            <div className="relative flex items-center gap-2">
                <input
                    ref={inputRef}
                    value={title}
                    onChange={(event) => {
                        setTitle(event.target.value);
                        setSuggestionsOpen(true);
                    }}
                    onFocus={() => setSuggestionsOpen(true)}
                    // A blur from clicking a suggestion would close the list
                    // before the click registered, so closing is deferred by
                    // a frame.
                    onBlur={() =>
                        window.setTimeout(() => setSuggestionsOpen(false), 120)
                    }
                    onKeyDown={handleKeyDown}
                    placeholder="What are you working on?"
                    aria-label="Currently working on"
                    className="min-w-0 flex-1 truncate rounded-lg border border-paper-edge bg-board/40 px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-soft/70"
                />

                {active && (
                    <span className="shrink-0 font-mono text-sm tabular-nums text-ink">
                        {formatElapsed(elapsedMs)}
                    </span>
                )}

                <button
                    type="button"
                    onClick={running ? handlePause : handleStart}
                    aria-label={running ? "Pause stopwatch" : "Start stopwatch"}
                    title={running ? "Pause" : "Start"}
                    className="shrink-0 rounded-full p-1.5 text-ink-soft transition hover:cursor-pointer hover:bg-black/5 hover:text-ink"
                >
                    {running ? (
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            aria-hidden
                        >
                            <rect
                                x="3.5"
                                y="2.5"
                                width="3.5"
                                height="11"
                                rx="1"
                                fill="currentColor"
                            />
                            <rect
                                x="9"
                                y="2.5"
                                width="3.5"
                                height="11"
                                rx="1"
                                fill="currentColor"
                            />
                        </svg>
                    ) : (
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            aria-hidden
                        >
                            <path
                                d="M4 2.8v10.4a.8.8 0 0 0 1.22.68l8.4-5.2a.8.8 0 0 0 0-1.36l-8.4-5.2A.8.8 0 0 0 4 2.8Z"
                                fill="currentColor"
                            />
                        </svg>
                    )}
                </button>

                {active && (
                    <button
                        type="button"
                        onClick={handleStop}
                        aria-label="Stop and reset stopwatch"
                        title="Stop"
                        className="shrink-0 rounded-full p-1.5 text-ink-soft transition hover:cursor-pointer hover:bg-black/5 hover:text-ink"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            aria-hidden
                        >
                            <rect
                                x="3"
                                y="3"
                                width="10"
                                height="10"
                                rx="1.5"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                )}

                {showSuggestions && (
                    <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-44 overflow-y-auto rounded-lg border border-paper-edge bg-paper py-1 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                        {suggestions.map((task) => (
                            <li key={task.id}>
                                <button
                                    type="button"
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() =>
                                        chooseTask(task.title, task.id)
                                    }
                                    className="block w-full truncate px-3 py-1.5 text-left text-sm text-ink hover:cursor-pointer hover:bg-black/5"
                                >
                                    {task.title}
                                </button>
                            </li>
                        ))}
                        {canCreate && (
                            <li>
                                <button
                                    type="button"
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() => {
                                        addTask(trimmed, true);
                                        chooseTask(trimmed, null);
                                    }}
                                    className="block w-full truncate px-3 py-1.5 text-left text-sm text-ink hover:cursor-pointer hover:bg-black/5"
                                >
                                    New task:{" "}
                                    <span className="font-semibold">
                                        {trimmed}
                                    </span>
                                </button>
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
}
