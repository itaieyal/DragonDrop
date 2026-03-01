import { Doc, DropTarget, Line, SelectionState, Verse, Token, Id } from "./model";

type InsertPoint = {
  verseId: Id;
  lineIndex?: number;  // if dropping lines
  tokenLineId?: Id;    // if dropping tokens
  tokenIndex?: number; // if dropping tokens
};

/**
 * Resolves a visual DropTarget into a precise insertion coordinate within the Document.
 */
function resolveDropTarget(doc: Doc, target: DropTarget): InsertPoint | null {
  for (let v = 0; v < doc.verses.length; v++) {
    const verse = doc.verses[v];

    if (target.type === "verse" && target.id === verse.id) {
      return { verseId: verse.id, lineIndex: target.side === "before" ? 0 : verse.lines.length };
    }
    if (target.type === "verse-end" && target.id === verse.id) {
      return { verseId: verse.id, lineIndex: verse.lines.length };
    }

    for (let l = 0; l < verse.lines.length; l++) {
      const line = verse.lines[l];

      if (target.type === "line" && target.id === line.id) {
        return { verseId: verse.id, lineIndex: target.side === "before" ? l : l + 1 };
      }
      if (target.type === "line-end" && target.id === line.id) {
        return { verseId: verse.id, tokenLineId: line.id, tokenIndex: line.tokens.length };
      }

      for (let t = 0; t < line.tokens.length; t++) {
        const token = line.tokens[t];
        if (target.type === "token" && target.id === token.id) {
          return { verseId: verse.id, tokenLineId: line.id, tokenIndex: target.side === "before" ? t : t + 1 };
        }
      }
    }
  }
  return null;
}

