import { describe, it, expect } from 'vitest';
import { defaultParser } from '../src/core/parser';
import { canonicalizeSelection, toggleSelect, rangeSelect } from '../src/core/selection';

describe('Selection Canonicalization', () => {
  const doc = defaultParser("Word punct space.\nLine two tokens.\n\nVerse two start.\nAnd end.");

  it('removes tokens if their parent line is selected', () => {
    const verse1 = doc.verses[0];
    const line1 = verse1.lines[0];
    const token1 = line1.tokens[0];

    const sel = canonicalizeSelection(doc, {
      items: [
        { type: "token", id: token1.id },
        { type: "line", id: line1.id }
      ]
    });

    expect(sel.items).toHaveLength(1);
    expect(sel.items[0]).toEqual({ type: "line", id: line1.id });
  });

  it('removes tokens and lines if their parent verse is selected', () => {
    const verse1 = doc.verses[0];
    const line1 = verse1.lines[0];
    const token1 = line1.tokens[0];

    const sel = canonicalizeSelection(doc, {
      items: [
        { type: "token", id: token1.id },
        { type: "line", id: line1.id },
        { type: "verse", id: verse1.id }
      ]
    });

    expect(sel.items).toHaveLength(1);
    expect(sel.items[0]).toEqual({ type: "verse", id: verse1.id });
  });

  it('keeps distinct tokens across lines', () => {
    const verse1 = doc.verses[0];
    const t1 = verse1.lines[0].tokens[0];
    const t2 = verse1.lines[1].tokens[0];

    const sel = canonicalizeSelection(doc, {
      items: [
        { type: "token", id: t1.id },
        { type: "token", id: t2.id }
      ]
    });

    expect(sel.items).toHaveLength(2);
  });
});

describe('Selection Toggles', () => {
  it('toggles a single item additively', () => {
    const s1 = toggleSelect({ items: [] }, { type: "token", id: "t1" }, true);
    expect(s1.items).toHaveLength(1);

    const s2 = toggleSelect(s1, { type: "token", id: "t1" }, true);
    expect(s2.items).toHaveLength(0); // toggled off
  });

  it('replaces selection if not additive', () => {
    const s1 = toggleSelect({ items: [{ type: "token", id: "t2" }] }, { type: "token", id: "t1" }, false);
    expect(s1.items).toHaveLength(1);
    expect(s1.items[0].id).toBe("t1");
  });
});

describe('Selection Ranges', () => {
  const doc = defaultParser("One two three.\nFour five six.\n\nSeven eight nine.");

  it('selects lines if cross-line tokens are shift-clicked', () => {
    const t1 = doc.verses[0].lines[0].tokens[0];
    const tLast = doc.verses[0].lines[1].tokens[1];

    const sel = rangeSelect(doc, {
      items: [{ type: "token", id: t1.id }],
      anchor: { type: "token", id: t1.id }
    }, { type: "token", id: tLast.id }, false);

    // Default mode: cross line tokens -> select both lines
    expect(sel.items.every(i => i.type === "line")).toBe(true);
    expect(sel.items).toHaveLength(2); // The two lines in verse 0
  });
});
