import { PluginBase, registerPlugin } from '../../core/JsTree';
import type { StateOptions, JsTreeState } from '../../core/JsTree.types';

class StatePlugin extends PluginBase {

  private get _key(): string {
    return (this.opts as StateOptions).key ?? `jstree_${this.tree.id}`;
  }

  init(): void {
    this.tree.element.addEventListener('ready.jstree', () => this._restore());
    this.tree.element.addEventListener('changed.jstree',  () => this._save());
    this.tree.element.addEventListener('open_node.jstree', () => this._save());
    this.tree.element.addEventListener('close_node.jstree', () => this._save());
  }

  destroy(): void {
    this._save();
  }

  private _save(): void {
    const model = this.tree['_model'].data as Record<string, { state: { opened: boolean; selected: boolean }; id: string }>;
    const state: JsTreeState = {
      core: {
        open:     [],
        selected: [],
        scroll:   { x: this.tree.element.scrollLeft, y: this.tree.element.scrollTop },
      },
    };

    for (const [id, node] of Object.entries(model)) {
      if (id === '#') continue;
      if (node.state.opened)   state.core.open.push(id);
      if (node.state.selected) state.core.selected.push(id);
    }

    const opts = this.opts as StateOptions;
    const filtered = opts.filter ? opts.filter(state) : state;

    try {
      localStorage.setItem(this._key, JSON.stringify(filtered));
    } catch {
      // storage not available
    }
  }

  private _restore(): void {
    let state: JsTreeState | null = null;
    try {
      const raw = localStorage.getItem(this._key);
      if (raw) state = JSON.parse(raw) as JsTreeState;
    } catch {
      return;
    }
    if (!state) return;

    for (const id of state.core.open) {
      this.tree.open_node(id);
    }
    for (const id of state.core.selected) {
      this.tree.select_node(id, true);
    }
    if (state.core.scroll) {
      this.tree.element.scrollLeft = state.core.scroll.x;
      this.tree.element.scrollTop  = state.core.scroll.y;
    }

    this.tree.trigger('state_ready', { state });
  }
}

registerPlugin('state', StatePlugin);
export { StatePlugin };
