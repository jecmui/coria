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
            className="min-h-30 md:min-h-20 md:h-full w-full resize-none bg-transparent font-body text-sm text-ink placeholder:text-ink-soft focus:outline-none md:overflow-hidden hover:overflow-auto scrollbar-gutter-stable scrollbar-thin scrollbar-thumb-pin-note scrollbar-track-transparent"
        />
    );
}
