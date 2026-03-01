import { describe, it, expect } from 'vitest';
import { normalizeText, defaultParser, defaultSerializer, validateDoc } from '../src/core/parser';

describe('Parser & Serializer', () => {
  const rawSpacedText = `  Hello ,   world!

How are you ?

I am fine .  `;

  const expectedNormalized = `Hello , world!

How are you ?

I am fine .`;

  it('normalizes text correctly', () => {
    expect(normalizeText(rawSpacedText)).toBe(expectedNormalized);
  });

  it('parses text into a valid Document structure', () => {
    const doc = defaultParser(expectedNormalized);

    // Check validation
    const { ok, errors } = validateDoc(doc);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);

    // Check hierarchy
    expect(doc.verses.length).toBe(3);

    // Verse 1
    const verse1 = doc.verses[0];
    expect(verse1.lines.length).toBe(1);
    expect(verse1.lines[0].tokens.length).toBe(4);
    expect(verse1.lines[0].tokens.map(t => t.text)).toEqual(["Hello", ",", "world", "!"]);
    expect(verse1.lines[0].tokens.map(t => t.kind)).toEqual(["word", "punct", "word", "punct"]);

    // Verse 2
    expect(doc.verses[1].lines[0].tokens.map(t => t.text)).toEqual(["How", "are", "you", "?"]);

    // Verse 3
    expect(doc.verses[2].lines[0].tokens.map(t => t.text)).toEqual(["I", "am", "fine", "."]);
  });

  it('serializes Doc back to string', () => {
    const doc = defaultParser(expectedNormalized);
    const serialized = defaultSerializer(doc);

    // Note: Option A injects space before words.
    // "Hello" + "," + " " + "world" + "!" -> "Hello, world!"
    // "How" + " " + "are" + " " + "you" + "?" -> "How are you?"
    expect(serialized).toBe("Hello, world!\n\nHow are you?\n\nI am fine.");
  });

  it('round-trips stably', () => {
     // If we start with cleanly spaced text, it should parse and reserialize perfectly.
     const initial = "A cleanly formatted poem.\nWith two lines.\n\nAnd a second verse.";
     const doc = defaultParser(initial);
     const result = defaultSerializer(doc);
     expect(result).toBe(initial);
  });
});
