const doc = { verses: [{ id: 'v1', lines: [{ id: 'l1', tokens: [{ id: 't1', text: 'This' }, { id: 't2', text: 'is' }] }] }] };
const item = { type: 'token', id: 't1' };
const tokensToAdd = [{ id: 't99', text: 'magic' }];
const newDoc = JSON.parse(JSON.stringify(doc));
const insertStrategy = "after-token";

for (let vIdx = 0; vIdx < newDoc.verses.length; vIdx++) {
    const v = newDoc.verses[vIdx];
    if (item && item.type === "verse" && item.id === v.id) {
        break;
    }

    let found = false;
    for (let lIdx = 0; lIdx < v.lines.length; lIdx++) {
        const l = v.lines[lIdx];
        if (item && item.type === "line" && item.id === l.id) {
            found = true;
            break;
        } else if (item && item.type === "token") {
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
