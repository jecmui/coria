import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Rnd } from "react-rnd";
import { useBoardStore } from "../../store/boardStore";
import { useAppearanceStore } from "../../store/appearanceStore";
import { ContextMenu } from "../ContextMenu";
import { WidgetShell } from "./WidgetShell";
import { TodoWidget } from "../widgets/TodoWidget";
import { NoteWidget } from "../widgets/NoteWidget";
import { TimerWidget } from "../widgets/TimerWidget";
import type { ImageData, NoteData, NowData, TimerData } from "../../types";
import { ImageWidget } from "../widgets/ImageWidget";
import { NowWidget, NOW_WIDGET_HEIGHT } from "../widgets/NowWidget";
import {
    CalendarWidget,
    type CalendarWidgetHandle,
} from "../widgets/CalendarWidget";

const WIDGET_TITLES: Record<string, string> = {
    todo: "Today",
    note: "Note",
    timer: "Pomodoro",
    image: "Image",
    calendar: "Calendar",
    now: "Currently working on...",
};

const WIDGET_MIN_HEIGHTS: Record<string, number> = {
    todo: 160,
    note: 160,
    timer: 200,
    image: 160,
    calendar: 160,
    now: NOW_WIDGET_HEIGHT,
};

// Matches the board-texture dot spacing in index.css, so snapped widgets
// line up with the visible dots.
const GRID_SIZE = 22;

// react-rnd's dragGrid/resizeGrid snap the *movement delta* from wherever a
// widget currently sits, not its absolute position -- two widgets that start
// on different offsets end up on different grids. Rounding the saved x/y/
// width/height to true multiples of GRID_SIZE keeps every widget on one
// shared grid regardless of where it started.
function snapToGridValue(value: number) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

// How close (in px) a second right-click has to land to the currently open
// board menu's position to count as "the same spot" and fall through to the
// browser's native context menu, rather than moving the menu.
const RIGHT_CLICK_SAME_SPOT_PX = 6;

interface BoardProps {
    onOpenFullList: () => void;
    onOpenCalendar: () => void;
}

