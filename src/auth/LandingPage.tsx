interface LandingPageProps {
    onGetStarted: () => void;
    onSignIn: () => void;
}

const PREVIEW_CARDS: { label: string; color: string; rotate: string }[] = [
    { label: "Daily tasks", color: "var(--color-pin-todo)", rotate: "-rotate-6" },
    { label: "Quick note", color: "var(--color-pin-note)", rotate: "rotate-3" },
    { label: "Focus timer", color: "var(--color-pin-timer)", rotate: "-rotate-2" },
    { label: "This week", color: "var(--color-pin-calendar)", rotate: "rotate-6" },
];

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-board board-texture px-6">
            <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
                {PREVIEW_CARDS.map((card) => (
                    <div
                        key={card.label}
                        className={`relative w-28 rounded-md border border-paper-edge bg-paper px-3 py-4 text-center shadow-[0_8px_20px_rgba(0,0,0,0.25)] ${card.rotate}`}
                    >
                        <span
                            className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-black/10 shadow-sm"
                            style={{ backgroundColor: card.color }}
                        />
                        <span className="font-body text-xs font-medium text-ink-soft">
                            {card.label}
                        </span>
                    </div>
                ))}
            </div>

            <h1 className="font-display text-4xl font-semibold text-ink sm:text-5xl">
                Coria
            </h1>
            <p className="mt-3 max-w-sm text-center font-body text-base text-ink sm:text-lg">
                Your very own digital bulletin board.
            </p>

            <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
                <button
                    type="button"
                    onClick={onGetStarted}
                    className="w-full rounded-md bg-pin-todo py-2.5 text-sm font-medium text-[#232320] [color-scheme:light] hover:cursor-pointer"
                >
                    Get started
                </button>
                <button
                    type="button"
                    onClick={onSignIn}
                    className="w-full rounded-md border border-paper-edge bg-paper/90 py-2.5 text-sm font-medium text-ink hover:cursor-pointer hover:bg-paper"
                >
                    Sign in
                </button>
            </div>
        </div>
    );
}
