import { useEffect, useState } from "react";
import { Rnd } from "react-rnd";
import { useBoardStore } from "../../store/boardStore";
import { WidgetShell } from "./WidgetShell";
import { TodoWidget } from "../widgets/TodoWidget";
import { NoteWidget } from "../widgets/NoteWidget";
import { TimerWidget } from "../widgets/TimerWidget";
import type { ImageData, NoteData, TimerData } from "../../types";
import { ImageWidget } from "../widgets/ImageWidget";
import { CalendarWidget } from "../widgets/CalendarWidget";

const WIDGET_TITLES: Record<string, string> = {
    todo: "Today",
    note: "Note",
    timer: "Pomodoro",
    image: "Image",
    calendar: "Calendar",
};

interface BoardProps {
    onOpenFullList: () => void;
    onOpenCalendar: () => void;
}

export function Board({ onOpenFullList, onOpenCalendar }: BoardProps) {
    const widgets = useBoardStore((s) => s.widgets);
    const updateLayout = useBoardStore((s) => s.updateLayout);
    const removeWidget = useBoardStore((s) => s.removeWidget);
    const bringToFront = useBoardStore((s) => s.bringToFront);
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth < 768 : false,
    );

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 767px)");
        const handleChange = (event: MediaQueryListEvent) =>
            setIsMobile(event.matches);

        setIsMobile(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleChange);

        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

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
        if (type === "image")
            return <ImageWidget widgetId={widgetId} data={data as ImageData} />;
        if (type === "calendar")
            return <CalendarWidget onOpenCalendar={onOpenCalendar} />;
        return null;
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
        <div className="board-texture relative z-0 h-full w-full overflow-auto">
            {widgets.map((widget) => (
                <Rnd
                    key={widget.id}
                    size={{
                        width: widget.layout.width,
                        height: widget.layout.height,
                    }}
                    position={{ x: widget.layout.x, y: widget.layout.y }}
                    minWidth={200}
                    minHeight={160}
                    dragHandleClassName="widget-drag-handle"
                    style={{ zIndex: widget.zIndex }}
                    onDragStart={() => bringToFront(widget.id)}
                    onMouseDown={() => bringToFront(widget.id)}
                    onDragStop={(_, d) =>
                        updateLayout(widget.id, { x: d.x, y: d.y })
                    }
                    onResizeStop={(_, __, ref, ___, position) =>
                        updateLayout(widget.id, {
                            width: parseInt(ref.style.width, 10),
                            height: parseInt(ref.style.height, 10),
                            ...position,
                        })
                    }
                    bounds="parent"
                >
                    <WidgetShell
                        type={widget.type}
                        title={WIDGET_TITLES[widget.type]}
                        onRemove={() => removeWidget(widget.id)}
                    >
                        {renderWidgetContent(
                            widget.id,
                            widget.type,
                            widget.data,
                        )}
                    </WidgetShell>
                </Rnd>
            ))}
        </div>
    );
}