export function Board({ onOpenFullList, onOpenCalendar }: BoardProps) {
    const widgets = useBoardStore((s) => s.widgets);
    const updateLayout = useBoardStore((s) => s.updateLayout);
    const removeWidget = useBoardStore((s) => s.removeWidget);
    const bringToFront = useBoardStore((s) => s.bringToFront);
    const snapToGrid = useAppearanceStore((s) => s.settings.snapToGrid);
    const toggleSnapToGrid = useAppearanceStore((s) => s.toggleSnapToGrid);
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth < 768 : false,
    );
    const [boardMenu, setBoardMenu] = useState<{ x: number; y: number } | null>(
        null,
    );
    const boardRef = useRef<HTMLDivElement>(null);
    // Lifted out of CalendarWidget so its "Today" jump-back control can live
    // in the shared widget title bar instead of the widget's own content.
    const calendarWidgetRefs = useRef<
        Record<string, CalendarWidgetHandle | null>
    >({});
    const [calendarTodayVisible, setCalendarTodayVisible] = useState<
        Record<string, boolean>
    >({});

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 767px)");
        const handleChange = (event: MediaQueryListEvent) =>
            setIsMobile(event.matches);

        setIsMobile(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleChange);

        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    // Turning snap-to-grid on realigns every existing widget to the shared
    // grid once, so widgets placed before the setting was enabled (including
    // the default starter layout) line up with each other immediately,
    // instead of only aligning the next time each one is individually moved.
    useEffect(() => {
        if (!snapToGrid) return;
        const { widgets: currentWidgets, updateLayout: setLayout } =
            useBoardStore.getState();
        currentWidgets.forEach((widget) => {
            const aligned = {
                x: snapToGridValue(widget.layout.x),
                y: snapToGridValue(widget.layout.y),
                width: Math.max(200, snapToGridValue(widget.layout.width)),
                height: Math.max(
                    WIDGET_MIN_HEIGHTS[widget.type],
                    snapToGridValue(widget.layout.height),
                ),
            };
            if (
                aligned.x !== widget.layout.x ||
                aligned.y !== widget.layout.y ||
                aligned.width !== widget.layout.width ||
                aligned.height !== widget.layout.height
            ) {
                setLayout(widget.id, aligned);
            }
        });
        // Only re-run when the setting itself flips, not on every widget change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapToGrid]);

    function handleBoardContextMenu(event: ReactMouseEvent) {
        const target = event.target as HTMLElement;
        if (target.closest("[data-context-menu-owner]")) {
            // The widget is about to open its own context menu here -- close
            // ours first so the two are never open at the same time.
            setBoardMenu(null);
            return;
        }

        // A second right-click in roughly the same spot as the currently
        // open menu closes it and falls through to the browser's native
        // context menu, instead of reopening ours -- a right-click
        // elsewhere on the board just moves the menu to the new spot.
        const sameSpotAsOpenMenu =
            boardMenu !== null &&
            Math.abs(event.clientX - boardMenu.x) <= RIGHT_CLICK_SAME_SPOT_PX &&
            Math.abs(event.clientY - boardMenu.y) <= RIGHT_CLICK_SAME_SPOT_PX;

        if (event.shiftKey || sameSpotAsOpenMenu) {
            setBoardMenu(null);
            return;
        }

        event.preventDefault();
        setBoardMenu({ x: event.clientX, y: event.clientY });
    }

    function handleToggleSnapToGrid() {
        void toggleSnapToGrid();
        setBoardMenu(null);
    }

    const renderWidgetContent = (
        widgetId: string,
        type: string,
        data: unknown,
    ) => {
        if (type === "todo")
            return <TodoWidget onOpenFullList={onOpenFullList} />;
        if (type === "note")
            return <NoteWidget widgetId={widgetId} data={data as NoteData} />;
        if (type === "timer") return <TimerWidget data={data as TimerData} />;
        if (type === "now")
            return <NowWidget widgetId={widgetId} data={data as NowData} />;
        if (type === "image")
            return <ImageWidget widgetId={widgetId} data={data as ImageData} />;
        if (type === "calendar")
            return (
                <CalendarWidget
                    ref={(handle) => {
                        calendarWidgetRefs.current[widgetId] = handle;
                    }}
                    onOpenCalendar={onOpenCalendar}
                    onTodayVisibleChange={(visible) =>
                        setCalendarTodayVisible((state) =>
                            state[widgetId] === visible
                                ? state
                                : { ...state, [widgetId]: visible },
                        )
                    }
                />
            );
        return null;
    };

    const renderHeaderActions = (widgetId: string, type: string) => {
        if (type !== "calendar") return undefined;
        // Defaults to hidden (assume today is visible) until the widget
        // reports otherwise, so it doesn't flash in on first mount.
        if (calendarTodayVisible[widgetId] ?? true) return undefined;
        return (
            <button
                type="button"
                onClick={() =>
                    calendarWidgetRefs.current[widgetId]?.resetToToday()
                }
                className="rounded px-1.5 text-xs font-medium text-ink-soft transition hover:cursor-pointer hover:bg-black/5 hover:text-ink"
            >
                Today
            </button>
        );
    };

    const mobileWidgets = [...widgets].sort((a, b) => {
        if (a.layout.y !== b.layout.y) return a.layout.y - b.layout.y;
        return a.layout.x - b.layout.x;
    });

    if (isMobile) {
        return (
            <div className="board-texture relative z-0 h-full w-full overflow-y-auto px-3 pb-6 pt-4">
                <div className="mb-4 my-12 rounded-xl border border-paper-edge bg-paper/80 px-3 py-2 text-center text-xs font-medium text-ink-soft shadow-sm">
                    You are currently in the mobile version of Coria. For full
                    board functionality and movement, visit Coria on a desktop
                    or larger screen.
                </div>
                <div className="flex flex-col gap-4">
                    {mobileWidgets.map((widget) => (
                        <div key={widget.id} className="w-full">
                            <WidgetShell
                                type={widget.type}
                                title={WIDGET_TITLES[widget.type]}
                                onRemove={() => removeWidget(widget.id)}
                                headerActions={renderHeaderActions(
                                    widget.id,
                                    widget.type,
                                )}
                                mobile
                            >
                                {renderWidgetContent(
                                    widget.id,
                                    widget.type,
                                    widget.data,
                                )}
                            </WidgetShell>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div
            ref={boardRef}
            className="board-texture relative z-0 h-full w-full overflow-auto"
            onContextMenu={handleBoardContextMenu}
        >
            {widgets.map((widget) => (
                <Rnd
                    key={widget.id}
                    size={{
                        width: widget.layout.width,
                        // The Now widget ignores whatever height is stored --
                        // it's a single row of controls, so it's pinned.
                        height:
                            widget.type === "now"
                                ? NOW_WIDGET_HEIGHT
                                : widget.layout.height,
                    }}
                    position={{ x: widget.layout.x, y: widget.layout.y }}
                    minWidth={200}
                    minHeight={WIDGET_MIN_HEIGHTS[widget.type]}
                    dragGrid={snapToGrid ? [GRID_SIZE, GRID_SIZE] : undefined}
                    resizeGrid={
                        snapToGrid ? [GRID_SIZE, GRID_SIZE] : undefined
                    }
                    enableResizing={
                        widget.type === "now"
                            ? { left: true, right: true }
                            : undefined
                    }
                    dragHandleClassName="widget-drag-handle"
                    style={{ zIndex: widget.zIndex }}
                    onDragStart={() => bringToFront(widget.id)}
                    onMouseDown={() => bringToFront(widget.id)}
                    onDragStop={(_, d) =>
                        updateLayout(widget.id, {
                            x: snapToGrid ? snapToGridValue(d.x) : d.x,
                            y: snapToGrid ? snapToGridValue(d.y) : d.y,
                        })
                    }
                    onResizeStop={(_, __, ref, ___, position) => {
                        const width = parseInt(ref.style.width, 10);
                        const height = parseInt(ref.style.height, 10);
                        updateLayout(
                            widget.id,
                            snapToGrid
                                ? {
                                      width: Math.max(
                                          200,
                                          snapToGridValue(width),
                                      ),
                                      height: Math.max(
                                          WIDGET_MIN_HEIGHTS[widget.type],
                                          snapToGridValue(height),
                                      ),
                                      x: snapToGridValue(position.x),
                                      y: snapToGridValue(position.y),
                                  }
                                : { width, height, ...position },
                        );
                    }}
                    bounds="parent"
                >
                    <WidgetShell
                        type={widget.type}
                        title={WIDGET_TITLES[widget.type]}
                        onRemove={() => removeWidget(widget.id)}
                        headerActions={renderHeaderActions(
                            widget.id,
                            widget.type,
                        )}
                    >
                        {renderWidgetContent(
                            widget.id,
                            widget.type,
                            widget.data,
                        )}
                    </WidgetShell>
                </Rnd>
            ))}

            {boardMenu && (
                <ContextMenu
                    x={boardMenu.x}
                    y={boardMenu.y}
                    onClose={() => setBoardMenu(null)}
                    boundaryRef={boardRef}
                    items={[
                        {
                            key: "snap-to-grid",
                            label: "Snap to grid",
                            checked: snapToGrid,
                            onSelect: handleToggleSnapToGrid,
                        },
                    ]}
                />
            )}
        </div>
    );
}
