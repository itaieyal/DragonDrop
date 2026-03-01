import { Doc } from "./src/core/model.ts";
import { handleKeyboardNavigation } from "./src/core/keyboard.ts";

const doc: Doc = {
    id: "doc-1",
    verses: [
        {
            id: "v1",
            lines: [
                {
                     id: "l1",
                     tokens: [
                          { id: "t1", kind: "word", value: "שלום" },
                          { id: "t2", kind: "word", value: "אני" },
                          { id: "t3", kind: "word", value: "איתי" },
                     ]
                }
            ]
        }
    ]
};

const selection = {
    items: [{ type: "token", id: "t1" }],
    anchor: { type: "token", id: "t1" },
    focus: { type: "token", id: "t1" },
    mode: "token"
};

const res = handleKeyboardNavigation(doc, selection, "ArrowLeft", false, true, true);
console.log(JSON.stringify(res?.doc.verses[0].lines[0].tokens.map(t => t.value), null, 2));

const res2 = handleKeyboardNavigation(doc, selection, "ArrowRight", false, true, true);
console.log(JSON.stringify(res2?.doc.verses[0].lines[0].tokens.map(t => t.value), null, 2));
