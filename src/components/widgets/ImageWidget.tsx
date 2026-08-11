import { useRef, useState } from "react";
import { useBoardStore } from "../../store/boardStore";
import type { ImageData } from "../../types";

interface ImageWidgetProps {
    widgetId: string;
    data: ImageData;
}

export function ImageWidget({ widgetId, data }: ImageWidgetProps) {
    const updateData = useBoardStore((s) => s.updateData);
    const inputRef = useRef<HTMLInputElement>(null);
    const [hovering, setHovering] = useState(false);

    function handleFile(file: File | undefined) {
        if (!file || !file.type.startsWith("image/")) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") return;
            updateData(widgetId, { src: reader.result, fileName: file.name });
        };
        reader.readAsDataURL(file);
    }

    function openFilePicker() {
        inputRef.current?.click();
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    handleFile(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />

            {data.src ? (
                <button
                    type="button"
                    onClick={openFilePicker}
                    onMouseEnter={() => setHovering(true)}
                    onMouseLeave={() => setHovering(false)}
                    className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-black/5 hover:cursor-pointer"
                    aria-label="Reupload image"
                >
                    <img
                        src={data.src}
                        alt={data.fileName || "Uploaded image"}
                        className="h-full w-full object-cover"
                    />
                    {hovering && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 font-body text-sm font-semibold text-white">
                            Reupload image
                        </span>
                    )}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={openFilePicker}
                    className="flex min-h-0 flex-1 items-center justify-center rounded-md border-2 border-dashed border-paper-edge bg-board/20 px-4 text-center font-body text-sm text-ink-soft transition hover:cursor-pointer hover:bg-board/30 hover:text-ink"
                >
                    Click to upload an image
                </button>
            )}
        </div>
    );
}
