import { Doc, Id, Line, TokenKind, Verse } from "./model";

// A simple counter for deterministic IDs during parsing
let idCounter = 0;
const generateId = (prefix: string): Id => `${prefix}-${++idCounter}`;

/**
 * Normalizes input text according to our Option A strategy:
 * - Trims leading/trailing whitespace
 * - Replaces multiple spaces with a single space
 * - Replaces 3+ consecutive newlines with exactly 2 newlines (to separate verses)
 * - Trims spaces at the end of lines
 */
export function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/[ \t]+/g, ' ') // Collapse horizontal spaces
    .replace(/ \n/g, '\n')   // Remove trailing spaces on lines
    .replace(/\n{3,}/g, '\n\n'); // Max 2 newlines
}

/**
 * Parses normal text into a Doc structure.
 * - Verses are separated by blank lines (2 newlines).
 * - Lines are separated by a single newline.
 * - Tokens are split into words and punctuation (Option A: implicit spaces).
 */
export function defaultParser(text: string): Doc {
  const doc: Doc = { id: generateId("doc"), verses: [] };
  const normalized = normalizeText(text);

  if (!normalized) return doc;

  const verseBlocks = normalized.split('\n\n');

  for (const block of verseBlocks) {
    const verse: Verse = { id: generateId("verse"), lines: [] };
    const lineStrings = block.split('\n');

    for (const ls of lineStrings) {
      const line: Line = { id: generateId("line"), tokens: [] };

      // Tokenize: split by punctuation and spaces.
      // E.g. "Hello, world!" -> ["Hello", ",", " ", "world", "!"]
      const rawTokens = ls.split(/([\.,!?;:"'()[\]{}<>]+|\s+)/g);

      for (let tokenText of rawTokens) {
        tokenText = tokenText.trim();
        if (!tokenText) continue;

        let kind: TokenKind = "word";
        if (/^[\.,!?;:"'()[\]{}<>]+$/.test(tokenText)) {
          kind = "punct";
        }

        line.tokens.push({
          id: generateId("token"),
          text: tokenText,
          kind
        });
      }

      verse.lines.push(line);
    }

    doc.verses.push(verse);
  }

  return doc;
}

/**
 * Serializes a Doc back into a string.
 * Implicit spaces: words get a leading space (unless first on line), punctuation does not.
 */
export function defaultSerializer(doc: Doc): string {
  let result = "";

  for (let v = 0; v < doc.verses.length; v++) {
    const verse = doc.verses[v];

    for (let l = 0; l < verse.lines.length; l++) {
      const line = verse.lines[l];

      for (let t = 0; t < line.tokens.length; t++) {
        const token = line.tokens[t];

        // Option A spacing logic
        if (token.kind === "word" && t > 0) {
           // We might need a space before a word, IF the previous token was a word or punctuation that we want a space after.
           // Usually, word after word -> space. Word after punct (like quotes or commas) -> space.
           // For simplicity in Option A, if we are appending a word and we aren't at the start, add a space.
           result += " ";
        }

        result += token.text;
      }

      if (l < verse.lines.length - 1) {
        result += "\n";
      }
    }

    if (v < doc.verses.length - 1) {
      result += "\n\n";
    }
  }

  return result;
}

/**
 * Helper to validate structural invariants of the Document in dev mode.
 */
export function validateDoc(doc: Doc): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenIds = new Set<Id>();

  const checkId = (id: Id, context: string) => {
    if (!id) errors.push(`Missing id in ${context}`);
    else if (seenIds.has(id)) errors.push(`Duplicate id '${id}' found in ${context}`);
    else seenIds.add(id);
  };

  checkId(doc.id, "doc");

  if (!Array.isArray(doc.verses)) {
    errors.push("doc.verses must be an array");
    return { ok: errors.length === 0, errors };
  }

  for (const verse of doc.verses) {
    checkId(verse.id, "verse");
    if (!Array.isArray(verse.lines)) {
      errors.push(`verse.lines must be an array in verse ${verse.id}`);
      continue;
    }

    for (const line of verse.lines) {
      checkId(line.id, "line");
      if (!Array.isArray(line.tokens)) {
        errors.push(`line.tokens must be an array in line ${line.id}`);
        continue;
      }

      for (const token of line.tokens) {
        checkId(token.id, "token");
        if (typeof token.text !== 'string') errors.push(`Invalid token text in ${token.id}`);
        if (token.kind !== 'word' && token.kind !== 'punct') {
          errors.push(`Invalid token kind '${token.kind}' in ${token.id}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
