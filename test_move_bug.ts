import { Doc } from "./src/core/model";
import { handleKeyboardNavigation } from "./src/core/keyboard";

const doc: Doc = {
    id: "doc-1",
    verses: [
        {
            id: "v1",
            lines: [
                { id: "l1", tokens: [{ id: "A", kind: "word", value: "A" }, { id: "B", kind: "word", value: "B" }] },
                { id: "l2", tokens: [{ id: "C", kind: "word", value: "C" }, { id: "D", kind: "word", value: "D" }] }
            ]
        }
    ]
};

const selection = {
    items: [{ type: "token", id: "B" }],
    anchor: { type: "token", id: "B" },
    focus: { type: "token", id: "B" },
    mode: "token"
};

const res = handleKeyboardNavigation(doc, selection as any, "ArrowRight", false, true, false);

// Should be pushing B into l2 before C.
console.log(JSON.stringify(res?.doc.verses[0].lines.map(l => l.tokens.map(t => t.value)), null, 2));

const resEnd = handleKeyboardNavigation(res?.doc as Doc, selection as any, "ArrowRight", false, true, false);
console.log(JSON.stringify(resEnd?.doc.verses[0].lines.map(l => l.tokens.map(t => t.value)), null, 2));
