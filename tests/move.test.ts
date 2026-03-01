import { describe, it, expect } from 'vitest';
import { defaultParser, defaultSerializer } from '../src/core/parser';
import { moveSelection } from '../src/core/move';
import { DropTarget } from '../src/core/model';

describe('Move Semantics', () => {
  it('moves tokens to a different line', () => {
    const doc = defaultParser("Line one.\nLine two.");
    // "Line", "one", "."
    // "Line", "two", "."
    const t1 = doc.verses[0].lines[0].tokens[0]; // "Line"
    const t2 = doc.verses[0].lines[0].tokens[1]; // "one"

    // Drop target: before "two"
    const targetTokenId = doc.verses[0].lines[1].tokens[1].id;
    const target: DropTarget = { type: "token", id: targetTokenId, side: "before" };

    const { doc: newDoc } = moveSelection(doc, {
      items: [
        { type: "token", id: t1.id },
        { type: "token", id: t2.id }
      ]
    }, target);

    const resultStr = defaultSerializer(newDoc);
    // Line one -> empty except for "."
    // Line two -> "Line one two."
    expect(resultStr).toBe(".\nLine Line one two.");
  });

  it('moves an entire line', () => {
    const doc = defaultParser("L1.\nL2.\nL3.");
    const l1 = doc.verses[0].lines[0];
    const l3 = doc.verses[0].lines[2];

    const target: DropTarget = { type: "line", id: l3.id, side: "after" };

    const { doc: newDoc } = moveSelection(doc, {
      items: [{ type: "line", id: l1.id }]
    }, target);

    expect(defaultSerializer(newDoc)).toBe("L2.\nL3.\nL1.");
  });
});
