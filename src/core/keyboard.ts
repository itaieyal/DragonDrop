import { Doc, SelectionState, SelectionItem, DropTarget } from "./model";
import { canonicalizeSelection, rangeSelect } from "./selection";
import { moveSelection } from "./move";

export function handleKeyboardNavigation(
    doc: Doc,
    selection: SelectionState,
    key: string,
    shift: boolean,
    alt: boolean,
    isRTL: boolean
): { doc?: Doc; selection?: SelectionState } | null {
    if (selection.items.length === 0) {
        if (key.startsWith("Arrow") && doc.verses.length > 0 && doc.verses[0].lines.length > 0 && doc.verses[0].lines[0].tokens.length > 0) {
            const firstToken = doc.verses[0].lines[0].tokens[0];
            const targetNode: SelectionItem = { type: "token", id: firstToken.id };
            return {
                selection: {
                    items: [targetNode],
                    anchor: targetNode,
                    focus: targetNode,
                    mode: "token"
                }
            };
        }
        return null;
    }

    // Ordered list of all interactable nodes
    const flattenDoc = () => {
        const list: SelectionItem[] = [];
        if (doc.verses.length === 0) {
            list.push({ type: "empty-verse", id: `${doc.id}-empty-verse` });
        } else {
            list.push({ type: "empty-verse", id: `${doc.verses[0].id}-empty-verse-start` });
            for (const v of doc.verses) {
                list.push({ type: "verse", id: v.id });
                if (v.lines.length === 0) {
                    list.push({ type: "empty-line", id: `${v.id}-empty-line` });
                } else {
                    list.push({ type: "empty-line", id: `${v.lines[0].id}-empty-line-start` });
                    for (const l of v.lines) {
                        list.push({ type: "line", id: l.id });
                        for (const t of l.tokens) {
                            list.push({ type: "token", id: t.id });
                        }
                    }
                    list.push({ type: "empty-line", id: `${v.lines[v.lines.length - 1].id}-empty-line-end` });
                }
            }
            list.push({ type: "empty-verse", id: `${doc.verses[doc.verses.length - 1].id}-empty-verse-end` });
        }
        return list;
    };

    const flatNodes = flattenDoc();
    const currentAnchor = selection.focus || selection.anchor || selection.items[selection.items.length - 1];

    if (!currentAnchor) return null;

    const findIndex = (item: SelectionItem) => flatNodes.findIndex(i => i.type === item.type && i.id === item.id);
    let currentIndex = findIndex(currentAnchor);

    if (currentIndex === -1) return null;

    // Movement Domain Map
    const getNextIndex = (dir: "up" | "down" | "left" | "right") => {
        let nextIdx = currentIndex;

        if (dir === "left") {
            nextIdx--;
        } else if (dir === "right") {
            nextIdx++;
        } else if (dir === "up") {
            if (currentAnchor.type === "token") {
                // Up from token selects its parent Line
                while (nextIdx >= 0 && flatNodes[nextIdx].type !== "line") nextIdx--;
            } else if (currentAnchor.type === "empty-line") {
                nextIdx--;
                while (nextIdx >= 0 && flatNodes[nextIdx].type !== "line" && flatNodes[nextIdx].type !== "empty-line") nextIdx--;
            } else if (currentAnchor.type === "empty-verse") {
                nextIdx--;
                while (nextIdx >= 0 && flatNodes[nextIdx].type !== "verse" && flatNodes[nextIdx].type !== "empty-verse") nextIdx--;
            } else {
                nextIdx--;
                while (nextIdx >= 0 && flatNodes[nextIdx].type !== currentAnchor.type) nextIdx--;
            }
        } else if (dir === "down") {
            if (currentAnchor.type === "token") {
                // Down from token selects the next Line
                nextIdx++;
                while (nextIdx < flatNodes.length && flatNodes[nextIdx].type !== "line") nextIdx++;
            } else if (currentAnchor.type === "empty-line") {
                nextIdx++;
                while (nextIdx < flatNodes.length && flatNodes[nextIdx].type !== "line" && flatNodes[nextIdx].type !== "empty-line") nextIdx++;
            } else if (currentAnchor.type === "empty-verse") {
                nextIdx++;
                while (nextIdx < flatNodes.length && flatNodes[nextIdx].type !== "verse" && flatNodes[nextIdx].type !== "empty-verse") nextIdx++;
            } else {
                nextIdx++;
                while (nextIdx < flatNodes.length && flatNodes[nextIdx].type !== currentAnchor.type) nextIdx++;
            }
        }

        return Math.max(0, Math.min(nextIdx, flatNodes.length - 1));
    };

    let dir: "up"|"down"|"left"|"right" | null = null;

    if (key === "ArrowUp") dir = "up";
    if (key === "ArrowDown") dir = "down";
    if (key === "ArrowLeft") dir = isRTL ? "right" : "left";
    if (key === "ArrowRight") dir = isRTL ? "left" : "right";

    if (!dir) return null;

    if (alt) {
        let targetDrop: DropTarget | null = null;
        const dragType = selection.items[0].type;

        if (dragType === "token") {
            const firstId = selection.items[0].id;
            const lastId = selection.items[selection.items.length - 1].id;
            let vIdx = -1, lIdx = -1, tFirst = -1, tLast = -1;

            for (let v=0; v<doc.verses.length; v++) {
                for (let l=0; l<doc.verses[v].lines.length; l++) {
                    const line = doc.verses[v].lines[l];
                    const t1 = line.tokens.findIndex(t => t.id === firstId);
                    const t2 = line.tokens.findIndex(t => t.id === lastId);
                    if (t1 !== -1) { vIdx = v; lIdx = l; tFirst = t1; }
                    if (t2 !== -1) { tLast = t2; }
                }
            }

            if (vIdx !== -1 && lIdx !== -1) {
                if (dir === "left") {
                    if (tFirst > 0) {
                        targetDrop = { type: "token", id: doc.verses[vIdx].lines[lIdx].tokens[tFirst - 1].id, side: "before" } as DropTarget;
                    } else {
                        let targetLIdx = lIdx - 1;
                        let targetVIdx = vIdx;
                        if (targetLIdx < 0) {
                            targetVIdx = vIdx - 1;
                            if (targetVIdx >= 0) targetLIdx = doc.verses[targetVIdx].lines.length - 1;
                        }
                        if (targetVIdx >= 0 && targetLIdx >= 0) {
                            const targetLine = doc.verses[targetVIdx].lines[targetLIdx];
                            if (targetLine.tokens.length > 0) {
                                targetDrop = { type: "token", id: targetLine.tokens[targetLine.tokens.length - 1].id, side: "after" } as DropTarget;
                            } else {
                                targetDrop = { type: "line-end", id: targetLine.id, side: "after" } as any;
                            }
                        }
                    }
                } else if (dir === "right") {
                    const currentLine = doc.verses[vIdx].lines[lIdx];
                    if (tLast < currentLine.tokens.length - 1) {
                        targetDrop = { type: "token", id: currentLine.tokens[tLast + 1].id, side: "after" } as DropTarget;
                    } else {
                        let targetLIdx = lIdx + 1;
                        let targetVIdx = vIdx;
                        if (targetLIdx >= doc.verses[targetVIdx].lines.length) {
                            targetVIdx = vIdx + 1;
                            targetLIdx = 0;
                        }
                        if (targetVIdx < doc.verses.length && targetLIdx < doc.verses[targetVIdx].lines.length) {
                            const targetLine = doc.verses[targetVIdx].lines[targetLIdx];
                            if (targetLine.tokens.length > 0) {
                                targetDrop = { type: "token", id: targetLine.tokens[0].id, side: "before" } as DropTarget;
                            } else {
                                targetDrop = { type: "line-end", id: targetLine.id, side: "after" } as any;
                            }
                        }
                    }
                } else if (dir === "up") {
                    targetDrop = { type: "line", id: doc.verses[vIdx].lines[lIdx].id, side: "before" } as DropTarget;
                } else if (dir === "down") {
                    targetDrop = { type: "line", id: doc.verses[vIdx].lines[lIdx].id, side: "after" } as DropTarget;
                }
            }
        } else if (dragType === "line") {
            const firstId = selection.items[0].id;
            const lastId = selection.items[selection.items.length - 1].id;
            let vIdx = -1, lFirst = -1, lLast = -1;

            for (let v=0; v<doc.verses.length; v++) {
                const l1 = doc.verses[v].lines.findIndex(l => l.id === firstId);
                const l2 = doc.verses[v].lines.findIndex(l => l.id === lastId);
                if (l1 !== -1) { vIdx = v; lFirst = l1; }
                if (l2 !== -1) { lLast = l2; }
            }

            if (vIdx !== -1) {
                if (dir === "up" || dir === "left") {
                    if (lFirst > 0) {
                        targetDrop = { type: "line", id: doc.verses[vIdx].lines[lFirst - 1].id, side: "before" } as DropTarget;
                    } else {
                        if (vIdx > 0) {
                            const prevVerse = doc.verses[vIdx - 1];
                            if (prevVerse.lines.length > 0) {
                                targetDrop = { type: "line", id: prevVerse.lines[prevVerse.lines.length - 1].id, side: "after" } as DropTarget;
                            } else {
                                targetDrop = { type: "verse-end", id: prevVerse.id, side: "after" } as any;
                            }
                        } else {
                            targetDrop = { type: "verse", id: doc.verses[0].id, side: "before" } as DropTarget;
                        }
                    }
                } else if (dir === "down" || dir === "right") {
                    const currentVerse = doc.verses[vIdx];
                    if (lLast < currentVerse.lines.length - 1) {
                        targetDrop = { type: "line", id: currentVerse.lines[lLast + 1].id, side: "after" } as DropTarget;
                    } else {
                        if (vIdx < doc.verses.length - 1) {
                            const nextVerse = doc.verses[vIdx + 1];
                            if (nextVerse.lines.length > 0) {
                                targetDrop = { type: "line", id: nextVerse.lines[0].id, side: "before" } as DropTarget;
                            } else {
                                targetDrop = { type: "verse-end", id: nextVerse.id, side: "after" } as any;
                            }
                        } else {
                            targetDrop = { type: "verse", id: doc.verses[doc.verses.length - 1].id, side: "after" } as DropTarget;
                        }
                    }
                }
            }
        } else if (dragType === "verse") {
            const firstId = selection.items[0].id;
            const lastId = selection.items[selection.items.length - 1].id;
            const vFirst = doc.verses.findIndex(v => v.id === firstId);
            const vLast = doc.verses.findIndex(v => v.id === lastId);

            if (vFirst !== -1) {
                if (dir === "up" || dir === "left") {
                    if (vFirst > 0) {
                        targetDrop = { type: "verse", id: doc.verses[vFirst - 1].id, side: "before" } as DropTarget;
                    }
                } else if (dir === "down" || dir === "right") {
                    if (vLast < doc.verses.length - 1) {
                        targetDrop = { type: "verse", id: doc.verses[vLast + 1].id, side: "after" } as DropTarget;
                    }
                }
            }
        }

        if (targetDrop) {
            const res = moveSelection(doc, selection, targetDrop);
            if (res.doc !== doc) {
                return { doc: res.doc, selection: canonicalizeSelection(res.doc, res.selection || selection) };
            }
        }
        return null;
    } else if (shift) {
        // Range Select
        const nextIdx = getNextIndex(dir);
        if (nextIdx === currentIndex) return null;
        const targetNode = flatNodes[nextIdx];
        const newSel = rangeSelect(doc, selection, targetNode, true);
        return { selection: newSel };
    } else {
        // Pure navigation (change focus)
        const nextIdx = getNextIndex(dir);
        if (nextIdx === currentIndex) return null;
        const targetNode = flatNodes[nextIdx];
        return {
            selection: {
                items: [targetNode],
                anchor: targetNode,
                focus: targetNode,
                mode: targetNode.type
            }
        };
    }
}
