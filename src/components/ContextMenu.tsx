import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";

export interface ContextMenuItem {
    key: string;
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    /** Visually distinguishes destructive, irreversible actions (e.g. permanent deletion). */
    danger?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
    /** Right-clicks and outside clicks inside this element are left alone instead of
     *  force-closing the menu -- the element's own contextmenu handler(s) are expected
     *  to decide what happens there (e.g. open a different menu, or open this one again). */
    boundaryRef?: RefObject<HTMLElement | null>;
}

const MENU_WIDTH = 180;
// Rough per-item height (matches the px-3 py-2 buttons below) used to keep
// the menu on-screen; only needs to be close, not exact.
const ITEM_HEIGHT = 36;
const MENU_PADDING = 8;

export function ContextMenu({ x, y, items, onClose, boundaryRef }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Left-clicks outside the menu close it. Right-clicks outside both the menu and
    // the caller's boundary close it *and* fall through to the browser's own menu.
    // Escape or any scroll/resize (the menu is viewport-positioned) closes it too.
    useEffect(() => {
        const handleMouseDown = (event: MouseEvent) => {
            if (event.button === 2) return;
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        const handleContextMenu = (event: MouseEvent) => {
            const node = event.target as Node | null;
            if (!node) return;
            if (boundaryRef?.current?.contains(node)) return;
            if (menuRef.current?.contains(node)) return;
            onClose();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        const handleReposition = () => onClose();

        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("contextmenu", handleContextMenu);
        document.addEventListener("keydown", handleKeyDown);
        window.addEventListener("scroll", handleReposition, true);
        window.addEventListener("resize", handleReposition);

        return () => {
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("contextmenu", handleContextMenu);
            document.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("scroll", handleReposition, true);
            window.removeEventListener("resize", handleReposition);
        };
    }, [onClose, boundaryRef]);

    const estimatedHeight = items.length * ITEM_HEIGHT + MENU_PADDING;

    // Portalled: callers often live inside a transformed ancestor (e.g. a
    // react-rnd wrapper), which would otherwise anchor fixed positioning to
    // that ancestor instead of the viewport.
    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-90 flex flex-col rounded-xl border border-paper-edge bg-paper p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            style={{
                width: MENU_WIDTH,
                left: Math.max(
                    8,
                    Math.min(x, window.innerWidth - MENU_WIDTH - 8),
                ),
                top: Math.max(
                    8,
                    Math.min(y, window.innerHeight - estimatedHeight - 8),
                ),
            }}
        >
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    disabled={item.disabled}
                    onClick={item.onSelect}
                    className={`rounded-lg px-3 py-2 text-left font-body text-xs font-medium transition hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent hover:bg-black/5 ${
                        item.danger ? "text-pin-timer" : "text-ink"
                    }`}
                >
                    {item.label}
                </button>
            ))}
        </div>,
        document.body,
    );
}
