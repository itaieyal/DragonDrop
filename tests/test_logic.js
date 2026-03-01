const parser = require('./src/core/parser.js'); // Wait, ts file. let's just write pure JS.
const doc = { verses: [{ id: 'v1', lines: [{ id: 'l1', tokens: [{ id: 't1', text: 'This' }, { id: 't2', text: 'is' }] }] }] };
const item = { type: 'token', id: 't1' };

const val = "magic dragon";
const newDoc = JSON.parse(JSON.stringify(doc));

const newTokens = [{text: "magic", kind: "word"}, {text: "dragon", kind: "word"}];
const tokensToAdd = newTokens.map((t) => ({ ...t, id: 't-'+Math.random() }));

for (let vIdx = 0; vIdx < newDoc.verses.length; vIdx++) {
    const v = newDoc.verses[vIdx];
    let found = false;
    for (let lIdx = 0; lIdx < v.lines.length; lIdx++) {
        const l = v.lines[lIdx];
        if (item && item.type === "token") {
            const tIdx = l.tokens.findIndex((t) => t.id === item.id);
            if (tIdx !== -1) {
                l.tokens.splice(tIdx + 1, 0, ...tokensToAdd);
                found = true;
                break;
            }
        }
    }
    if (found) break;
}
console.log(JSON.stringify(newDoc, null, 2));