export function moveSelection(
  doc: Doc,
  selection: SelectionState,
  target: DropTarget
): { doc: Doc; selection: SelectionState } {
  const insertPt = resolveDropTarget(doc, target);
  if (!insertPt) return { doc, selection }; // Invalid drop target

  // Fast path: No items to move
  if (selection.items.length === 0) return { doc, selection };

  // Assume homogenous selection types for DnD rules
  const dragType = selection.items[0].type;
  if (!selection.items.every(i => i.type === dragType)) {
     // If mixed, do nothing for now (canonicalize should have handled this, but just in case)
     return { doc, selection };
  }

  // Deep clone doc to stay pure
  const cloneDoc: Doc = JSON.parse(JSON.stringify(doc));

  // Find all items in clone to remove
  const itemsToMove: { type: string, data: any }[] = [];
  const selectedIds = new Set(selection.items.map(i => i.id));

  // 1. REMOVE PHASE
  for (let v = cloneDoc.verses.length - 1; v >= 0; v--) {
     const verse = cloneDoc.verses[v];

     if (dragType === "verse" && selectedIds.has(verse.id)) {
        itemsToMove.unshift({ type: "verse", data: verse });
        cloneDoc.verses.splice(v, 1);
        continue;
     }

     for (let l = verse.lines.length - 1; l >= 0; l--) {
        const line = verse.lines[l];

        if (dragType === "line" && selectedIds.has(line.id)) {
           itemsToMove.unshift({ type: "line", data: line });
           verse.lines.splice(l, 1);
           continue;
        }

        if (dragType === "token") {
            const extractedTokens: Token[] = [];
            for (let t = line.tokens.length - 1; t >= 0; t--) {
                const token = line.tokens[t];
                if (selectedIds.has(token.id)) {
                   extractedTokens.unshift(token);
                   line.tokens.splice(t, 1);
                }
            }
            if (extractedTokens.length > 0) {
               // We need to keep group order, but if they came from different lines they merge.
               // unshift is used because we iterate backwards, so it restores natural order.
               // We just push them to a flat list of tokens to move.
               itemsToMove.unshift(...extractedTokens.map(t => ({ type: "token", data: t })));
            }
        }
     }
  }

  // We should preserve exact order of items as they appeared in the *original* document,
  // not selection order. The iteration above (`unshift`) naturally handles this.

  // 2. INSERT PHASE
  // Re-resolve insert point using the cloned document structures and IDs (indices may have shifted during remove)
  // Therefore, it's safer to resolve using target.id again.
  const newInsertPt = resolveDropTarget(cloneDoc, target);

  if (!newInsertPt) {
      // If the target element was deleted (e.g. dropped onto itself), just return original (cancel drop)
      return { doc, selection };
  }

  const targetVerse = cloneDoc.verses.find(v => v.id === newInsertPt.verseId);
  if (!targetVerse) return { doc, selection };

  if (dragType === "verse") {
     const versesGroup = itemsToMove.map(i => i.data as Verse);
     if (target.type === "line") {
         // Merging into lines of a verse!
         const linesToInsert = versesGroup.flatMap(v => v.lines);
         if (newInsertPt.lineIndex !== undefined) {
             targetVerse.lines.splice(newInsertPt.lineIndex, 0, ...linesToInsert);
         }
     } else {
         const targetIdx = cloneDoc.verses.findIndex(v => v.id === target.id);
         let finalIdx = targetIdx !== -1 ? targetIdx : 0;
         if (target.type === "verse" && target.side === "after") finalIdx += 1;
         if (target.type === "verse-end") finalIdx += 1;
         cloneDoc.verses.splice(finalIdx, 0, ...versesGroup);
     }
  } else if (dragType === "line") {
     const linesGroup = itemsToMove.map(i => i.data as Line);
     if (target.type === "verse" || target.type === "verse-end") {
         // Dropped a line directly onto a verse level (e.g. verse-end or between verses)
         // Default behavior: create a new verse for the lines.
         const newVerse: Verse = { id: `verse-moved-${Date.now()}`, lines: linesGroup };
         const targetIdx = cloneDoc.verses.findIndex(v => v.id === target.id);
         let finalIdx = targetIdx !== -1 ? targetIdx : 0;
         if (target.type === "verse-end" || (target.type === "verse" && target.side === "after")) finalIdx += 1;
         cloneDoc.verses.splice(finalIdx, 0, newVerse);
     } else if (newInsertPt.tokenLineId) {
         // Dropping a line into a token stream -> Extract all tokens from the lines and merge them
         const targetLine = targetVerse.lines.find(l => l.id === newInsertPt.tokenLineId);
         if (targetLine && newInsertPt.tokenIndex !== undefined) {
             const mergedTokens = linesGroup.flatMap(l => l.tokens);
             targetLine.tokens.splice(newInsertPt.tokenIndex, 0, ...mergedTokens);
         }
     } else if (newInsertPt.lineIndex !== undefined) {
         // Standard dropping a line between other lines
         targetVerse.lines.splice(newInsertPt.lineIndex, 0, ...linesGroup);
     }
  } else if (dragType === "token") {
     const tokensGroup = itemsToMove.map(i => i.data as Token);
     if (newInsertPt.tokenLineId) {
         const targetLine = targetVerse.lines.find(l => l.id === newInsertPt.tokenLineId);
         if (targetLine && newInsertPt.tokenIndex !== undefined) {
             targetLine.tokens.splice(newInsertPt.tokenIndex, 0, ...tokensGroup);
         }
     } else if (newInsertPt.lineIndex !== undefined) {
         // Dropped tokens directly onto a line level (e.g. between lines or empty verse)
         // Default behavior: create a new line for the tokens.
         const newLine: Line = { id: `line-moved-${Date.now()}`, tokens: tokensGroup };
         targetVerse.lines.splice(newInsertPt.lineIndex, 0, newLine);
     }
  }

  // Clean up any empty items resulting from the move
  cloneDoc.verses = cloneDoc.verses.filter(v =>
    dragType === "verse" || v.lines.length > 0
  );

  for (const v of cloneDoc.verses) {
      v.lines = v.lines.filter(l => dragType === "line" || l.tokens.length > 0);
  }

  return { doc: cloneDoc, selection };
}
