import type { HTMLAttributes, ReactNode } from "react";
import type { WidgetType } from "../../types";

const PIN_COLOR: Record<WidgetType, string> = {
    todo: "var(--color-pin-todo)",
    note: "var(--color-pin-note)",
    timer: "var(--color-pin-timer)",
    image: "var(--color-pin-image)",
    calendar: "var(--color-pin-calendar)",
};

interface WidgetShellProps {
    type: WidgetType;
    title: string;
    onRemove: () => void;
    mobile?: boolean;
    /** Grab handle for reordering in the mobile stacked view; ignored on desktop. */
    dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
    /** Extra controls rendered in the title bar, to the left of the remove
     *  button -- e.g. the Calendar widget's "Today" jump-back control. Unlike
     *  the remove button, these stay visible without hovering, since they're
     *  functional state (not just widget chrome) the user needs to notice. */
    headerActions?: ReactNode;
    children: ReactNode;
}

export function WidgetShell({
    type,
    title,
    onRemove,
    mobile = false,
    dragHandleProps,
    headerActions,
    children,
}: WidgetShellProps) {
    return (
        <div className="group relative flex h-full w-full flex-col rounded-lg bg-paper border border-paper-edge shadow-[0_6px_16px_rgba(0,0,0,0.25)]">
            {!mobile && (
                <>
                    {/* Pin -- signature element, doubles as the drag handle */}
                    <div
                        className="widget-drag-handle absolute -top-2.5 left-1/2 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full border-2 border-paper active:cursor-grabbing"
                        style={{ backgroundColor: PIN_COLOR[type] }}
                    />
                    <div className="widget-drag-handle flex cursor-grab items-center justify-between rounded-t-lg px-4 pt-4 pb-2 active:cursor-grabbing">
                        <span className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
                            {title}
                        </span>
                        <div className="flex items-center gap-1">
                            {headerActions}
                            <button
                                onClick={onRemove}
                                className="rounded px-1.5 text-ink-soft opacity-0 transition hover:bg-black/5 hover:text-ink group-hover:opacity-100"
                                aria-label={`Remove ${title} widget`}
                            >
                                ×
                            </button>
                        </div>
                    </div>
                </>
            )}
            {mobile && (
                <div className="flex items-center justify-between rounded-t-lg px-4 pt-4 pb-2">
                    <div className="flex min-w-0 items-center gap-2">
                        {dragHandleProps && (
                            <span
                                {...dragHandleProps}
                                className="shrink-0 cursor-grab touch-none text-ink-soft/50 active:cursor-grabbing"
                                aria-hidden="true"
                            >
                                <img
                                    src="/grip-vertical-solid-full.svg"
                                    width={9}
                                    height={14}
                                    alt=""
                                />
                            </span>
                        )}
                        <span className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
                            {title}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        {headerActions}
                        <button
                            onClick={onRemove}
                            className="rounded px-1.5 text-ink-soft transition hover:bg-black/5 hover:text-ink"
                            aria-label={`Remove ${title} widget`}
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}
            <div className="min-h-0 flex-1 px-4 pb-4 scrollbar-gutter-stable">
                {children}
            </div>
        </div>
    );
}
