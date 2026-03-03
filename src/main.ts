import "./style.css";
import { Editor } from "./editor";
import { HistoryManager } from "./core/history";
import { SongManager } from "./core/songs";

const songManager = new SongManager();

const app = document.querySelector<HTMLDivElement>("#app")!;
const template = document.getElementById("app-template") as HTMLTemplateElement;
app.appendChild(template.content.cloneNode(true));

// Initialize UI
const rawText = document.getElementById("rawText") as HTMLTextAreaElement;
const btnParse = document.getElementById("btnParse") as HTMLButtonElement;
const btnSerialize = document.getElementById("btnSerialize") as HTMLButtonElement;
const btnRTL = document.getElementById("btnRTL") as HTMLButtonElement;
const jsonView = document.getElementById("jsonView") as HTMLPreElement;
const editorContainer = document.getElementById("editorContainer") as HTMLElement;
const btnToggleTextArea = document.getElementById("btnToggleTextArea") as HTMLButtonElement;
const freeTextAreaPanel = document.getElementById("freeTextAreaPanel") as HTMLElement;

// Song UI Elements
const songSelect = document.getElementById("songSelect") as HTMLSelectElement;
const btnNewSong = document.getElementById("btnNewSong") as HTMLButtonElement;
const btnDuplicateSong = document.getElementById("btnDuplicateSong") as HTMLButtonElement;
const btnDeleteSong = document.getElementById("btnDeleteSong") as HTMLButtonElement;
const songTitle = document.getElementById("songTitle") as HTMLInputElement;
const songStatus = document.getElementById("songStatus") as HTMLSelectElement;
const btnSaveSong = document.getElementById("btnSaveSong") as HTMLButtonElement;

// Render songs dropdown
function updateSongSelect() {
  const songs = songManager.getAllSongs();
  songSelect.innerHTML = "";
  songs.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.title} (${s.status})`;
    songSelect.appendChild(opt);
  });

  const current = songManager.getCurrentSong();
  if (current) {
    songSelect.value = current.id;
  }
}

// Ensure at least one song exists
async function initSession() {
  await songManager.initialize();

  if (!songManager.getCurrentSong()) {
    await songManager.createSong();
  }
  updateSongSelect();
  loadSongToUI();
}

initSession();

let isRTL = localStorage.getItem("dd-rtl") === "true";
if (isRTL) {
    document.querySelector('.layout')?.setAttribute("dir", "rtl");
}

function getFreewriteBank() {
    const freewriteSongs = songManager.getAllSongs().filter(s => s.status === "Freewrite");
    const words: string[] = [];
    const lines: string[] = [];
    const verses: string[] = [];

    for (const song of freewriteSongs) {
        // Very simple splitting; using the parser is more accurate but text splitting is fine for raw extraction.
        // We'll split verses by double newline.
        const songVerses = song.content.split(/\n\s*\n/).map(v => v.trim()).filter(v => v.length > 0);
        verses.push(...songVerses);

        for (const verse of songVerses) {
            const songLines = verse.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            lines.push(...songLines);

            for (const line of songLines) {
                // Split words by space or punctuation broadly
                const songWords = line.split(/[\s\.,!?;:"'()[\]{}<>]+/).map(w => w.trim()).filter(w => w.length > 0);
                words.push(...songWords);
            }
        }
    }

    return { words, lines, verses };
}

// Setup Editor
const editor = new Editor(editorContainer, { rtl: isRTL, getFreewriteBank });
const historyManager = new HistoryManager(editor.getDoc(), editor.getSelection(), "Initial State");
let historyVersion = 1;

// Load current song UI state
function loadSongToUI() {
  const current = songManager.getCurrentSong();
  if (!current) return;

  songTitle.value = current.title;
  songStatus.value = current.status;
  rawText.value = current.content;

  if (editor) {
    editor.setText(current.content);
    updateJsonView();
    historyManager.clear(editor.getDoc(), editor.getSelection(), "Loaded Song");
    historyVersion = 1;
  }
}

// loadSongToUI occurs in initSession()

// Wire up Song UI Actions
songSelect.addEventListener("change", async () => {
  await songManager.setCurrentSongId(songSelect.value);
  loadSongToUI();
  updateSongSelect();
});

btnNewSong.addEventListener("click", async () => {
  await songManager.createSong();
  loadSongToUI();
  updateSongSelect();
});

btnDuplicateSong.addEventListener("click", async () => {
  await songManager.duplicateCurrentSong();
  loadSongToUI();
  updateSongSelect();
});

btnSaveSong.addEventListener("click", async () => {
  const current = songManager.getCurrentSong();
  if (current) {
    current.title = songTitle.value || "Untitled Song";
    current.status = songStatus.value as any;
    current.content = editor.getText();
    await songManager.updateSong(current);
    updateSongSelect();
  }
});

btnDeleteSong.addEventListener("click", async () => {
    const current = songManager.getCurrentSong();
    if (current) {
        if (confirm(`Are you sure you want to delete "${current.title}"?`)) {
            await songManager.deleteSong(current.id);
            loadSongToUI();
            updateSongSelect();
        }
    }
});



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
btnParse.addEventListener("click", async () => {
    editor.setText(rawText.value);
    updateJsonView();
    const current = songManager.getCurrentSong();
    if (current) {
        current.content = rawText.value;
        await songManager.updateSong(current);
        updateSongSelect();
    }
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

rawText.addEventListener("input", async () => {
    editor.setText(rawText.value);
    const current = songManager.getCurrentSong();
    if (current) {
        current.content = rawText.value;
        await songManager.updateSong(current);
        updateSongSelect();
    }
});

// React to structural changes from DnD
editor.on("change", async (e) => {
    updateJsonView();
    if (e.source !== "api") {
        rawText.value = editor.getText();
    }

    // Auto-save changes to the current song text content
    const current = songManager.getCurrentSong();
    if (current) {
        current.content = editor.getText();
        await songManager.updateSong(current);
        updateSongSelect();
    }

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
