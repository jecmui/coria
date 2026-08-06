import { useBoardStore } from "../../store/boardStore";
import type { NoteData } from "../../types";

interface NoteWidgetProps {
  widgetId: string;
  data: NoteData;
}

export function NoteWidget({ widgetId, data }: NoteWidgetProps) {
  const updateData = useBoardStore((s) => s.updateData);

  return (
    <textarea
      value={data.text}
      onChange={(e) => updateData(widgetId, { text: e.target.value })}
      placeholder="Jot something down..."
      className="h-full w-full resize-none bg-transparent font-body text-sm text-ink placeholder:text-ink-soft focus:outline-none"
    />
  );
}
