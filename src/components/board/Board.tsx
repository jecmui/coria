import { Rnd } from "react-rnd";
import { useBoardStore } from "../../store/boardStore";
import { WidgetShell } from "./WidgetShell";
import { TodoWidget } from "../widgets/TodoWidget";
import { NoteWidget } from "../widgets/NoteWidget";
import { TimerWidget } from "../widgets/TimerWidget";
import type { NoteData, TimerData } from "../../types";

const WIDGET_TITLES: Record<string, string> = {
  todo: "Today",
  note: "Note",
  timer: "Pomodoro",
};

interface BoardProps {
  onOpenFullList: () => void;
}

export function Board({ onOpenFullList }: BoardProps) {
  const widgets = useBoardStore((s) => s.widgets);
  const updateLayout = useBoardStore((s) => s.updateLayout);
  const removeWidget = useBoardStore((s) => s.removeWidget);
  const bringToFront = useBoardStore((s) => s.bringToFront);

  return (
    <div className="board-texture relative h-full w-full overflow-auto">
      {widgets.map((widget) => (
        <Rnd
          key={widget.id}
          size={{ width: widget.layout.width, height: widget.layout.height }}
          position={{ x: widget.layout.x, y: widget.layout.y }}
          minWidth={200}
          minHeight={160}
          dragHandleClassName="widget-drag-handle"
          style={{ zIndex: widget.zIndex }}
          onDragStart={() => bringToFront(widget.id)}
          onMouseDown={() => bringToFront(widget.id)}
          onDragStop={(_, d) => updateLayout(widget.id, { x: d.x, y: d.y })}
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
            {widget.type === "todo" && <TodoWidget onOpenFullList={onOpenFullList} />}
            {widget.type === "note" && (
              <NoteWidget widgetId={widget.id} data={widget.data as NoteData} />
            )}
            {widget.type === "timer" && <TimerWidget data={widget.data as TimerData} />}
          </WidgetShell>
        </Rnd>
      ))}
    </div>
  );
}
