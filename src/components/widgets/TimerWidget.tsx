import { useEffect, useRef, useState } from "react";
import type { TimerData } from "../../types";

interface TimerWidgetProps {
  data: TimerData;
}

export function TimerWidget({ data }: TimerWidgetProps) {
  const [secondsLeft, setSecondsLeft] = useState(data.durationSeconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            window.clearInterval(intervalRef.current!);
            setRunning(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running]);

  const minutes = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span className="font-mono text-4xl font-medium tabular-nums text-ink">
        {minutes}:{seconds}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className="rounded-md bg-[var(--color-pin-timer)] px-3 py-1 text-xs font-medium text-paper"
        >
          {running ? "Pause" : secondsLeft === 0 ? "Restart" : "Start"}
        </button>
        <button
          onClick={() => {
            setRunning(false);
            setSecondsLeft(data.durationSeconds);
          }}
          className="rounded-md border border-paper-edge px-3 py-1 text-xs font-medium text-ink-soft"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
