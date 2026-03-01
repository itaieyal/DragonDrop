import { Doc, Id, Line, SelectionItem, SelectionState, Verse } from "./model";

/**
 * Ensures deterministic selection state.
 * Rule: If a verse is selected, its lines/tokens cannot be in the selection.
 * Rule: If a line is selected, its tokens cannot be in the selection.
 */
export function canonicalizeSelection(doc: Doc, selection: SelectionState): SelectionState {
  // 1. Build a lookup for quick ancestry checks
  const verseMap = new Map<Id, Verse>();
  const lineMap = new Map<Id, Line>();
  const lineToVerse = new Map<Id, Id>();
  const tokenToLine = new Map<Id, Id>();

  for (const verse of doc.verses) {
    verseMap.set(verse.id, verse);
    for (const line of verse.lines) {
      lineMap.set(line.id, line);
      lineToVerse.set(line.id, verse.id);
      for (const token of line.tokens) {
        tokenToLine.set(token.id, line.id);
      }
    }
  }

  // 2. Identify selected parents
  const selectedVerses = new Set<Id>();
  const selectedLines = new Set<Id>();

  for (const item of selection.items) {
    if (item.type === "verse") selectedVerses.add(item.id);
    if (item.type === "line") selectedLines.add(item.id);
  }

  // 3. Filter items that are subsumed by their parents
  const retained: SelectionItem[] = [];

  for (const item of selection.items) {
    if (item.type === "verse" || item.type === "empty-verse" || item.type === "empty-line") {
      retained.push(item);
    } else if (item.type === "line") {
      const parentVerseId = lineToVerse.get(item.id);
      if (!parentVerseId || !selectedVerses.has(parentVerseId)) {
        retained.push(item);
      }
    } else if (item.type === "token") {
      const parentLineId = tokenToLine.get(item.id);
      if (parentLineId) {
        const parentVerseId = lineToVerse.get(parentLineId);
        if (!selectedLines.has(parentLineId) && (!parentVerseId || !selectedVerses.has(parentVerseId))) {
          retained.push(item);
        }
      } else {
        retained.push(item);
      }
    }
  }

  // Return deduped by ID as well
  const uniqueItems = Array.from(new Map(retained.map(i => [`${i.type}:${i.id}`, i])).values());

  return {
    ...selection,
    items: uniqueItems
  };
}

/**
 * Toggles or sets an item in the selection.
 */
export function toggleSelect(selection: SelectionState, item: SelectionItem, additive: boolean): SelectionState {
  const isSelected = selection.items.some(i => i.type === item.type && i.id === item.id);

  let newItems: SelectionItem[];
  if (!additive) {
    newItems = [item];
  } else if (isSelected) {
    newItems = selection.items.filter(i => !(i.type === item.type && i.id === item.id));
  } else {
    newItems = [...selection.items, item];
  }

  return {
    items: newItems,
    anchor: item,
    focus: item,
    mode: item.type
  };
}

/**
 * Implements complex range selection (shift+click).
 */
export function rangeSelect(doc: Doc, selection: SelectionState, target: SelectionItem, crossLines: boolean = false): SelectionState {
  if (!selection.anchor) {
    return toggleSelect(selection, target, false);
  }

  const anchor = selection.anchor;

  // Fast path if same item
  if (anchor.type === target.type && anchor.id === target.id) {
    return selection;
  }

  // We need a flattened ordered list of everything to find ranges.
  const allTokens: SelectionItem[] = [];
  const allLines: SelectionItem[] = [];
  const allVerses: SelectionItem[] = [];

  for (const verse of doc.verses) {
    allVerses.push({ type: "verse", id: verse.id });
    for (const line of verse.lines) {
      allLines.push({ type: "line", id: line.id });
      for (const token of line.tokens) {
        allTokens.push({ type: "token", id: token.id });
      }
    }
  }

  let rangeItems: SelectionItem[] = [];

  if (anchor.type === "verse" || target.type === "verse") {
     // If either is a verse, resolve range as verses
     // To simplify rules: if types mismatch, we snap up to the highest requested type.
     const getVerseId = (item: SelectionItem) => {
        if (item.type === "verse") return item.id;
        if (item.type === "line") return doc.verses.find(v => v.lines.some(l => l.id === item.id))?.id;
        if (item.type === "token") return doc.verses.find(v => v.lines.some(l => l.tokens.some(t => t.id === item.id)))?.id;
     };

     const startV = getVerseId(anchor);
     const endV = getVerseId(target);
     const idxStart = allVerses.findIndex(v => v.id === startV);
     const idxEnd = allVerses.findIndex(v => v.id === endV);

     if (idxStart !== -1 && idxEnd !== -1) {
       const [min, max] = [Math.min(idxStart, idxEnd), Math.max(idxStart, idxEnd)];
       rangeItems = allVerses.slice(min, max + 1);
     }
  } else if (anchor.type === "line" || target.type === "line") {
     const getLineId = (item: SelectionItem) => {
       if (item.type === "line") return item.id;
       if (item.type === "token") return doc.verses.flatMap(v => v.lines).find(l => l.tokens.some(t => t.id === item.id))?.id;
     };

     const startL = getLineId(anchor);
     const endL = getLineId(target);
     const idxStart = allLines.findIndex(l => l.id === startL);
     const idxEnd = allLines.findIndex(l => l.id === endL);

     if (idxStart !== -1 && idxEnd !== -1) {
       const [min, max] = [Math.min(idxStart, idxEnd), Math.max(idxStart, idxEnd)];
       rangeItems = allLines.slice(min, max + 1);
     }
  } else if (anchor.type === "token" && target.type === "token") {
    const parentStartLine = doc.verses.flatMap(v => v.lines).find(l => l.tokens.some(t => t.id === anchor.id))?.id;
    const parentEndLine = doc.verses.flatMap(v => v.lines).find(l => l.tokens.some(t => t.id === target.id))?.id;

    if (parentStartLine === parentEndLine) {
        // Same line tokens
        const idxStart = allTokens.findIndex(t => t.id === anchor.id);
        const idxEnd = allTokens.findIndex(t => t.id === target.id);
        const [min, max] = [Math.min(idxStart, idxEnd), Math.max(idxStart, idxEnd)];
        rangeItems = allTokens.slice(min, max + 1);
    } else if (crossLines) {
        // Cross line tokens
        const idxStart = allTokens.findIndex(t => t.id === anchor.id);
        const idxEnd = allTokens.findIndex(t => t.id === target.id);
        const [min, max] = [Math.min(idxStart, idxEnd), Math.max(idxStart, idxEnd)];
        rangeItems = allTokens.slice(min, max + 1);
    } else {
        // Cross line tokens but options say select lines instead
        const idxStart = allLines.findIndex(l => l.id === parentStartLine);
        const idxEnd = allLines.findIndex(l => l.id === parentEndLine);
        const [min, max] = [Math.min(idxStart, idxEnd), Math.max(idxStart, idxEnd)];
        rangeItems = allLines.slice(min, max + 1);
    }
  }

  // Combine with existing (or replace based on standard shift-click OS behavior - usually replaces unless cmd is held, we'll replace the non-anchor parts for simplicity)
  // We'll fully replace items with the range but keep the old anchor.
  return {
    items: rangeItems,
    anchor: selection.anchor,
    focus: target,
    mode: target.type
  };
}
