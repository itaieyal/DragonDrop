export type FLIPSnapshot = Map<string, DOMRect>;

/**
 * 1. Measure all animated elements before they move.
 */
export function measureFLIP(container: HTMLElement): FLIPSnapshot {
    const snapshot = new Map<string, DOMRect>();
    const elements = container.querySelectorAll("[data-id]");
    for (const el of Array.from(elements)) {
        if (el instanceof HTMLElement) {
            snapshot.set(el.getAttribute("data-id")!, el.getBoundingClientRect());
        }
    }
    return snapshot;
}

/**
 * 2. Play the FLIP animation from the snapshot to their new DOM positions.
 */
export function playFLIP(container: HTMLElement, snapshot: FLIPSnapshot, durationMs = 180) {
    const elements = container.querySelectorAll("[data-id]");

    // Batch reads first (Last)
    const lasts = new Map<HTMLElement, DOMRect>();
    for (const el of Array.from(elements)) {
        if (el instanceof HTMLElement) {
            lasts.set(el, el.getBoundingClientRect());
        }
    }

    // Batch writes (Invert + Play)
    requestAnimationFrame(() => {
        for (const [el, lastRect] of lasts.entries()) {
            const id = el.getAttribute("data-id")!;
            const firstRect = snapshot.get(id);

            if (firstRect) {
                const dx = firstRect.left - lastRect.left;
                const dy = firstRect.top - lastRect.top;
                const dw = firstRect.width / lastRect.width;
                const dh = firstRect.height / lastRect.height;

                if (dx === 0 && dy === 0 && Math.abs(dw - 1) < 0.01 && Math.abs(dh - 1) < 0.01) continue;

                el.animate([
                    { transform: `translate(${dx}px, ${dy}px) scale(${dw}, ${dh})` },
                    { transform: "translate(0, 0) scale(1, 1)" }
                ], {
                    duration: durationMs,
                    easing: "cubic-bezier(0.2, 0, 0.2, 1)",
                });
            } else {
                // New element entering
                el.animate([
                    { opacity: 0, transform: "scale(0.9)" },
                    { opacity: 1, transform: "scale(1)" }
                ], { duration: durationMs });
            }
        }
    });
}
