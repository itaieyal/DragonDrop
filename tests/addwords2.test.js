import { JSDOM } from 'jsdom';
import { Editor } from './src/editor.ts';

const dom = new JSDOM(`<!DOCTYPE html><div></div>`);
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;
global.MouseEvent = dom.window.MouseEvent;

const div = document.querySelector("div");
const ed = new Editor(div);
ed.setText("hello");

try {
    const item = ed.getDoc().verses[0].lines[0].tokens[0];
    ed.setSelection({ items: [{ type: "token", id: item.id }] });
    ed.promptAddWords(ed.selection.items[0]);

    const input = document.querySelector("input");
    input.value = "magic dragon";
    const evt = new dom.window.KeyboardEvent("keydown", { key: "Enter" });
    input.dispatchEvent(evt);

    console.log(JSON.stringify(ed.getDoc(), null, 2));
} catch(e) {
    console.error(e);
}

setTimeout(() => process.exit(0), 100);