import { Doc, SelectionState, DropTarget, SelectionItem, Token, Line, Verse } from "./core/model";
import { defaultParser, defaultSerializer } from "./core/parser";
import { patchDOM, patchSelection, Renderers } from "./dom/render";
import { canonicalizeSelection, toggleSelect, rangeSelect } from "./core/selection";
import { moveSelection } from "./core/move";
import { handleKeyboardNavigation } from "./core/keyboard";
import { getDropTargetFromPoint, createGhost, updateGhostPos, hideGhost, showDropIndicator, hideDropIndicator } from "./dom/drag";
import { measureFLIP, playFLIP } from "./dom/flip";
import { ContextMenu } from "./ui/contextMenu";

export type EditorOptions = {
    parser?: (text: string) => Doc;
    serializer?: (doc: Doc) => string;
    renderers?: Renderers;
    selectableLevels?: { token?: boolean; line?: boolean; verse?: boolean };
    multiSelect?: boolean;
    rangeSelect?: boolean;
    shiftTokenAcrossLines?: boolean;
    animation?: { enabled: boolean; durationMs: number };
    autoScroll?: { enabled: boolean; edgePx: number; speed: number };
    rtl?: boolean;
    getFreewriteBank?: () => { words: string[], lines: string[], verses: string[] };
};

const defaultOptions = {
    selectableLevels: { token: true, line: true, verse: true },
    multiSelect: true,
    rangeSelect: true,
    shiftTokenAcrossLines: false,
    animation: { enabled: true, durationMs: 180 },
    autoScroll: { enabled: true, edgePx: 40, speed: 10 },
    rtl: false
};

type EventMap = {
    change: { doc: Doc; selection: SelectionState; source: "api" | "drag" | "undo" | "redo" | "keyboard" };
    select: { selection: SelectionState };
    dragstart: { items: SelectionItem[] };
    drop: { items: SelectionItem[]; target: DropTarget };
    error: { error: Error };
    undoRequest: void;
    redoRequest: void;
};

export class Editor {
    container: HTMLElement;
    private options: Required<EditorOptions>;
    private doc: Doc = { id: "doc-0", verses: [] };
    public selection: SelectionState = { items: [] };

    // ... Event Emitter state
    private listeners: Record<string, Function[]> = {};

    // Drag State
    private isDragging = false;
    private dragTarget: DropTarget | null = null;

    // Modes
    public isKeyboardMode = true;

    // Suggestion Mode State
    public activeSuggestion: {
         targetId: string;
         alternatives: string[];
         currentIndex: number;
    } | null = null;

    private contextMenu: ContextMenu;

    // Auto-scroll
    private scrollInterval: number | null = null;

    constructor(container: HTMLElement, options?: Partial<EditorOptions>) {
        this.container = container;
        this.options = { ...defaultOptions, ...options } as Required<EditorOptions>;

        container.classList.add("dd-editor");
        if (this.options.rtl) {
            container.setAttribute("dir", "rtl");
        }

        this.contextMenu = new ContextMenu(this, [
            {
                label: "Shuffle Words",
                condition: (_sel) => _sel.items.length === 1 && _sel.items[0].type === "line",
                action: () => this.shuffleSelection()
            },
            {
                label: "Shuffle Lines",
                condition: (_sel) => _sel.items.length === 1 && _sel.items[0].type === "verse",
                action: () => this.shuffleSelection()
            },
            {
                label: "Add Random Word",
                condition: (_sel) => _sel.items.length === 1 && (_sel.items[0].type === "token" || _sel.items[0].type === "line"),
                action: () => this.addRandomSuggestion("word", this.selection.items[0])
            },
            {
                label: "Add Random Line",
                condition: (_sel) => _sel.items.length === 1 && _sel.items[0].type === "empty-line",
                action: () => this.addRandomSuggestion("line", this.selection.items[0])
            },
            {
                label: "Add Random Verse",
                condition: (_sel) => _sel.items.length === 1 && _sel.items[0].type === "empty-verse",
                action: () => this.addRandomSuggestion("verse", this.selection.items[0])
            },
            {
                label: "Prompt Add Random Word",
                condition: (_sel) => false, // Only triggered programmatically via contextMenu.openAt
                action: () => this.addRandomSuggestion("word", this.selection.items[0])
            },
            {
                label: "Prompt Add Random Line",
                condition: (_sel) => false, // Only triggered programmatically via contextMenu.openAt
                action: () => this.addRandomSuggestion("line", this.selection.items[0])
            },
            {
                label: "Prompt Add Random Verse",
                condition: (_sel) => false, // Only triggered programmatically via contextMenu.openAt
                action: () => this.addRandomSuggestion("verse", this.selection.items[0])
            },
            {
                label: "Add Words After",
                condition: (_sel) => _sel.items.length === 1 && _sel.items[0].type === "token",
                action: () => this.promptAddWords(this.selection.items[0])
            },
            {
                label: "Add Words",
                condition: (_sel) => _sel.items.length !== 1 || _sel.items[0].type !== "token",
                action: (x, y) => {
                    const selItem = this.selection.items.length === 1 ? this.selection.items[0] : undefined;
                    this.promptAddWords(selItem, x, y);
                }
            },
            {
                label: "Remove",
                condition: (_sel) => _sel.items.length > 0,
                action: () => this.removeSelection()
            }
        ]);

        this.bindEvents();
    }

    setOptions(opts: Partial<EditorOptions>) {
        this.options = { ...this.options, ...opts };
        if (opts.rtl !== undefined) {
            if (opts.rtl) {
                this.container.setAttribute("dir", "rtl");
            } else {
                this.container.removeAttribute("dir");
            }
        }
        patchDOM(this.container, this.doc, this.options.renderers);
    }

