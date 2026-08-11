import { useEffect, useRef, useState } from "react";
import type { TimerData } from "../../types";

interface TimerWidgetProps {
    data: TimerData;
}

type Phase = "focus" | "shortBreak" | "longBreak";

const PHASE_LABEL: Record<Phase, string> = {
    focus: "Focus",
    shortBreak: "Short Break",
    longBreak: "Long Break",
};

function durationFor(phase: Phase, data: TimerData): number {
    switch (phase) {
        case "focus":
            return data.focusSeconds;
        case "shortBreak":
            return data.shortBreakSeconds;
        case "longBreak":
            return data.longBreakSeconds;
    }
}

export function TimerWidget({ data }: TimerWidgetProps) {
    const [phase, setPhase] = useState<Phase>("focus");
    const [cyclesCompleted, setCyclesCompleted] = useState(0);
    const [secondsLeft, setSecondsLeft] = useState(data.focusSeconds);
    const [running, setRunning] = useState(false);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        if (!running) return;

        intervalRef.current = window.setInterval(() => {
            setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
        }, 1000);

        return () => {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
        };
    }, [running]);

    // Whenever the countdown reaches zero, advance to the next phase in the
    // Pomodoro cycle and, per the saved settings, decide whether it should
    // keep running or wait for a manual start.
    useEffect(() => {
        if (secondsLeft > 0) return;
        if (!running) return;

        if (phase === "focus") {
            const nextCyclesCompleted = cyclesCompleted + 1;
            const nextPhase: Phase =
                nextCyclesCompleted % data.longBreakInterval === 0
                    ? "longBreak"
                    : "shortBreak";
            setCyclesCompleted(nextCyclesCompleted);
            setPhase(nextPhase);
            setSecondsLeft(durationFor(nextPhase, data));
            setRunning(data.autoStartBreaks);
        } else {
            setPhase("focus");
            setSecondsLeft(data.focusSeconds);
            setRunning(data.autoStartFocus);
        }
        // Only fires on the tick that hits zero.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [secondsLeft]);

    const minutes = Math.floor(secondsLeft / 60)
        .toString()
        .padStart(2, "0");
    const seconds = (secondsLeft % 60).toString().padStart(2, "0");

    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 overflow-hidden">
            <span className="font-body text-xs font-medium uppercase tracking-wide text-ink-soft">
                {PHASE_LABEL[phase]}
            </span>
            <span className="font-mono text-4xl font-medium tabular-nums text-ink">
                {minutes}:{seconds}
            </span>
            <div className="flex gap-2">
                <button
                    onClick={() => setRunning((r) => !r)}
                    className="rounded-md bg-pin-timer px-3 py-1 text-xs font-medium text-paper hover:cursor-pointer"
                >
                    {running
                        ? "Pause"
                        : secondsLeft === 0
                          ? "Restart"
                          : "Start"}
                </button>
                <button
                    onClick={() => {
                        setRunning(false);
                        setSecondsLeft(durationFor(phase, data));
                    }}
                    className="rounded-md border border-paper-edge px-3 py-1 text-xs font-medium text-ink-soft hover:cursor-pointer"
                >
                    Reset
                </button>
            </div>
        </div>
    );
}
