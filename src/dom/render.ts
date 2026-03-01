import { Doc, Line, Token, Verse, SelectionState } from "../core/model";

export type Renderers = {
  verse?: (verse: Verse) => HTMLElement;
  line?: (line: Line) => HTMLElement;
  token?: (token: Token) => HTMLElement;
};

function defaultVerseRenderer(_verse: Verse): HTMLElement {
  const el = document.createElement("div");
  el.className = "dd-verse";
  const handle = document.createElement("div");
  handle.className = "dd-drag-handle dd-verse-handle";
  handle.title = "Drag Verse";
  el.appendChild(handle);
  return el;
}

function defaultEmptyVerseRenderer(_item: { id: string }): HTMLElement {
  const el = document.createElement("div");
  el.className = "dd-empty-verse";
  return el;
}

function defaultLineRenderer(_line: Line): HTMLElement {
  const el = document.createElement("div");
  el.className = "dd-line";
  const handle = document.createElement("div");
  handle.className = "dd-drag-handle dd-line-handle";
  handle.title = "Drag Line";
  el.appendChild(handle);
  return el;
}

function defaultEmptyLineRenderer(_item: { id: string }): HTMLElement {
  const el = document.createElement("div");
  el.className = "dd-empty-line";
  return el;
}

function defaultTokenRenderer(token: Token): HTMLElement {
  const el = document.createElement("span");
  el.className = `dd-token dd-token-${token.kind}`;
  el.textContent = token.text;
  return el;
}

/**
 * Reconciles a `Doc` against an actual `HTMLElement` container.
 * It uses simple ID-keyed patching to reuse existing DOM nodes.
 * O(N) where N is number of total items in Doc.
 */