    clearSelection() {
        if (this.selection.items.length > 0) {
            this.selection = { items: [] };
            patchSelection(this.container, this.selection);
            this.emit("select", { selection: this.selection });
        }
    }

    setDoc(doc: Doc, source: "api" | "undo" | "redo" | "keyboard" = "api") {
        this.doc = doc;

        // Clear suggestion if source is fundamentally altering structure or not from a keyboard modification to cycle suggestion
        if (source !== "keyboard") {
             this.activeSuggestion = null;
        } else if (this.activeSuggestion) {
             // Let's only clear the active suggestion if the selected item is not the suggested item anymore
             if (!this.selection.items.some(i => i.id === this.activeSuggestion?.targetId)) {
                 this.activeSuggestion = null;
             }
        }

        // Measure before patch if anim enabled
        const snap = this.options.animation?.enabled ? measureFLIP(this.container) : null;

        patchDOM(this.container, this.doc, this.options.renderers, this.activeSuggestion?.targetId);
        patchSelection(this.container, this.selection);

        if (snap) playFLIP(this.container, snap, this.options.animation?.durationMs || 0);

        this.emit("change", { doc, selection: this.selection, source });
    }

    getDoc() { return this.doc; }

    setText(text: string) {
        const parse = this.options.parser || defaultParser;
        this.setDoc(parse(text), "api");
    }

    getText() {
        const serialize = this.options.serializer || defaultSerializer;
        return serialize(this.doc);
    }

    setSelection(sel: SelectionState) {
        this.selection = canonicalizeSelection(this.doc, sel);
        patchSelection(this.container, this.selection);
        this.emit("select", { selection: this.selection });
    }

    getSelection() { return this.selection; }

