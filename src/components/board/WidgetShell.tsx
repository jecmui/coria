import type { ReactNode } from "react";
import type { WidgetType } from "../../types";

const PIN_COLOR: Record<WidgetType, string> = {
    todo: "var(--color-pin-todo)",
    note: "var(--color-pin-note)",
    timer: "var(--color-pin-timer)",
};

interface WidgetShellProps {
    type: WidgetType;
    title: string;
    onRemove: () => void;
    children: ReactNode;
}

export function WidgetShell({
    type,
    title,
    onRemove,
    children,
}: WidgetShellProps) {
    return (
        <div className="group relative flex h-full w-full flex-col rounded-lg bg-paper border border-paper-edge shadow-[0_6px_16px_rgba(0,0,0,0.25)]">
            {/* Pin -- signature element, doubles as the drag handle */}
            <div
                className="widget-drag-handle absolute -top-2.5 left-1/2 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full border-2 border-paper active:cursor-grabbing"
                style={{ backgroundColor: PIN_COLOR[type] }}
            />
            <div className="widget-drag-handle flex cursor-grab items-center justify-between rounded-t-lg px-4 pt-4 pb-2 active:cursor-grabbing">
                <span className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
                    {title}
                </span>
                <button
                    onClick={onRemove}
                    className="rounded px-1.5 text-ink-soft opacity-0 transition hover:bg-black/5 hover:text-ink group-hover:opacity-100"
                    aria-label={`Remove ${title} widget`}
                >
                    ×
                </button>
            </div>
            <div className="min-h-0 flex-1 px-4 pb-4 scrollbar-gutter-stable">
                {children}
            </div>
        </div>
    );
}