export function patchDOM(container: HTMLElement, doc: Doc, customRenderers?: Renderers, suggestedId?: string) {
  const renderVerse = customRenderers?.verse || defaultVerseRenderer;
  const renderLine = customRenderers?.line || defaultLineRenderer;
  const renderToken = customRenderers?.token || defaultTokenRenderer;

  // Track what we expect to exist after this patch
  const expectedIds = new Set<string>();

  // 1. Recursive Patch Function
  // We synchronize the children of `parentEl` to match the `items` array.
  function syncChildren<T extends { id: string }>(
    parentEl: HTMLElement,
    items: T[],
    getTypeInfo: (item: T) => string,
    createEl: (item: T, typeInfo: string) => HTMLElement,
    updateEl?: (item: T, el: HTMLElement, typeInfo: string) => void
  ) {
    // Collect existing keyed children in this parent
    const existing = new Map<string, HTMLElement>();
    for (const child of Array.from(parentEl.children)) {
      if (child instanceof HTMLElement) {
        const id = child.getAttribute("data-id");
        if (id) existing.set(id, child);
      }
    }

    // Ensure children match `items` order and count
    let currentDOMIdx = 0;

    // Skip any non-keyed children at the start
    while (currentDOMIdx < parentEl.children.length &&
           !(parentEl.children[currentDOMIdx] as HTMLElement).hasAttribute('data-id')) {
        currentDOMIdx++;
    }

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const currentTypeInfo = getTypeInfo(item);
        expectedIds.add(`${currentTypeInfo}:${item.id}`);

        let el = existing.get(item.id);
        if (!el || el.getAttribute("data-type") !== currentTypeInfo) {
           // If type changed (e.g., ID collision which shouldn't happen, but just in case), recreate
           if (el) parentEl.removeChild(el);

           el = createEl(item, currentTypeInfo);
           el.setAttribute("data-id", item.id);
           el.setAttribute("data-type", currentTypeInfo);
           if (item.id === suggestedId) el.classList.add("dd-suggested");
           else el.classList.remove("dd-suggested");

           // Insert at correct position
           if (currentDOMIdx < parentEl.children.length) {
              parentEl.insertBefore(el, parentEl.children[currentDOMIdx]);
           } else {
              parentEl.appendChild(el);
           }
        } else {
           // Move existing if it's in the wrong place
           if (parentEl.children[currentDOMIdx] !== el) {
               parentEl.insertBefore(el, parentEl.children[currentDOMIdx]);
           }
           if (item.id === suggestedId) el.classList.add("dd-suggested");
           else el.classList.remove("dd-suggested");
        }

        if (updateEl) {
           updateEl(item, el, currentTypeInfo);
        }

        currentDOMIdx++;
        // Skip non-keyed children that might naturally sit between items
        while (currentDOMIdx < parentEl.children.length &&
               !(parentEl.children[currentDOMIdx] as HTMLElement).hasAttribute('data-id')) {
            currentDOMIdx++;
        }
    }

    // Remove any leftover children that shouldn't be here
    // (We iterate backwards to safely remove while iterating)
    for (let i = parentEl.children.length - 1; i >= currentDOMIdx; i--) {
        const child = parentEl.children[i];
        if (child instanceof HTMLElement && child.hasAttribute('data-id')) {
            parentEl.removeChild(child);
        }
    }
  }

  // 2. Drive the tree sync
  const verseItems = doc.verses.length === 0
      ? [{ id: `${doc.id}-empty-verse`, _isVirtual: "empty-verse" as const }]
      : [
          { id: `${doc.verses[0].id}-empty-verse-start`, _isVirtual: "empty-verse" as const },
          ...doc.verses,
          { id: `${doc.verses[doc.verses.length - 1].id}-empty-verse-end`, _isVirtual: "empty-verse" as const }
      ];

  syncChildren(container, verseItems,
      (v) => (v as any)._isVirtual || "verse",
      (v, type) => type === "verse" ? renderVerse(v as Verse) : defaultEmptyVerseRenderer(v),
      (verse, verseEl, type) => {
          if (type === "empty-verse") return;
          const v = verse as Verse;

          const lineItems = v.lines.length === 0
              ? [{ id: `${v.id}-empty-line`, _isVirtual: "empty-line" as const }]
              : [
                  { id: `${v.lines[0].id}-empty-line-start`, _isVirtual: "empty-line" as const },
                  ...v.lines,
                  { id: `${v.lines[v.lines.length - 1].id}-empty-line-end`, _isVirtual: "empty-line" as const }
              ];

          // Sync lines inside verse
          syncChildren(verseEl, lineItems,
              (l) => (l as any)._isVirtual || "line",
              (l, lType) => lType === "line" ? renderLine(l as Line) : defaultEmptyLineRenderer(l),
              (line, lineEl, lType) => {
                  if (lType === "empty-line") return;
                  const l = line as Line;
                  // Sync tokens inside line
                  syncChildren(lineEl, l.tokens, () => "token", (t) => renderToken(t as Token), (token, tokenEl) => {
                     // Update token text if it changed (optimization)
                     const t = token as Token;
                     if (tokenEl.textContent !== t.text) {
                         tokenEl.textContent = t.text;
                     }
                  });
              });
  });

  // 3. Global cleanup: in case things moved wildly between parents,
  // we want to rely on the localized child sync. If an element moved between verses,
  // it was treated as "new" in the target, and we need to ensure the old one is gone.
  // The local `removeChild` handles the old parent correctly because that child isn't in
  // its new list anymore. Thus, a pure localized sync is sufficient for tree data.
}

/**
 * Syncs the SelectionState visually by applying/removing a class.
 */
export function patchSelection(container: HTMLElement, selection: SelectionState) {
    // Clear all existing selections
    const currentlySelected = container.querySelectorAll(".dd-selected");
    currentlySelected.forEach(el => el.classList.remove("dd-selected"));

    // Add selection class to requested items
    for (const item of selection.items) {
       const el = container.querySelector(`[data-id="${item.id}"]`);
       if (el) {
           el.classList.add("dd-selected");
       }
    }
}
