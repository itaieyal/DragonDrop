import { DropTarget } from "../core/model";

// A cloned element that follows the cursor
let ghostEl: HTMLElement | null = null;
let ghostOffset = { x: 0, y: 0 };
let indicatorEl: HTMLElement | null = null;
let spacerEl: HTMLElement | null = null;
let spacerTimeout: number | null = null;
let activeSpacerKey: string | null = null;

export function createGhost(sourceEls: HTMLElement[], x: number, y: number) {
    if (ghostEl) hideGhost();

    ghostEl = document.createElement("div");
    ghostEl.className = "dd-ghost";

    // Position fixed at cursor
    ghostEl.style.position = "fixed";
    ghostEl.style.pointerEvents = "none";
    ghostEl.style.zIndex = "1000";
    ghostEl.style.top = "0";
    ghostEl.style.left = "0";

    if (sourceEls.length === 1) {
        const source = sourceEls[0];
        const rect = source.getBoundingClientRect();

        // Match dimensions strictly so the ghost looks exact
        ghostEl.style.width = `${rect.width}px`;
        ghostEl.style.height = `${rect.height}px`;

        const clone = source.cloneNode(true) as HTMLElement;
        // Strip IDs from clone to avoid duplicates
        clone.removeAttribute("data-id");
        clone.style.margin = "0"; // Reset margins since we position the ghost exactly

        ghostEl.appendChild(clone);

        // Calculate offset so the ghost is grabbed exactly where the user clicked
        ghostOffset = {
            x: x - rect.left,
            y: y - rect.top
        };
    } else {
        // Multi-select fallback (simple box)
        ghostEl.className = "dd-drag-preview";
        ghostEl.textContent = `${sourceEls.length} items`;
        ghostOffset = { x: -10, y: -10 };
    }

    document.body.appendChild(ghostEl);
    updateGhostPos(x, y);
}

export function updateGhostPos(x: number, y: number) {
    if (ghostEl) {
        ghostEl.style.transform = `translate(${x - ghostOffset.x}px, ${y - ghostOffset.y}px)`;
    }
}

export function hideGhost() {
    if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
    }
}

export function showDropIndicator(target: DropTarget, isRTL: boolean = false) {
    if (!indicatorEl) {
        indicatorEl = document.createElement("div");
        indicatorEl.className = "dd-drop-indicator";
        document.body.appendChild(indicatorEl);
    }

    // Find the DOM element for the target
    const targetEl = document.querySelector(`[data-id="${target.id}"]`);
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();

    // Position the indicator based on target geometry
    indicatorEl.style.display = "block";
    let top = 0, left = 0, width = 0, height = 0;

    // Use a very thin bar for dropping, but it will be complemented by a spacer in the actual DOM
    if (target.type === "token") {
        top = rect.top;
        height = rect.height;
        width = 4;

        if (isRTL) {
            left = target.side === "before" ? rect.right - 2 : rect.left - 2;
        } else {
            left = target.side === "before" ? rect.left - 2 : rect.right - 2;
        }
    } else if (target.type === "line" || target.type === "verse") {
        left = rect.left;
        width = rect.width;
        height = 4;
        top = target.side === "before" ? rect.top - 2 : rect.bottom - 2;
    } else if (target.type === "line-end") {
        top = rect.top;
        width = 4;
        height = rect.height;
        if (isRTL) {
            left = rect.left - 4;
        } else {
            left = rect.right + 4;
        }
    } else if (target.type === "verse-end") {
        left = rect.left;
        top = rect.bottom + 4;
        width = rect.width;
        height = 4;
    }

    // Include scroll offset for the thin yellow line
    indicatorEl.style.top = `${top + window.scrollY}px`;
    indicatorEl.style.left = `${left + window.scrollX}px`;
    indicatorEl.style.width = `${width}px`;
    indicatorEl.style.height = `${height}px`;

    // Handle the Spacer Element (pushes DOM apart)
    // We insert a zero-content spacer where the item WOULD drop to make room for it visually
    const sideKey = "side" in target ? target.side : "";
    const spacerKey = `${target.type}-${target.id}-${sideKey}`;

    if (activeSpacerKey !== spacerKey) {
        if (spacerTimeout) window.clearTimeout(spacerTimeout);
        activeSpacerKey = spacerKey;

        // Give the indicator box a small delay too so moving through quickly doesn't spam UI jumps
        indicatorEl.style.opacity = "0";
        setTimeout(() => { if (activeSpacerKey === spacerKey && indicatorEl) indicatorEl.style.opacity = "1"; }, 150);

        // If we have an existing spacer in a different spot, remove it immediately
        // to prevent it from pushing the DOM while we hover
        if (spacerEl && spacerEl.parentNode) {
            spacerEl.remove();
        }

        // Add 600ms delay before creating space to avoid stuttering as mouse moves over items
        spacerTimeout = window.setTimeout(() => {
            if (activeSpacerKey !== spacerKey) return; // stale

            if (!spacerEl) {
                spacerEl = document.createElement("div");
                spacerEl.className = "dd-spacer";
            }

            // Start collapsed for animation
            spacerEl.style.width = "0px";
            spacerEl.style.height = "0px";
            spacerEl.style.opacity = "0";

             if (target.type === "token" || target.type === "line-end") {
                 spacerEl.style.display = "inline-block";
                 if (target.type === "line-end") {
                     targetEl.appendChild(spacerEl);
                 } else {
                     if ("side" in target && target.side === "before") targetEl.parentNode?.insertBefore(spacerEl, targetEl);
                     else targetEl.parentNode?.insertBefore(spacerEl, targetEl.nextSibling);
                 }

                 // Force reflow
                 spacerEl.getBoundingClientRect();

                 const w = ghostEl ? ghostEl.getBoundingClientRect().width : 40;
                 spacerEl.style.width = `${w}px`;
                 spacerEl.style.height = `${rect.height}px`;
                 spacerEl.style.opacity = "0.1";
            } else {
                 spacerEl.style.display = "block";
                 if (target.type === "verse-end") {
                     targetEl.appendChild(spacerEl);
                 } else {
                     if ("side" in target && target.side === "before") targetEl.parentNode?.insertBefore(spacerEl, targetEl);
                     else targetEl.parentNode?.insertBefore(spacerEl, targetEl.nextSibling);
                 }

                 // Force reflow
                 spacerEl.getBoundingClientRect();

                 const h = ghostEl ? ghostEl.getBoundingClientRect().height : 40;
                 spacerEl.style.width = `100%`;
                 spacerEl.style.height = `${h}px`;
                 spacerEl.style.opacity = "0.1";
            }
        }, 400);
    }
}

