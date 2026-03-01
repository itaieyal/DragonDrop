export type Id = string;
export type TokenKind = "word" | "punct";

export type Token = {
  id: Id;
  text: string;
  kind: TokenKind;
};

export type Line = {
  id: Id;
  tokens: Token[];
};

export type Verse = {
  id: Id;
  lines: Line[];
  meta?: Record<string, any>;
};

export type Doc = {
  id: Id;
  verses: Verse[];
  meta?: Record<string, any>;
};

export type SelectionItem =
  | { type: "token"; id: Id }
  | { type: "line"; id: Id }
  | { type: "verse"; id: Id }
  | { type: "empty-line"; id: Id }
  | { type: "empty-verse"; id: Id };

export type SelectionState = {
  items: SelectionItem[];
  anchor?: SelectionItem;
  focus?: SelectionItem;
  mode?: "token" | "line" | "verse" | "empty-line" | "empty-verse";
};

export type DropTarget =
  | { type: "token"; id: Id; side: "before" | "after" }
  | { type: "line"; id: Id; side: "before" | "after" }
  | { type: "line-end"; id: Id }
  | { type: "verse"; id: Id; side: "before" | "after" }
  | { type: "verse-end"; id: Id }
  | { type: "empty-line"; id: Id }
  | { type: "empty-verse"; id: Id };
