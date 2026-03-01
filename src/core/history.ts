import { Doc, SelectionState } from "./model";

export interface HistoryRecord {
    doc: Doc;
    selection: SelectionState;
    label: string;
}

export class HistoryManager {
    private undoStack: HistoryRecord[] = [];
    private redoStack: HistoryRecord[] = [];
    private currentRecord: HistoryRecord;

    private onChangeCbs: (() => void)[] = [];

    constructor(initialDoc: Doc, initialSelection: SelectionState = { items: [] }, initialLabel: string = "Initial State") {
        this.currentRecord = {
            doc: JSON.parse(JSON.stringify(initialDoc)),
            selection: JSON.parse(JSON.stringify(initialSelection)),
            label: initialLabel
        };
    }

    public pushState(doc: Doc, selection: SelectionState, label: string) {
        this.undoStack.push(this.currentRecord);
        this.currentRecord = {
            doc: JSON.parse(JSON.stringify(doc)),
            selection: JSON.parse(JSON.stringify(selection)),
            label
        };
        // Clear redo stack on new action
        this.redoStack = [];
        this.notify();
    }

    public get getState() {
        return this.currentRecord;
    }

    public undo(): HistoryRecord | null {
        if (this.undoStack.length === 0) return null;

        this.redoStack.push(this.currentRecord);
        this.currentRecord = this.undoStack.pop()!;
        this.notify();

        return {
            doc: JSON.parse(JSON.stringify(this.currentRecord.doc)),
            selection: JSON.parse(JSON.stringify(this.currentRecord.selection)),
            label: this.currentRecord.label
        };
    }

    public redo(): HistoryRecord | null {
        if (this.redoStack.length === 0) return null;

        this.undoStack.push(this.currentRecord);
        this.currentRecord = this.redoStack.pop()!;
        this.notify();

        return {
            doc: JSON.parse(JSON.stringify(this.currentRecord.doc)),
            selection: JSON.parse(JSON.stringify(this.currentRecord.selection)),
            label: this.currentRecord.label
        };
    }

    public get canUndo() {
        return this.undoStack.length > 0;
    }

    public get canRedo() {
        return this.redoStack.length > 0;
    }

    public getUndoStack() {
        return [...this.undoStack];
    }

    public getRedoStack() {
        // Return reversed to show the most immediate redo at the top/bottom conceptually depending on UI
        return [...this.redoStack].reverse();
    }

    public onChange(cb: () => void) {
        this.onChangeCbs.push(cb);
        return () => {
            this.onChangeCbs = this.onChangeCbs.filter(c => c !== cb);
        };
    }

    private notify() {
        this.onChangeCbs.forEach(cb => cb());
    }
}
