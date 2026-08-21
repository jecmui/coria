import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";

/** Standard modal dismissal: pressing Escape closes it from anywhere, and
 *  clicking its own backdrop (not the card inside it) closes it too --
 *  every fixed inset-0 overlay in this app wires both up the same way,
 *  through this one hook, so the behavior can't quietly drift between
 *  them. `active` gates the Escape listener to only attach while the
 *  modal is actually open -- every modal here is conditionally rendered
 *  (`{state && (...)}`), so the hook itself still has to be called
 *  unconditionally at the top of the component; this is what makes that
 *  safe without breaking the rules of hooks.
 *
 *  Returns the onClick handler for the backdrop div -- spread it onto
 *  that element's own onClick, and call `onClose` directly wherever the
 *  modal's existing Cancel/× button already does. */
export function useModalDismiss(active: boolean, onClose: () => void) {
    // Callers pass a fresh onClose closure every render (most just inline
    // `() => setX(null)`) -- reading it through a ref instead of putting it
    // in the effect's own deps means the listener isn't torn down and
    // re-attached on every render the modal is open for, while still
    // always calling whichever onClose is current.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!active) return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onCloseRef.current();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [active]);

    return (event: MouseEvent<HTMLElement>) => {
        if (event.target === event.currentTarget) onCloseRef.current();
    };
}