export function hideDropIndicator() {
   if (indicatorEl) {
       indicatorEl.style.display = "none";
   }
   if (spacerTimeout) {
       window.clearTimeout(spacerTimeout);
       spacerTimeout = null;
   }
   activeSpacerKey = null;
   if (spacerEl) {
       spacerEl.remove();
       spacerEl = null;
   }
}

/**
 * Given screen coordinates and what we are dragging, determine the closest logical DropTarget
 */
export function getDropTargetFromPoint(x: number, y: number, dragType?: "token" | "line" | "verse", isRTL: boolean = false): DropTarget | null {
    // We temporarily hide the ghost and indicator so they don't block hit testing.
    if (ghostEl) ghostEl.style.pointerEvents = "none";
    if (indicatorEl) indicatorEl.style.pointerEvents = "none";

    const el = document.elementFromPoint(x, y) as HTMLElement;

    if (!el) return null;

    const targetNode = el.closest('[data-id]') as HTMLElement;
    if (!targetNode) return null;

    const id = targetNode.getAttribute("data-id")!;
    const type = targetNode.getAttribute("data-type")! as "verse" | "line" | "token";
    const rect = targetNode.getBoundingClientRect();

    if (dragType === "verse") {
        const lineNode = el.closest('.dd-line') as HTMLElement;
        if (lineNode) {
            const lRect = lineNode.getBoundingClientRect();
            const midY = lRect.top + lRect.height / 2;
            return { type: "line", id: lineNode.getAttribute("data-id")!, side: y < midY ? "before" : "after" };
        }

        const verseNode = el.closest('.dd-verse') as HTMLElement;
        if (!verseNode) return null;

        const lines = Array.from(verseNode.querySelectorAll('.dd-line')) as HTMLElement[];
        if (lines.length > 0) {
            const firstLine = lines[0];
            const lastLine = lines[lines.length - 1];

            if (y < firstLine.getBoundingClientRect().top) {
                 if (y < verseNode.getBoundingClientRect().top + 25) {
                     return { type: "verse", id: verseNode.getAttribute("data-id")!, side: "before" };
                 }
                 return { type: "line", id: firstLine.getAttribute("data-id")!, side: "before" };
            }

            if (y > lastLine.getBoundingClientRect().bottom) {
                 if (y > lastLine.getBoundingClientRect().bottom + 35) {
                     return { type: "verse-end", id: verseNode.getAttribute("data-id")! };
                 }
                 return { type: "line", id: lastLine.getAttribute("data-id")!, side: "after" };
            }
        }

        const vId = verseNode.getAttribute("data-id")!;
        const vRect = verseNode.getBoundingClientRect();
        const midY = vRect.top + vRect.height / 2;
        return { type: "verse", id: vId, side: y < midY ? "before" : "after" };
    }

    if (dragType === "line") {
        // Can drop lines relative to lines or inside verses
        // Can drop lines relative to lines or inside verses
        if (type === "token") {
            const lineNode = el.closest('.dd-line') as HTMLElement;
            if (lineNode) {
                // If we are over a token, we want to allow dropping between tokens!
                // Evaluate dropping inside the line or at the end
                const tokens = Array.from(lineNode.querySelectorAll('.dd-token')) as HTMLElement[];

                // If close to top/bottom edge, maybe we are dropping between lines
                const lRect = lineNode.getBoundingClientRect();
                const yPct = (y - lRect.top) / lRect.height;

                const lId = lineNode.getAttribute("data-id")!;
                if (tokens.length === 0 || yPct < 0.2) return { type: "line", id: lId, side: "before" };
                if (yPct > 0.8) return { type: "line", id: lId, side: "after" };

                let closestToken: HTMLElement | null = null;
                let minDistance = Infinity;

                for (const t of tokens) {
                    const tRect = t.getBoundingClientRect();
                    const dist = Math.abs(x - (tRect.left + tRect.width / 2));
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestToken = t;
                    }
                }

                if (closestToken) {
                    const lastToken = tokens[tokens.length - 1];
                    if (isRTL) {
                        if (x < lastToken.getBoundingClientRect().left - 8) {
                             return { type: "line-end", id: lId };
                        }
                    } else {
                        if (x > lastToken.getBoundingClientRect().right + 8) {
                             return { type: "line-end", id: lId };
                        }
                    }

                    const tRect = closestToken.getBoundingClientRect();
                    const midX = tRect.left + tRect.width / 2;
                    return {
                        type: "token",
                        id: closestToken.getAttribute("data-id")!,
                        side: isRTL ? (x > midX ? "before" : "after") : (x < midX ? "before" : "after")
                    };
                }
            }
        }
        if (type === "line") {
            const midY = rect.top + rect.height / 2;
            return { type: "line", id, side: y < midY ? "before" : "after" };
        }
        if (type === "verse") {
            const lines = Array.from(targetNode.querySelectorAll('.dd-line'));
            if (lines.length === 0) return { type: "verse", id, side: "before" };
            const lastLine = lines[lines.length - 1] as HTMLElement;
            if (y > lastLine.getBoundingClientRect().bottom + 5) {
                return { type: "verse-end", id };
            }
            return { type: "verse", id, side: y < rect.top + rect.height / 2 ? "before" : "after" };
        }
        return null;
    }

    // Dragging tokens and lines (lines can merge into other lines via tokens):
    if (type === "token") {
        const midX = rect.left + rect.width / 2;
        return { type: "token", id, side: isRTL ? (x > midX ? "before" : "after") : (x < midX ? "before" : "after") };
    } else if (type === "line") {
        // Evaluate dropping inside the line or at the end. But FIRST check if we are dropping into a verse gap.
        const verseNode = el.closest('.dd-verse') as HTMLElement;
        if (verseNode) {
            const lines = Array.from(verseNode.querySelectorAll('.dd-line')) as HTMLElement[];
            if (lines.length > 0) {
                const lastLine = lines[lines.length - 1];
                // If we're dragging a line significantly below all other lines in a verse,
                // offer to drop it at the "verse-end" which makes it a new verse based on our new moveSemantics
                if (y > lastLine.getBoundingClientRect().bottom + 20) {
                    return { type: "verse-end", id: verseNode.getAttribute("data-id")! };
                }
            }
        }

        const tokens = Array.from(targetNode.querySelectorAll('.dd-token')) as HTMLElement[];

        // If close to top/bottom edge, maybe we are dropping between lines
        const yPct = (y - rect.top) / rect.height;
        if (tokens.length === 0 || yPct < 0.2) return { type: "line", id, side: "before" };
        if (yPct > 0.8) return { type: "line", id, side: "after" };

        let closestToken: HTMLElement | null = null;
        let minDistance = Infinity;

        for (const t of tokens) {
            const tRect = t.getBoundingClientRect();
            const dist = Math.abs(x - (tRect.left + tRect.width / 2));
            if (dist < minDistance) {
                minDistance = dist;
                closestToken = t;
            }
        }

        if (closestToken) {
            const lastToken = tokens[tokens.length - 1];
            if (isRTL) {
                if (x < lastToken.getBoundingClientRect().left - 8) {
                     return { type: "line-end", id };
                }
            } else {
                if (x > lastToken.getBoundingClientRect().right + 8) {
                     return { type: "line-end", id };
                }
            }

            const tRect = closestToken.getBoundingClientRect();
            const midX = tRect.left + tRect.width / 2;
            return {
                type: "token",
                id: closestToken.getAttribute("data-id")!,
                side: isRTL ? (x > midX ? "before" : "after") : (x < midX ? "before" : "after")
            };
        }
    } else if (type === "verse") {
        const lines = Array.from(targetNode.querySelectorAll('.dd-line')) as HTMLElement[];
        if (lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            if (y > lastLine.getBoundingClientRect().bottom + 10) {
                return { type: "verse-end", id };
            }
        } else {
             return { type: "verse", id, side: "before" };
        }
    }

    return null;
}
