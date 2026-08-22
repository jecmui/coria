import { useRef } from "react";

function CalendarIcon() {
    return (
        <svg
            viewBox="0 0 640 640"
            width={14}
            height={14}
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M216 64C229.3 64 240 74.7 240 88L240 128L400 128L400 88C400 74.7 410.7 64 424 64C437.3 64 448 74.7 448 88L448 128L480 128C515.3 128 544 156.7 544 192L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 192C96 156.7 124.7 128 160 128L192 128L192 88C192 74.7 202.7 64 216 64zM216 176L160 176C151.2 176 144 183.2 144 192L144 240L496 240L496 192C496 183.2 488.8 176 480 176L216 176zM144 288L144 480C144 488.8 151.2 496 160 496L480 496C488.8 496 496 488.8 496 480L496 288L144 288z" />
        </svg>
    );
}

/** "YYYY-MM-DD" (or "" when unset) for an <input type="date">, reading the
 *  due date's UTC calendar-date parts -- a due date is a floating calendar
 *  date, not a real instant, so it's stored/read at UTC midnight the same
 *  way calendar all-day events are (see eventDateZone in lib/calendar.ts). */
function dueDateToInputValue(dueDate: number | null): string {
    if (dueDate === null) return "";
    const date = new Date(dueDate);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Blank clears the due date -- a task with no due date is permanent: never
 *  overdue, and excluded from any due-date-based sorting/expiry. */
function inputValueToDueDate(value: string): number | null {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
}

/** Short label like "Aug 25" -- read in UTC, same reasoning as
 *  dueDateToInputValue above (a due date is a floating calendar date). */
function formatDueDateLabel(dueDate: number): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
    }).format(new Date(dueDate));
}

interface TaskDueDateButtonProps {
    dueDate: number | null;
    onChange: (dueDate: number | null) => void;
    className?: string;
}

/** A visible button that explicitly opens a real (visually hidden, not
 *  display:none) native date input's picker via showPicker() on click --
 *  rather than relying on a click landing on an invisible input stacked on
 *  top of the icon. Task rows also arm drag-reordering on *any* pointerdown
 *  in the row, which was swallowing that click-on-invisible-input approach
 *  the moment the mouse drifted a pixel or two during the click; stopping
 *  propagation on this button's own pointerdown/click keeps that drag
 *  handling from ever seeing the gesture. With no due date set, it's just
 *  the calendar icon; once one's set, it becomes a small badge showing the
 *  date, filled with the --color-due-date-badge theme token (see
 *  AppearanceColors.dueDateBadge's doc comment for why it's its own token). */
export function TaskDueDateButton({
    dueDate,
    onChange,
    className,
}: TaskDueDateButtonProps) {
    const hasDueDate = dueDate !== null;
    const inputRef = useRef<HTMLInputElement>(null);

    function openPicker() {
        const input = inputRef.current;
        if (!input) return;
        if (typeof input.showPicker === "function") {
            input.showPicker();
        } else {
            input.focus();
        }
    }

    return (
        <span
            className={
                className ??
                (hasDueDate
                    ? "inline-flex shrink-0 items-center gap-1 rounded bg-due-date-badge px-1.5 py-0.5 text-[11px] font-medium text-ink-soft transition hover:cursor-pointer hover:text-ink"
                    : "inline-flex shrink-0 items-center justify-center rounded p-1 text-ink-soft transition hover:bg-black/5 hover:cursor-pointer hover:text-ink")
            }
        >
            <button
                type="button"
                title="Due date"
                aria-label="Due date"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    openPicker();
                }}
                className="inline-flex items-center gap-1 hover:cursor-pointer"
            >
                <CalendarIcon />
                {hasDueDate && <span>{formatDueDateLabel(dueDate)}</span>}
            </button>
            <input
                ref={inputRef}
                type="date"
                tabIndex={-1}
                aria-hidden="true"
                value={dueDateToInputValue(dueDate)}
                onChange={(e) =>
                    onChange(inputValueToDueDate(e.target.value))
                }
                className="sr-only"
            />
        </span>
    );
}
