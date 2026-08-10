import { useBoardStore } from "../../store/boardStore";
import type { WidgetType } from "../../types";

const OPTIONS: { type: WidgetType; label: string; color: string }[] = [
    { type: "todo", label: "+ Today", color: "var(--color-pin-todo)" },
    { type: "note", label: "+ Note", color: "var(--color-pin-note)" },
    { type: "timer", label: "+ Pomodoro", color: "var(--color-pin-timer)" },
];

export function WidgetTray() {
    const addWidget = useBoardStore((s) => s.addWidget);

    return (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 gap-2 rounded-full border border-paper-edge bg-paper px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            {OPTIONS.map((opt) => (
                <button
                    key={opt.type}
                    onClick={() => addWidget(opt.type)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body text-xs text-nowrap font-medium text-ink transition hover:bg-black/5 hover:cursor-pointer"
                >
                    <span
                        className="h-2 w-2 rounded-full invisible sm:visible"
                        style={{ backgroundColor: opt.color }}
                    />
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
