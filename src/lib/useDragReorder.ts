import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";

/** How long a touch has to hold still before a drag is allowed to start,
 *  so an ordinary scroll gesture isn't mistaken for a reorder. Mouse/pen
 *  can start dragging immediately -- this only applies to touch. */
const TOUCH_LONG_PRESS_MS = 350;
/** How far a touch may drift during the long-press wait before it's treated
 *  as a scroll instead and the pending drag is cancelled. */
const TOUCH_LONG_PRESS_MOVE_TOLERANCE = 10;

/**
 * Press-and-drag reordering for a vertical list, using plain Pointer Events
 * so the same code handles mouse and touch. Attach `containerRef` to the
 * list's wrapping element, put `data-drag-id={id}` on each row's root
 * element, and spread `dragHandleProps(id)` onto the row itself. A drag only
 * starts after the pointer moves past the small movement threshold, so normal
 * clicks/taps elsewhere on the row keep working normally. On touch, a drag
 * additionally can't arm until the finger holds still for
 * TOUCH_LONG_PRESS_MS -- confirmed with a light haptic buzz -- so scrolling
 * the list doesn't accidentally pick up a task.
 *
 * Render `displayItems` instead of the raw `items` while dragging is in
 * progress, so the list visually reorders as the user drags. `onReorder`
 * fires once, with the final ordered ids, when the drag ends -- callers are
 * expected to persist that themselves (this hook holds no server state).
 */
export function useDragReorder<T extends { id: string }>(
    items: T[],
    onReorder: (orderedIds: string[]) => void,
) {
    const [order, setOrder] = useState<string[] | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const containerRef = useRef<HTMLElement>(null);
    const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
    const draggedRef = useRef(false);
    const longPressTimerRef = useRef<number | null>(null);
    const longPressCleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => longPressCleanupRef.current?.();
    }, []);

    const displayItems = order
        ? (order
              .map((id) => items.find((item) => item.id === id))
              .filter(Boolean) as T[])
        : items;

    const endDrag = useCallback(() => {
        setPendingId(null);
        setDraggingId(null);
        pointerStartRef.current = null;
        setOrder((current) => {
            if (current) onReorder(current);
            return null;
        });
    }, [onReorder]);

    useEffect(() => {
        if (!pendingId && !draggingId) return;

        function handlePointerMove(event: PointerEvent) {
            if (pendingId && !draggingId) {
                const start = pointerStartRef.current;
                if (!start) return;

                const distance = Math.hypot(
                    event.clientX - start.x,
                    event.clientY - start.y,
                );
                if (distance < 5) return;

                setOrder(items.map((item) => item.id));
                setDraggingId(pendingId);
                setPendingId(null);
                draggedRef.current = true;
                event.preventDefault();
                return;
            }

            const container = containerRef.current;
            if (!container) return;
            const hoveredEl = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>("[data-drag-id]");
            const hoveredId = hoveredEl?.dataset.dragId;
            if (!hoveredId || !hoveredEl || !container.contains(hoveredEl))
                return;

            setOrder((current) => {
                if (!current || !draggingId) return current;
                const from = current.indexOf(draggingId);
                const to = current.indexOf(hoveredId);
                if (from === -1 || to === -1 || from === to) return current;
                const next = [...current];
                next.splice(from, 1);
                next.splice(to, 0, draggingId);
                return next;
            });
            event.preventDefault();
        }

        function handlePointerUp() {
            endDrag();
        }

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
        };
    }, [draggingId, endDrag, items, pendingId]);

    const dragHandleProps = (id: string) => ({
        onPointerDown: (event: ReactPointerEvent) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            pointerStartRef.current = {
                x: event.clientX,
                y: event.clientY,
            };
            draggedRef.current = false;

            if (event.pointerType !== "touch") {
                setPendingId(id);
                return;
            }

            // Touch needs to hold still for a moment before a drag can arm --
            // otherwise an ordinary scroll/tap reads as the start of a
            // reorder. A finger that moves too far or lifts before the timer
            // fires falls through to its normal tap/scroll behavior instead.
            const pointerId = event.pointerId;
            const cancel = () => {
                if (longPressTimerRef.current !== null) {
                    window.clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                }
                window.removeEventListener("pointermove", handleEarlyMove);
                window.removeEventListener("pointerup", cancel);
                window.removeEventListener("pointercancel", cancel);
                longPressCleanupRef.current = null;
            };
            const handleEarlyMove = (moveEvent: PointerEvent) => {
                if (moveEvent.pointerId !== pointerId) return;
                const start = pointerStartRef.current;
                if (!start) return;
                const distance = Math.hypot(
                    moveEvent.clientX - start.x,
                    moveEvent.clientY - start.y,
                );
                if (distance > TOUCH_LONG_PRESS_MOVE_TOLERANCE) cancel();
            };
            window.addEventListener("pointermove", handleEarlyMove);
            window.addEventListener("pointerup", cancel);
            window.addEventListener("pointercancel", cancel);
            longPressCleanupRef.current = cancel;
            longPressTimerRef.current = window.setTimeout(() => {
                window.removeEventListener("pointermove", handleEarlyMove);
                window.removeEventListener("pointerup", cancel);
                window.removeEventListener("pointercancel", cancel);
                longPressTimerRef.current = null;
                longPressCleanupRef.current = null;
                navigator.vibrate?.(15);
                setPendingId(id);
            }, TOUCH_LONG_PRESS_MS);
        },
        onClickCapture: (event: MouseEvent) => {
            if (draggedRef.current) {
                event.preventDefault();
                event.stopPropagation();
                draggedRef.current = false;
            }
        },
    });

    return { containerRef, displayItems, draggingId, dragHandleProps };
}
