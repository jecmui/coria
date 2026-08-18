import type { ReactNode } from "react";
import type { AppearanceColors } from "../../types";

export const inputClass =
    "w-full rounded-xl border border-paper-edge bg-board/60 px-3 py-2 font-body text-sm text-ink outline-none";

export function ToggleSwitch({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl bg-paper/70 px-3 py-2">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={() => onChange(!checked)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors hover:cursor-pointer ${
                    checked ? "bg-pin-todo" : "bg-paper-edge"
                }`}
            >
                <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper shadow transition-transform ${
                        checked ? "translate-x-0" : "-translate-x-4"
                    }`}
                />
            </button>
            <span className="font-body text-sm text-ink">{label}</span>
        </div>
    );
}

export function ColorField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="flex items-center justify-between gap-3 rounded-xl bg-paper/70 px-3 py-2">
            <span className="font-body text-sm text-ink">{label}</span>
            <span className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase text-ink-soft">
                    {value}
                </span>
                <input
                    type="color"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    aria-label={label}
                    className="h-8 w-8 cursor-pointer rounded-md border border-paper-edge bg-transparent p-0.5"
                />
            </span>
        </label>
    );
}

export function ColorCategoryCard({
    title,
    description,
    resetDisabled,
    onReset,
    children,
}: {
    title: string;
    description: string;
    resetDisabled: boolean;
    onReset: () => void;
    children: ReactNode;
}) {
    return (
        <div className="space-y-3 rounded-2xl border border-paper-edge bg-board/40 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-body text-sm font-semibold text-ink">
                        {title}
                    </h3>
                    <p className="mt-0.5 font-body text-xs text-ink-soft">
                        {description}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onReset}
                    disabled={resetDisabled}
                    className="shrink-0 rounded-full border border-paper-edge bg-paper px-3 py-1.5 font-body text-xs font-semibold text-ink transition hover:cursor-pointer hover:bg-paper/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Reset to defaults
                </button>
            </div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

export function AppearancePreview({ colors }: { colors: AppearanceColors }) {
    const cards: { label: string; pin: string }[] = [
        { label: "Today", pin: colors.pinTodo },
        { label: "Note", pin: colors.pinNote },
        { label: "Pomodoro", pin: colors.pinTimer },
        { label: "Image", pin: colors.pinImage },
        { label: "Calendar", pin: colors.pinCalendar },
    ];

    return (
        <div
            className="space-y-3 rounded-2xl border border-paper-edge p-4"
            style={{
                backgroundColor: colors.board,
                backgroundImage: `radial-gradient(${colors.boardLine} 1px, transparent 1px)`,
                backgroundSize: "20px 20px",
            }}
        >
            <p
                className="font-body text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: colors.ink }}
            >
                Preview
            </p>
            <div className="flex flex-wrap gap-3">
                {cards.map((card) => (
                    <div
                        key={card.label}
                        className="w-28 rounded-lg border p-2 shadow-sm"
                        style={{
                            backgroundColor: colors.paper,
                            borderColor: colors.paperEdge,
                        }}
                    >
                        <span
                            className="mb-1.5 block h-2 w-2 rounded-full"
                            style={{ backgroundColor: card.pin }}
                        />
                        <span
                            className="block font-body text-[11px] font-medium"
                            style={{ color: colors.ink }}
                        >
                            {card.label}
                        </span>
                        <span
                            className="mt-0.5 block font-body text-[10px]"
                            style={{ color: colors.inkSoft }}
                        >
                            Sample text
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function TimeZoneSelect({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const zones =
        typeof Intl.supportedValuesOf === "function"
            ? Intl.supportedValuesOf("timeZone")
            : [value];

    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
        >
            {zones.map((zone) => (
                <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                </option>
            ))}
        </select>
    );
}
