import { SelectionState } from "../core/model";
import { Editor } from "../editor";

export type ContextMenuItem = {
    label: string;
    action: (x: number, y: number) => void;
    // Condition allows dynamic showing of options
    condition?: (selection: SelectionState) => boolean;
};

export class ContextMenu {
    private el: HTMLElement;
    private editor: Editor;
    private activeItems: ContextMenuItem[] = [];

    constructor(editor: Editor, items: ContextMenuItem[]) {
        this.editor = editor;
        this.activeItems = items;

        this.el = document.createElement("div");
        this.el.className = "dd-context-menu";
        document.body.appendChild(this.el);

        // Bind events
        this.editor.container.addEventListener("contextmenu", this.onContextMenu.bind(this));
        document.addEventListener("click", this.close.bind(this));
        document.addEventListener("keydown", (e) => {
             if (e.key === "Escape") this.close();
        });
    }

    private onContextMenu(e: MouseEvent) {
        e.preventDefault();

        // If clicking on an unselected item, select it first!
        const target = (e.target as HTMLElement).closest('[data-id]') as HTMLElement;
        if (target) {
             const id = target.getAttribute("data-id")!;
             const type = target.getAttribute("data-type")! as any;

             const isSelected = this.editor['selection'].items.some(i => i.id === id);
             if (!isSelected) {
                 // Clear and select just this one item
                 this.editor.clearSelection();
                 this.editor.setSelection({ items: [{ type, id }] });
             }
        }

        const currentSelection = this.editor['selection'];

        // Filter actions
        const visibleActions = this.activeItems.filter(item => {
             return !item.condition || item.condition(currentSelection);
        });

        if (visibleActions.length === 0) {
             this.close();
             return;
        }

        // Render Menu
        this.el.innerHTML = "";

        const clickX = e.clientX;
        const clickY = e.clientY;

        for (const action of visibleActions) {
             const btn = document.createElement("button");
             btn.className = "dd-context-menu-item";
             btn.textContent = action.label;
             btn.onclick = (e) => {
                 e.stopPropagation();
                 this.close();
                 action.action(clickX, clickY);
             };
             this.el.appendChild(btn);
        }

        // Position it
        this.el.style.display = "block";

        let x = e.clientX;
        let y = e.clientY;

        // Boundaries
        const rect = this.el.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x -= rect.width;
        if (y + rect.height > window.innerHeight) y -= rect.height;

        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
    }

    private close() {
        this.el.style.display = "none";
    }
}
