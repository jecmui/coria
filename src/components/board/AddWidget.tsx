import { useEffect, useRef, useState } from "react";
import { useBoardStore } from "../../store/boardStore";
import type { WidgetType } from "../../types";

type AddOption = {
    type: WidgetType;
    label: string;
    color: string;
    disabled?: boolean;
};

const OPTIONS: AddOption[] = [
    { type: "now", label: "Now", color: "var(--color-pin-timer)" },
    { type: "todo", label: "Today", color: "var(--color-pin-todo)" },
    { type: "note", label: "Note", color: "var(--color-pin-note)" },
    { type: "timer", label: "Pomodoro", color: "var(--color-pin-timer)" },
    {
        type: "image",
        label: "Image",
        color: "var(--color-pin-image)",
    },
    {
        type: "calendar",
        label: "Calendar",
        color: "var(--color-pin-calendar)",
    },
];

export function AddWidget() {
    const addWidget = useBoardStore((s) => s.addWidget);
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: MouseEvent | TouchEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
        };
    }, [open]);

    const handleSelect = (option: AddOption) => {
        if (option.disabled) {
            setOpen(false);
            return;
        }

        addWidget(option.type);
        setOpen(false);
    };

    return (
        <div
            ref={menuRef}
            className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:bottom-5 sm:right-5"
        >
            {open && (
                <div className="flex flex-col gap-2 rounded-2xl border border-paper-edge bg-paper p-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                    {OPTIONS.map((option) => (
                        <button
                            key={option.type}
                            type="button"
                            onClick={() => handleSelect(option)}
                            disabled={option.disabled}
                            className="flex min-w-[140px] items-center justify-between gap-2 rounded-xl px-3 py-2 text-left font-body text-xs font-medium text-ink transition disabled:cursor-not-allowed disabled:opacity-60 hover:bg-black/5 hover:cursor-pointer"
                        >
                            <span className="flex items-center gap-2">
                                <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: option.color }}
                                />
                                {option.label}
                            </span>
                            {option.disabled ? (
                                <span className="text-[10px] text-ink-soft">
                                    Soon
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
            )}

            <button
                type="button"
                aria-label="Add widget"
                onClick={() => setOpen((prev) => !prev)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-paper-edge bg-paper text-2xl text-ink shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:scale-105 hover:cursor-pointer"
            >
                <span className="leading-none">+</span>
            </button>
        </div>
    );
}