    on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event]!.push(handler as any);
        return () => {
            this.listeners[event] = this.listeners[event]!.filter(h => h !== handler) as any;
        };
    }

    private emit<K extends keyof EventMap>(event: K, payload?: EventMap[K]) {
        if (this.listeners[event]) {
            this.listeners[event]!.forEach(h => h(payload));
        }
    }

    destroy() {
        if (this.scrollInterval) window.clearInterval(this.scrollInterval);
        this.container.innerHTML = "";
    }

    private bindEvents() {
        this.container.addEventListener("pointerdown", this.onPointerDown.bind(this));
        document.addEventListener("pointermove", this.onPointerMove.bind(this));
        this.container.addEventListener("pointerup", this.onPointerUp.bind(this));
        // Prevent default native dragging
        this.container.addEventListener("dragstart", (e) => e.preventDefault());

        // Ensure keyboard shortcuts like Backspace and Delete work natively
        this.container.addEventListener("keydown", (e) => {
            if (e.target instanceof HTMLInputElement) {
                 return; // Do not intercept typing shortcuts while inside inline addWords inputs!
            }

            if (e.key === "Escape") {
                if (this.activeSuggestion) {
                    this.activeSuggestion = null;
                    this.setDoc(this.doc, "keyboard"); // This clears the highlight
                } else {
                    this.setSelection({ items: [] });
                }
            } else if (e.key.toLowerCase() === "i" || e.key === "ן") {
                const item = this.selection.items[0];
                e.preventDefault();
                if (item) {
                     if (item.type === "token") this.promptAddWords(item, undefined, undefined, "after-token");
                     if (item.type === "line" || item.type === "empty-line") this.promptAddWords(item, undefined, undefined, "start-line");
                     if (item.type === "verse" || item.type === "empty-verse") this.promptAddWords(item, undefined, undefined, "start-verse");
                } else {
                     this.promptAddWords(undefined, undefined, undefined, "end-doc");
                }
            } else if (e.key.toLowerCase() === "o" || e.key === "ם") {
                const item = this.selection.items[0];
                e.preventDefault();
                if (item && (item.type === "token" || item.type === "line" || item.type === "empty-line" || item.type === "empty-verse" || item.type === "verse")) {
                     this.promptAddWords(item, undefined, undefined, ((e.key === "o" || e.key === "ם") && !e.shiftKey) ? "after-line" : "before-line");
                } else if (!item) {
                     this.promptAddWords(undefined, undefined, undefined, "end-doc");
                }
            } else if (e.key.toLowerCase() === "u" || e.key === "ו") {
                e.preventDefault();
                this.emit("undoRequest");
            } else if (e.key.toLowerCase() === "r" || e.key === "ר") {
                e.preventDefault();
                this.emit("redoRequest");
            } else if (e.key.toLowerCase() === "s" || e.key === "ד") {
                const item = this.selection.items[0];
                if (item) {
                     e.preventDefault();
                     if (item.type === "token") this.addRandomSuggestion("word", item);
                     else if (item.type === "line") this.addRandomSuggestion("word", item); // or line depending on preference, but usually "Add Random Word" is mapped to line in context menu
                     else if (item.type === "empty-line") this.addRandomSuggestion("line", item);
                     else if (item.type === "empty-verse") this.addRandomSuggestion("verse", item);
                }
            } else if (e.key === ";" || e.key === "ף") {
                e.preventDefault();
                this.cycleSuggestion(1);
            } else if (e.key === "'" || e.key === ",") {
                e.preventDefault();
                this.cycleSuggestion(-1);
            } else if (e.key === "Enter" && this.activeSuggestion && this.isKeyboardMode) {
                // Commit suggestion
                e.preventDefault();
                this.activeSuggestion = null;
                this.setDoc(this.doc, "keyboard");
            } else if (e.key === "Backspace" || e.key === "Delete") {
                this.removeSelection();
            } else if (e.key.startsWith("Arrow")) {
                const res = handleKeyboardNavigation(this.doc, this.selection, e.key, e.shiftKey, e.altKey, !!this.options.rtl);
                if (res) {
                    e.preventDefault();
                    if (res.doc) {
                        this.setSelection(res.selection || this.selection);
                        this.setDoc(res.doc, "keyboard");
                    } else if (res.selection) {
                        this.setSelection(res.selection);
                    }
                }
            }
        });
        // Make focusable to capture key events easily
        if (!this.container.hasAttribute("tabindex")) {
             this.container.setAttribute("tabindex", "0");
        }
    }

    // --- Structural Actions ---

    public removeSelection() {
        if (this.selection.items.length === 0) return;

        const cloneDoc: Doc = JSON.parse(JSON.stringify(this.doc));
        const toDeleteIds = new Set(this.selection.items.map(i => i.id));
        const dragType = this.selection.items[0].type;

        // Find the element immediately before the first element to be deleted
        let focusBeforeDelete: SelectionItem | null = null;
        if (this.isKeyboardMode && this.selection.items.length > 0) {
            // Flatten the doc to easily find neighbors
            const list: SelectionItem[] = [];
            for (const v of this.doc.verses) {
                list.push({ type: "verse", id: v.id });
                for (const l of v.lines) {
                    list.push({ type: "line", id: l.id });
                    for (const t of l.tokens) {
                        list.push({ type: "token", id: t.id });
                    }
                }
            }

            const firstDeletedItem = this.selection.items[0];
            const firstDeletedStr = `${firstDeletedItem.type}:${firstDeletedItem.id}`;
            let firstDeletedIdx = list.findIndex(i => `${i.type}:${i.id}` === firstDeletedStr);

            if (firstDeletedIdx !== -1) {
                 // Scan backwards for the first item of the same type that isn't being deleted
                 for (let i = firstDeletedIdx - 1; i >= 0; i--) {
                      if (!toDeleteIds.has(list[i].id) && list[i].type === dragType) {
                          focusBeforeDelete = list[i];
                          break;
                      }
                 }
                 // If we couldn't find an earlier item of the same type, try the next item of the same type
                 if (!focusBeforeDelete) {
                     for (let i = firstDeletedIdx + 1; i < list.length; i++) {
                          if (!toDeleteIds.has(list[i].id) && list[i].type === dragType) {
                              focusBeforeDelete = list[i];
                              break;
                          }
                     }
                 }
            }
        }

        for (let v = cloneDoc.verses.length - 1; v >= 0; v--) {
            const verse = cloneDoc.verses[v];
            if (dragType === "verse" && toDeleteIds.has(verse.id)) {
                cloneDoc.verses.splice(v, 1);
                continue;
            }
            for (let l = verse.lines.length - 1; l >= 0; l--) {
                 const line = verse.lines[l];
                 if (dragType === "line" && toDeleteIds.has(line.id)) {
                     verse.lines.splice(l, 1);
                     continue;
                 }
                 if (dragType === "token") {
                     for (let t = line.tokens.length - 1; t >= 0; t--) {
                         const token = line.tokens[t];
                         if (toDeleteIds.has(token.id)) {
                              line.tokens.splice(t, 1);
                         }
                     }
                 }
            }
        }

        // cleanup empty structures
        cloneDoc.verses = cloneDoc.verses.filter(v => v.lines.length > 0);
        for (const v of cloneDoc.verses) {
            v.lines = v.lines.filter(l => l.tokens.length > 0);
        }

        let newSelection: SelectionState = { items: [] };
        if (this.isKeyboardMode && focusBeforeDelete) {
             // Verify that the focus element actually survived the cleanup
             let survived = false;
             if (focusBeforeDelete.type === "verse") {
                 survived = cloneDoc.verses.some(v => v.id === focusBeforeDelete!.id);
             } else if (focusBeforeDelete.type === "line") {
                 survived = cloneDoc.verses.some(v => v.lines.some(l => l.id === focusBeforeDelete!.id));
             } else if (focusBeforeDelete.type === "token") {
                 survived = cloneDoc.verses.some(v => v.lines.some(l => l.tokens.some(t => t.id === focusBeforeDelete!.id)));
             }
             if (survived) {
                 newSelection = {
                     items: [focusBeforeDelete],
                     anchor: focusBeforeDelete,
                     focus: focusBeforeDelete,
                     mode: focusBeforeDelete.type
                 };
             }
        }

        this.setSelection(newSelection);
        this.setDoc(cloneDoc, "keyboard");
    }

    public shuffleSelection() {
        if (this.selection.items.length !== 1) return;

        const cloneDoc: Doc = JSON.parse(JSON.stringify(this.doc));
        const item = this.selection.items[0];

        // Only shuffle lines and verses
        for (const verse of cloneDoc.verses) {
            if (item.type === "verse" && verse.id === item.id) {
                 verse.lines.sort(() => Math.random() - 0.5);
                 break;
            }
            if (item.type === "line") {
                 const targetLine = verse.lines.find(l => l.id === item.id);
                 if (targetLine) {
                      targetLine.tokens.sort(() => Math.random() - 0.5);
                      break;
                 }
            }
        }

        this.setDoc(cloneDoc, "keyboard");
    }

    public promptAddWords(
        item?: SelectionItem,
        clickX?: number,
        clickY?: number,
        strategyOverride?: "after-token" | "start-line" | "end-line" | "start-verse" | "end-verse" | "end-doc" | "before-line" | "after-line"
    ) {
        let domEl: HTMLElement | null = null;
        if (item) {
            domEl = this.container.querySelector(`[data-id="${item.id}"]`) as HTMLElement;
        } else {
            domEl = this.container; // Fallback to appending to the end
        }

        if (!domEl) return;

        const rootInput = document.createElement("input");
        rootInput.type = "text";
        rootInput.placeholder = "type words..";
        rootInput.className = "dd-inline-input";

        // Setup insertion info
        let insertStrategy: "after-token" | "start-line" | "end-line" | "start-verse" | "end-verse" | "end-doc" | "before-line" | "after-line" = strategyOverride || "end-doc";

        if (strategyOverride) {
             if (strategyOverride === "before-line" || strategyOverride === "after-line") {
                 let lineEl = domEl.closest('.dd-line');
                 if (!lineEl) lineEl = domEl.closest('.dd-empty-line');

                 if (lineEl) {
                     if (strategyOverride === "before-line") lineEl.before(rootInput);
                     else lineEl.after(rootInput);
                 } else {
                     if (strategyOverride === "before-line") domEl.before(rootInput);
                     else domEl.after(rootInput);
                 }
             }
             else if (strategyOverride === "start-line" || strategyOverride === "start-verse") domEl.prepend(rootInput);
             else if (strategyOverride === "end-line" || strategyOverride === "end-verse" || strategyOverride === "end-doc") domEl.appendChild(rootInput);
             else if (strategyOverride === "after-token") domEl.after(rootInput);
        } else if (!item || domEl === this.container) {
             domEl.appendChild(rootInput);
             insertStrategy = "end-doc";
        } else if (item.type === "token") {
             domEl.after(rootInput);
             insertStrategy = "after-token";
        } else if (item.type === "empty-line") {
             domEl.prepend(rootInput);
             insertStrategy = "start-line";
        } else if (item.type === "empty-verse") {
             domEl.prepend(rootInput);
             insertStrategy = "start-verse";
        } else if (item.type === "line" && clickX !== undefined) {
             const rect = domEl.getBoundingClientRect();
             const isRTL = !!this.options.rtl;
             const midX = rect.left + rect.width / 2;
             const isBefore = isRTL ? (clickX > midX) : (clickX < midX);
             if (isBefore) {
                  domEl.prepend(rootInput);
                  insertStrategy = "start-line";
             } else {
                  domEl.appendChild(rootInput);
                  insertStrategy = "end-line";
             }
        } else if (item.type === "verse" && clickY !== undefined) {
             const rect = domEl.getBoundingClientRect();
             const midY = rect.top + rect.height / 2;
             if (clickY < midY) {
                  domEl.prepend(rootInput);
                  insertStrategy = "start-verse";
             } else {
                  domEl.appendChild(rootInput);
                  insertStrategy = "end-verse";
             }
        } else {
             // Fallback if item is present but specific click coordinates are not, or type is unexpected
             domEl.appendChild(rootInput);
             insertStrategy = "end-doc";
        }

        rootInput.focus();

        let handled = false;
        const commit = () => {
             if (handled) return;
             handled = true;

             const val = rootInput.value.trim();
             rootInput.style.display = "none"; // Hide immediately to fulfill user request without breaking DOM flow

             if (val.length > 0) {
                 try {
                     const newDoc: Doc = JSON.parse(JSON.stringify(this.doc));
                     const parsed = defaultParser(val);

                     const createNewId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                     let lastTokenId: string | undefined;

                     if (insertStrategy === "end-doc") {
                          const verses = parsed.verses.map(v => ({...v, id: createNewId('v'), lines: v.lines.map(l => ({...l, id: createNewId('l'), tokens: l.tokens.map(t => ({...t, id: createNewId('t')}))}))}));
                          newDoc.verses.push(...verses);
                          if (verses.length > 0) {
                              const lastV = verses[verses.length - 1];
                              if (lastV.lines.length > 0) {
                                  const lastL = lastV.lines[lastV.lines.length - 1];
                                  if (lastL.tokens.length > 0) {
                                      lastTokenId = lastL.tokens[lastL.tokens.length - 1].id;
                                  }
                              }
                          }
                     } else {
                          const newTokens = parsed.verses.flatMap((v: Verse) => v.lines.flatMap((l: Line) => l.tokens));
                          const tokensToAdd = newTokens.map((t: Token) => ({ ...t, id: createNewId('t') }));
                          const newLines = parsed.verses.flatMap((v: Verse) => v.lines).map(l => ({...l, id: createNewId('l'), tokens: l.tokens.map(t => ({...t, id: createNewId('t')}))}));

                          const setLastTokenFromNewLines = () => {
                              if (newLines.length > 0) {
                                  const lastL = newLines[newLines.length - 1];
                                  if (lastL.tokens.length > 0) {
                                      lastTokenId = lastL.tokens[lastL.tokens.length - 1].id;
                                  }
                              }
                          };

                          const setLastTokenFromTokensToAdd = () => {
                              if (tokensToAdd.length > 0) {
                                  lastTokenId = tokensToAdd[tokensToAdd.length - 1].id;
                              }
                          };

                          const newVerses = parsed.verses.map(v => ({...v, id: createNewId('v'), lines: v.lines.map(l => ({...l, id: createNewId('l'), tokens: l.tokens.map(t => ({...t, id: createNewId('t')}))}))}));

                          const setLastTokenFromNewVerses = () => {
                              if (newVerses.length > 0) {
                                  const lastV = newVerses[newVerses.length - 1];
                                  if (lastV.lines.length > 0) {
                                      const lastL = lastV.lines[lastV.lines.length - 1];
                                      if (lastL.tokens.length > 0) {
                                          lastTokenId = lastL.tokens[lastL.tokens.length - 1].id;
                                      }
                                  }
                              }
                          };

                          let handledAtTopLevel = false;

                          for (let vIdx = 0; vIdx < newDoc.verses.length; vIdx++) {
                              const v = newDoc.verses[vIdx];
                              if (item && item.type === "empty-verse" && item.id.startsWith(v.id)) {
                                  if (item.id.endsWith("-start")) {
                                      newDoc.verses.splice(vIdx, 0, ...newVerses);
                                  } else {
                                      newDoc.verses.splice(vIdx + 1, 0, ...newVerses);
                                  }
                                  setLastTokenFromNewVerses();
                                  handledAtTopLevel = true;
                                  break;
                              }

                              if (item && item.type === "verse" && item.id === v.id) {
                                  if (insertStrategy === "start-verse" || insertStrategy === "before-line") {
                                      v.lines.unshift(...newLines);
                                      setLastTokenFromNewLines();
                                      handledAtTopLevel = true;
                                      break;
                                  } else if (insertStrategy === "end-verse" || insertStrategy === "after-line") {
                                      v.lines.push(...newLines);
                                      setLastTokenFromNewLines();
                                      handledAtTopLevel = true;
                                      break;
                                  }
                              }

                              let found = false;
                              for (let lIdx = 0; lIdx < v.lines.length; lIdx++) {
                                  const l = v.lines[lIdx];
                                  if (item && item.type === "empty-line" && item.id.startsWith(l.id)) {
                                      if (insertStrategy === "start-line" || item.id.endsWith("-start")) {
                                          l.tokens.unshift(...tokensToAdd);
                                          setLastTokenFromTokensToAdd();
                                      } else if (insertStrategy === "end-line" || item.id.endsWith("-end")) {
                                          l.tokens.push(...tokensToAdd);
                                          setLastTokenFromTokensToAdd();
                                      } else if (insertStrategy === "before-line") {
                                          v.lines.splice(lIdx, 0, ...newLines);
                                          setLastTokenFromNewLines();
                                      } else if (insertStrategy === "after-line") {
                                          v.lines.splice(lIdx + 1, 0, ...newLines);
                                          setLastTokenFromNewLines();
                                      }
                                      found = true;
                                      break;
                                  } else if (item && item.type === "line" && item.id === l.id) {
                                      if (insertStrategy === "start-line") {
                                          l.tokens.unshift(...tokensToAdd);
                                          setLastTokenFromTokensToAdd();
                                      } else if (insertStrategy === "end-line") {
                                          l.tokens.push(...tokensToAdd);
                                          setLastTokenFromTokensToAdd();
                                      } else if (insertStrategy === "before-line") {
                                          v.lines.splice(lIdx, 0, ...newLines);
                                          setLastTokenFromNewLines();
                                      } else if (insertStrategy === "after-line") {
                                          v.lines.splice(lIdx + 1, 0, ...newLines);
                                          setLastTokenFromNewLines();
                                      }
                                      found = true;
                                      break;
                                  } else if (item && item.type === "token") {
                                      const tIdx = l.tokens.findIndex((t: Token) => t.id === item.id);
                                      if (tIdx !== -1) {
                                          if (insertStrategy === "before-line") {
                                               v.lines.splice(lIdx, 0, ...newLines);
                                               setLastTokenFromNewLines();
                                          } else if (insertStrategy === "after-line") {
                                               v.lines.splice(lIdx + 1, 0, ...newLines);
                                               setLastTokenFromNewLines();
                                          } else {
                                               l.tokens.splice(tIdx + 1, 0, ...tokensToAdd);
                                               setLastTokenFromTokensToAdd();
                                          }
                                          found = true;
                                          break;
                                      }
                                  }
                              }
                              if (!found && v.lines.length === 0 && item && item.type === "empty-line" && item.id.startsWith(v.id)) {
                                  v.lines.push(...newLines);
                                  setLastTokenFromNewLines();
                                  found = true;
                              }
                              if (found) {
                                  handledAtTopLevel = true;
                                  break;
                              }
                          }

                          if (!handledAtTopLevel && newDoc.verses.length === 0 && item && item.type === "empty-verse") {
                              newDoc.verses.push(...newVerses);
                              setLastTokenFromNewVerses();
                          }
                     }

                     this.setDoc(newDoc, "keyboard");

                     if (this.isKeyboardMode && lastTokenId) {
                         const targetNode: SelectionItem = { type: "token", id: lastTokenId };
                         this.setSelection({
                             items: [targetNode],
                             anchor: targetNode,
                             focus: targetNode,
                             mode: "token"
                         });
                     }
                 } catch (err) {
                     console.error(err);
                 }
             }

             if (rootInput.parentNode) rootInput.remove();

             // Ensure the editor container regains focus so keyboard navigation works immediately
             if (this.isKeyboardMode) {
                  this.container.focus();
             }
        };

        rootInput.addEventListener("keydown", (e) => {
             if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  commit();
             } else if (e.key === "Escape") {
                  handled = true;
                  rootInput.remove();
                  if (this.isKeyboardMode) this.container.focus();
             }
        });

        rootInput.addEventListener("blur", () => {
             commit(); // Commit whatever was typed when clicking away
        });
    }

    public addRandomSuggestion(type: "word" | "line" | "verse", contextItem: SelectionItem) {
        if (!this.options.getFreewriteBank) return;
        const bank = this.options.getFreewriteBank();
        let alternatives: string[] = [];

        if (type === "word" && bank.words.length > 0) {
            alternatives = bank.words;
        } else if (type === "line" && bank.lines.length > 0) {
            alternatives = bank.lines;
        } else if (type === "verse" && bank.verses.length > 0) {
            alternatives = bank.verses;
        }

        if (alternatives.length === 0) return;

        // Shuffle the alternatives so cycling isn't always the exact same order
        alternatives = [...alternatives].sort(() => Math.random() - 0.5);

        const textToInsert = alternatives[0];

        try {
            const newDoc: Doc = JSON.parse(JSON.stringify(this.doc));
            const parsed = defaultParser(textToInsert);
            const createNewId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            let insertedId: string | null = null;
            let handled = false;

            if (type === "word") {
                const newTokens = parsed.verses.flatMap((v: Verse) => v.lines.flatMap((l: Line) => l.tokens));
                if (newTokens.length === 0) return;
                const tokenToAdd = { ...newTokens[0], id: createNewId('t') };

                if (newDoc.verses.length === 0) {
                    newDoc.verses.push({ id: createNewId('v'), lines: [{ id: createNewId('l'), tokens: [tokenToAdd] }] });
                    insertedId = tokenToAdd.id;
                    handled = true;
                } else {
                    for (let vIdx = 0; vIdx < newDoc.verses.length; vIdx++) {
                        const v = newDoc.verses[vIdx];

                        if (contextItem.type === "empty-verse" && contextItem.id.startsWith(v.id)) {
                            const newLine = { id: createNewId('l'), tokens: [tokenToAdd] };
                            if (contextItem.id.endsWith("-start")) v.lines.unshift(newLine);
                            else v.lines.push(newLine);
                            insertedId = tokenToAdd.id;
                            handled = true;
                            break;
                        }

                        if (contextItem.type === "empty-line") {
                             if (contextItem.id.startsWith(v.id)) {
                                 const newLine = { id: createNewId('l'), tokens: [tokenToAdd] };
                                 if (contextItem.id.endsWith("-start")) v.lines.unshift(newLine);
                                 else v.lines.push(newLine);
                                 insertedId = tokenToAdd.id;
                                 handled = true;
                                 break;
                             } else {
                                 const lIdx = v.lines.findIndex(l => contextItem.id.startsWith(l.id));
                                 if (lIdx !== -1) {
                                     const newLine = { id: createNewId('l'), tokens: [tokenToAdd] };
                                     if (contextItem.id.endsWith("-start")) v.lines.splice(lIdx, 0, newLine);
                                     else v.lines.splice(lIdx + 1, 0, newLine);
                                     insertedId = tokenToAdd.id;
                                     handled = true;
                                     break;
                                 }
                             }
                        }

                        if (contextItem.type === "verse" && contextItem.id === v.id) {
                            v.lines.push({ id: createNewId('l'), tokens: [tokenToAdd] });
                            insertedId = tokenToAdd.id;
                            handled = true;
                            break;
                        }

                        for (let lIdx = 0; lIdx < v.lines.length; lIdx++) {
                            const l = v.lines[lIdx];
                            const tIdx = l.tokens.findIndex(t => t.id === contextItem.id);
                            if (tIdx !== -1) {
                                l.tokens.splice(tIdx + 1, 0, tokenToAdd);
                                insertedId = tokenToAdd.id;
                                handled = true;
                                break;
                            } else if (contextItem.type === "line" && l.id === contextItem.id) {
                                // "Add Random Word" from Line Context Menu
                                l.tokens.push(tokenToAdd);
                                insertedId = tokenToAdd.id;
                                handled = true;
                                break;
                            }
                        }
                        if (handled) break;
                    }
                }
            } else if (type === "line") {
                const newLines = parsed.verses.flatMap((v: Verse) => v.lines).map(l => ({...l, id: createNewId('l'), tokens: l.tokens.map(t => ({...t, id: createNewId('t')}))}));
                if (newLines.length === 0) return;
                const lineToAdd = newLines[0];

                if (newDoc.verses.length === 0) {
                     newDoc.verses.push({ id: createNewId('v'), lines: [lineToAdd] });
                     insertedId = lineToAdd.id;
                     handled = true;
                } else {
                    for (let vIdx = 0; vIdx < newDoc.verses.length; vIdx++) {
                        const v = newDoc.verses[vIdx];

                        if (contextItem.type === "empty-verse" && contextItem.id.startsWith(v.id)) {
                             if (contextItem.id.endsWith("-start")) {
                                  v.lines.unshift(lineToAdd);
                             } else {
                                  v.lines.push(lineToAdd);
                             }
                             insertedId = lineToAdd.id;
                             handled = true;
                             break;
                        }

                        if (contextItem.type === "empty-line") {
                             if (contextItem.id.startsWith(v.id)) {
                                 if (contextItem.id.endsWith("-start")) v.lines.unshift(lineToAdd);
                                 else v.lines.push(lineToAdd);
                                 insertedId = lineToAdd.id;
                                 handled = true;
                                 break;
                             } else {
                                 const lIdx = v.lines.findIndex(l => contextItem.id.startsWith(l.id));
                                 if (lIdx !== -1) {
                                     if (contextItem.id.endsWith("-start")) v.lines.splice(lIdx, 0, lineToAdd);
                                     else v.lines.splice(lIdx + 1, 0, lineToAdd);
                                     insertedId = lineToAdd.id;
                                     handled = true;
                                     break;
                                 }
                             }
                        }

                        if (contextItem.type === "verse" && contextItem.id === v.id) {
                            v.lines.push(lineToAdd);
                            insertedId = lineToAdd.id;
                            handled = true;
                            break;
                        }

                        const lIdx = v.lines.findIndex(l =>
                            (contextItem.type === "line" && l.id === contextItem.id) ||
                            (contextItem.type === "token" && l.tokens.some(t => t.id === contextItem.id))
                        );

                        if (lIdx !== -1) {
                            v.lines.splice(lIdx + 1, 0, lineToAdd);
                            insertedId = lineToAdd.id;
                            handled = true;
                            break;
                        }
                    }
                }
            } else if (type === "verse") {
                const newVerses = parsed.verses.map(v => ({...v, id: createNewId('v'), lines: v.lines.map(l => ({...l, id: createNewId('l'), tokens: l.tokens.map(t => ({...t, id: createNewId('t')}))}))}));
                if (newVerses.length === 0) return;
                const verseToAdd = newVerses[0];

                if (newDoc.verses.length === 0) {
                    newDoc.verses.push(verseToAdd);
                    insertedId = verseToAdd.id;
                    handled = true;
                } else {
                    for (let vIdx = 0; vIdx < newDoc.verses.length; vIdx++) {
                         const v = newDoc.verses[vIdx];
                         if (contextItem.type === "empty-verse" && contextItem.id.startsWith(v.id)) {
                             if (contextItem.id.endsWith("-start")) {
                                 newDoc.verses.splice(vIdx, 0, verseToAdd);
                             } else {
                                 newDoc.verses.splice(vIdx + 1, 0, verseToAdd);
                             }
                             insertedId = verseToAdd.id;
                             handled = true;
                             break;
                         } else if (
                             (contextItem.type === "verse" && contextItem.id === v.id) ||
                             (contextItem.type === "line" && v.lines.some(l => l.id === contextItem.id)) ||
                             (contextItem.type === "token" && v.lines.some(l => l.tokens.some(t => t.id === contextItem.id))) ||
                             (contextItem.type === "empty-line" && (contextItem.id.startsWith(v.id) || v.lines.some(l => contextItem.id.startsWith(l.id))))
                         ) {
                             newDoc.verses.splice(vIdx + 1, 0, verseToAdd);
                             insertedId = verseToAdd.id;
                             handled = true;
                             break;
                         }
                    }
                }
            }

            if (handled && insertedId) {
                this.activeSuggestion = {
                    targetId: insertedId,
                    alternatives,
                    currentIndex: 0
                };

                const targetNode: SelectionItem = { type: type === "word" ? "token" : type, id: insertedId };
                this.setSelection({
                    items: [targetNode],
                    anchor: targetNode,
                    focus: targetNode,
                    mode: targetNode.type
                });

                this.setDoc(newDoc, "keyboard");

                if (this.isKeyboardMode) {
                    this.container.focus();
                }
            }
        } catch (e) {
             console.error("Error adding random suggestion", e);
        }
    }

    public cycleSuggestion(direction: 1 | -1) {
        if (!this.activeSuggestion || this.selection.items.length !== 1) return;
        const currentItem = this.selection.items[0];

        if (currentItem.id !== this.activeSuggestion.targetId) {
            // Suggestion state is effectively dead because the user moved away.
            this.activeSuggestion = null;
            // Let the patchDOM naturally remove the highlight class when activeSuggestion is null context.
            this.setDoc(this.doc, "keyboard");
            return;
        }

        const { alternatives, currentIndex, targetId } = this.activeSuggestion;
        let nextIndex = currentIndex + direction;
        if (nextIndex >= alternatives.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = alternatives.length - 1;

        const textToInsert = alternatives[nextIndex];
        const newDoc: Doc = JSON.parse(JSON.stringify(this.doc));
        const parsed = defaultParser(textToInsert);
        const createNewId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        let handled = false;
        let newActiveId = targetId;

        if (currentItem.type === "token") {
            const newTokens = parsed.verses.flatMap((v: Verse) => v.lines.flatMap((l: Line) => l.tokens));
            if (newTokens.length > 0) {
                 const tokenToAdd = { ...newTokens[0], id: targetId }; // Keep the same ID to save selection
                 for (let vIdx = 0; vIdx < newDoc.verses.length; vIdx++) {
                     const v = newDoc.verses[vIdx];
                     for (let lIdx = 0; lIdx < v.lines.length; lIdx++) {
                         const l = v.lines[lIdx];
                         const tIdx = l.tokens.findIndex(t => t.id === targetId);
                         if (tIdx !== -1) {
                             l.tokens[tIdx] = tokenToAdd;
                             newActiveId = tokenToAdd.id;
                             handled = true;
                             break;
                         }
                     }
                     if (handled) break;
                 }
            }
        } else if (currentItem.type === "line") {
            const newLines = parsed.verses.flatMap((v: Verse) => v.lines).map(l => ({...l, id: targetId, tokens: l.tokens.map(t => ({...t, id: createNewId('t')}))})); // keep same line id
            if (newLines.length > 0) {
                 const lineToAdd = newLines[0];
                 for (let vIdx = 0; vIdx < newDoc.verses.length; vIdx++) {
                     const v = newDoc.verses[vIdx];
                     const lIdx = v.lines.findIndex((l: Line) => l.id === targetId);
                     if (lIdx !== -1) {
                         v.lines[lIdx] = lineToAdd;
                         newActiveId = lineToAdd.id;
                         handled = true;
                         break;
                     }
                 }
            }
        } else if (currentItem.type === "verse") {
             const newVerses = parsed.verses.map(v => ({...v, id: targetId, lines: v.lines.map(l => ({...l, id: createNewId('l'), tokens: l.tokens.map(t => ({...t, id: createNewId('t')}))}))})); // keep same verse id
            if (newVerses.length > 0) {
                 const verseToAdd = newVerses[0];
                 const vIdx = newDoc.verses.findIndex(v => v.id === targetId);
                 if (vIdx !== -1) {
                     newDoc.verses[vIdx] = verseToAdd;
                     newActiveId = verseToAdd.id;
                     handled = true;
                 }
            }
        }

        if (handled) {
            this.activeSuggestion.currentIndex = nextIndex;
            this.activeSuggestion.targetId = newActiveId;

            const targetNode: SelectionItem = { type: currentItem.type, id: newActiveId };
            this.setSelection({
                items: [targetNode],
                anchor: targetNode,
                focus: targetNode,
                mode: targetNode.type
            });

            this.setDoc(newDoc, "keyboard");

            // Refocus for keyboard users so they can immediately cycle again
            if (this.isKeyboardMode) {
                this.container.focus();
            }
        }
    }

    // --- Input Handlers ---

    private onPointerDown(e: PointerEvent) {
        if (e.button !== 0) return; // Main button only

        const targetEl = (e.target as HTMLElement).closest("[data-id]");
        if (!targetEl) return;

        const id = targetEl.getAttribute("data-id")!;
        const type = targetEl.getAttribute("data-type")! as "verse" | "line" | "token" | "empty-line" | "empty-verse";

        // Require handles for container drags
        const isHandle = !!(e.target as HTMLElement).closest('.dd-drag-handle');
        if (type !== "token" && type !== "empty-line" && type !== "empty-verse" && !isHandle && !this.isKeyboardMode) {
             this.clearSelection();
             return;
        }

        const isVirtual = type === "empty-line" || type === "empty-verse";
        if (!isVirtual && !this.options.selectableLevels[type as "line" | "verse" | "token"]) return;

        const item: SelectionItem = { type, id };

        // Handle Selection
        if (e.shiftKey && this.options.multiSelect && this.options.rangeSelect) {
            e.preventDefault(); // Stop text selection
            this.setSelection(rangeSelect(this.doc, this.selection, item, this.options.shiftTokenAcrossLines));
        } else {
            // Additive if Cmd/Ctrl, or if we click an already selected item (we don't deselect yet so we can drag it)
            const isClickingSelected = this.selection.items.some(i => i.id === id);
            const additive = this.options.multiSelect && (e.metaKey || e.ctrlKey);

            if (!isClickingSelected || additive) {
                this.setSelection(toggleSelect(this.selection, item, additive));
            }
        }

        // Arm Dragging
        this.isDragging = true;
        this.container.setPointerCapture(e.pointerId);
    }

    private onPointerMove(e: PointerEvent) {
        if (!this.isDragging) return;
        if (this.selection.items.length === 0) return;

        e.preventDefault();

        // Drag Preview
        if (this.selection.items.length > 0 && !document.querySelector('.dd-ghost')) {
            const els = this.selection.items.map(i => this.container.querySelector(`[data-id="${i.id}"]`) as HTMLElement).filter(Boolean);
            if (els.length > 0) {
                 createGhost(els, e.clientX, e.clientY);
                 // Dim the originals being dragged so they look "picked up"
                 els.forEach(el => el.classList.add('dd-dragging-original'));
            }
        } else {
             updateGhostPos(e.clientX, e.clientY);
        }

        this.emit("dragstart", { items: this.selection.items });

        // Hit Testing
        const dragType = this.selection.items[0]?.type;
        const mappedDragType = (dragType === "empty-line" || dragType === "empty-verse") ? undefined : dragType;
        this.dragTarget = getDropTargetFromPoint(e.clientX, e.clientY, mappedDragType, !!this.options.rtl);
        if (this.dragTarget) {
            showDropIndicator(this.dragTarget, !!this.options.rtl);
        } else {
            hideDropIndicator();
        }

        // Auto Scroll
        this.handleAutoScroll(e.clientY);
    }

    private onPointerUp(e: PointerEvent) {
        if (!this.isDragging) return;

        this.isDragging = false;
        if (this.scrollInterval) window.clearInterval(this.scrollInterval);

        hideGhost();
        hideDropIndicator();

        // Restore original opacities
        this.container.querySelectorAll('.dd-dragging-original').forEach(el => {
             el.classList.remove('dd-dragging-original');
        });

        if (this.dragTarget) {
            this.emit("drop", { items: this.selection.items, target: this.dragTarget });

            // Execute Move
            const { doc: newDoc } = moveSelection(this.doc, this.selection, this.dragTarget);

            if (newDoc !== this.doc) {
                const snap = this.options.animation.enabled ? measureFLIP(this.container) : null;
                this.doc = newDoc;
                patchDOM(this.container, this.doc, this.options.renderers);
                if (snap) playFLIP(this.container, snap, this.options.animation.durationMs);

                this.emit("change", { doc: this.doc, selection: this.selection, source: "drag" });
            }
        } else {
            // Click cleanly on an already selected item without dragging -> set exact selection (drop others)
            const targetEl = (e.target as HTMLElement).closest("[data-id]");
            if (targetEl && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                const id = targetEl.getAttribute("data-id")!;
                const type = targetEl.getAttribute("data-type")! as "verse" | "line" | "token" | "empty-line" | "empty-verse";
                // If it was already selected and we didn't drag it, it means they want to isolate it
                if (this.selection.items.length > 1 && this.selection.items.some(i => i.id === id)) {
                    this.setSelection({ items: [{ type, id }], anchor: { type, id }, focus: { type, id } });
                }
            }
        }

        this.dragTarget = null;
    }

    private handleAutoScroll(y: number) {
        if (!this.options.autoScroll.enabled) return;
        if (this.scrollInterval) {
            window.clearInterval(this.scrollInterval);
            this.scrollInterval = null;
        }

        const { edgePx, speed } = this.options.autoScroll;
        const viewportHeight = window.innerHeight;

        let scrollDy = 0;
        if (y < edgePx) {
            // Scroll Up
            scrollDy = -speed;
        } else if (y > viewportHeight - edgePx) {
            // Scroll Down
            scrollDy = speed;
        }

        if (scrollDy !== 0) {
            this.scrollInterval = window.setInterval(() => {
                window.scrollBy(0, scrollDy);
            }, 16);
        }
    }
}
