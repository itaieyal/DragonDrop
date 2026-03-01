import "./style.css";
import { Editor } from "./editor";
import { HistoryManager } from "./core/history";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="layout">
    <div class="panel main-panel">
      <div class="panel-header">
        <h2>Structured Editor (Drag & Drop)</h2>
        <button id="btnToggleTextArea">Show Free Text Area</button>
      </div>
      <div id="editorContainer"></div>
    </div>

    <div class="panel right-panel" id="historyPanel">
      <h2>History</h2>
      <div id="historyList" class="history-list"></div>
    </div>

    <div class="panel bottom-panel" id="freeTextAreaPanel" style="display: none;">
      <h2>Free Text Area</h2>
      <textarea id="rawText" placeholder="Write verses separated by double newlines here..."></textarea>
      <div class="controls">
        <button id="btnParse">Parse → Editor</button>
        <button id="btnSerialize">← Serialize to Text</button>
        <button id="btnRTL">Toggle RTL</button>
      </div>

      <h2 style="display: none;">Live Document JSON</h2>
      <pre id="jsonView" style="display: none;"></pre>
    </div>
  </div>
  <footer class="shortcuts-footer">
    <div class="shortcuts-container">
        <span><strong>Navigate:</strong> Arrows</span>
        <span><strong>Select:</strong> Shift + Arrows</span>
        <span><strong>Move:</strong> Alt + Arrows</span>
        <span><strong>Undo:</strong> U</span>
        <span><strong>Redo:</strong> R</span>
        <span><strong>Insert Text:</strong> I</span>
        <span><strong>Insert Line:</strong> O / Shift+O</span>
        <span><strong>Delete:</strong> Backspace/Delete</span>
        <span><strong>Clear:</strong> Esc</span>
    </div>
  </footer>
`;

// Initialize UI
const rawText = document.getElementById("rawText") as HTMLTextAreaElement;
const btnParse = document.getElementById("btnParse") as HTMLButtonElement;
const btnSerialize = document.getElementById("btnSerialize") as HTMLButtonElement;
const btnRTL = document.getElementById("btnRTL") as HTMLButtonElement;
const jsonView = document.getElementById("jsonView") as HTMLPreElement;
const editorContainer = document.getElementById("editorContainer") as HTMLElement;
const btnToggleTextArea = document.getElementById("btnToggleTextArea") as HTMLButtonElement;
const freeTextAreaPanel = document.getElementById("freeTextAreaPanel") as HTMLElement;

// Starting text
const defaultPoem = `This is a test poem.
It has two lines.

And here is the second
verse of the poem.`;

const savedPoem = localStorage.getItem("dd-poem");
rawText.value = savedPoem !== null ? savedPoem : defaultPoem;

let isRTL = localStorage.getItem("dd-rtl") === "true";
if (isRTL) {
    document.querySelector('.layout')?.setAttribute("dir", "rtl");
}

// Setup Editor
const editor = new Editor(editorContainer, { rtl: isRTL });
editor.setText(rawText.value);

const historyManager = new HistoryManager(editor.getDoc(), editor.getSelection(), "Initial State");
let historyVersion = 1;

function renderHistory() {
    const listEl = document.getElementById("historyList")!;
    listEl.innerHTML = "";

    const undoStack = historyManager.getUndoStack();
    const redoStack = historyManager.getRedoStack();
    const current = historyManager.getState;

    // Render Redos
    redoStack.forEach((r) => {
        const div = document.createElement("div");
        div.className = "history-item future";
        div.textContent = `[Redo] ${r.label}`;
        listEl.appendChild(div);
    });

    // Render Current
    const currentDiv = document.createElement("div");
    currentDiv.className = "history-item current";
    currentDiv.textContent = `[Active] ${current.label}`;
    listEl.appendChild(currentDiv);

    // Render Undos (reverse so newest is on top of older)
    [...undoStack].reverse().forEach((r) => {
        const div = document.createElement("div");
        div.className = "history-item past";
        div.textContent = `[Undo] ${r.label}`;
        listEl.appendChild(div);
    });
}
historyManager.onChange(renderHistory);
renderHistory();

function updateJsonView() {
    jsonView.textContent = JSON.stringify(editor.getDoc(), null, 2);
}

updateJsonView();

// Wire buttons
btnParse.addEventListener("click", () => {
    editor.setText(rawText.value);
    updateJsonView();
    localStorage.setItem("dd-poem", rawText.value);
});

btnSerialize.addEventListener("click", () => {
    rawText.value = editor.getText();
});

btnRTL.addEventListener("click", () => {
    isRTL = !isRTL;
    document.querySelector('.layout')?.setAttribute("dir", isRTL ? "rtl" : "ltr");
    editor.setOptions({ rtl: isRTL });
    localStorage.setItem("dd-rtl", isRTL.toString());
});

let isTextAreaVisible = false;
btnToggleTextArea.addEventListener("click", () => {
    isTextAreaVisible = !isTextAreaVisible;
    if (isTextAreaVisible) {
        freeTextAreaPanel.style.display = "flex";
        btnToggleTextArea.textContent = "Hide Free Text Area";
    } else {
        freeTextAreaPanel.style.display = "none";
        btnToggleTextArea.textContent = "Show Free Text Area";
    }
});

rawText.addEventListener("input", () => {
    editor.setText(rawText.value);
    localStorage.setItem("dd-poem", rawText.value);
});

// React to structural changes from DnD
editor.on("change", (e) => {
    updateJsonView();
    if (e.source !== "api") {
        rawText.value = editor.getText();
    }
    localStorage.setItem("dd-poem", editor.getText());

    if (e.source !== "undo" && e.source !== "redo") {
        let label = `Action ${historyVersion++}`;
        if (e.source === "drag") label = `Drag & Drop`;
        else if (e.source === "keyboard") label = `Keyboard Update`;
        historyManager.pushState(e.doc, e.selection, label);
    }
});

editor.on("undoRequest", () => {
    if (historyManager.canUndo) {
        const record = historyManager.undo();
        if (record) {
            editor.setSelection(record.selection);
            editor.setDoc(record.doc, "undo");
        }
    }
});

editor.on("redoRequest", () => {
    if (historyManager.canRedo) {
        const record = historyManager.redo();
        if (record) {
            editor.setSelection(record.selection);
            editor.setDoc(record.doc, "redo");
        }
    }
});
