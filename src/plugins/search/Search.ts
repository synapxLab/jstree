import { PluginBase, registerPlugin } from '../../core/JsTree';
import type { SearchOptions, JsTreeNode } from '../../core/JsTree.types';

class SearchPlugin extends PluginBase {

  private _lastQuery = '';
  private _matches:  string[] = [];

  init(): void {
    this.tree.element.addEventListener('ready.jstree',   () => {
      if (this._lastQuery) this.search(this._lastQuery);
    });
  }

  destroy(): void {
    this._clearMarks();
  }

  search(query: string): void {
    this._clearMarks();
    this._lastQuery = query;
    this._matches   = [];

    if (!query) {
      this._showAll();
      this.tree.trigger('search', { nodes: [] });
      return;
    }

    const opts = this.opts as SearchOptions;
    const caseSensitive = opts.case_sensitive ?? false;
    const fuzzy         = opts.fuzzy          ?? false;
    const leavesOnly    = opts.search_leaves_only ?? false;

    const q = caseSensitive ? query : query.toLowerCase();

    for (const [id, node] of Object.entries(this.tree['_model'].data)) {
      if (id === '#') continue;
      if (leavesOnly && !this.tree.is_leaf(id)) continue;

      const text = caseSensitive ? node!.text : node!.text.toLowerCase();
      const match = fuzzy ? this._fuzzyMatch(text, q) : text.includes(q);

      if (match) {
        this._matches.push(id);
      }
    }

    this._applyMarks();
    this.tree.trigger('search', { nodes: this._matches, query });
  }

  clearSearch(): void {
    this._clearMarks();
    this._lastQuery = '';
    this._matches   = [];
    this._showAll();
    this.tree.trigger('clear_search');
  }

  private _fuzzyMatch(text: string, query: string): boolean {
    let qi = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) qi++;
    }
    return qi === query.length;
  }

  private _applyMarks(): void {
    const opts = this.opts as SearchOptions;
    const showOnly = opts.show_only_matches ?? false;
    const showOnlyChildren = opts.show_only_matches_children ?? false;

    // Collect all ancestors to keep visible
    const visible = new Set<string>(this._matches);
    for (const id of this._matches) {
      const node = this.tree['_model'].data[id] as JsTreeNode | undefined;
      if (!node) continue;
      for (const pid of node.parents) {
        visible.add(pid);
      }
    }

    for (const [id, node] of Object.entries(this.tree['_model'].data as Record<string, JsTreeNode>)) {
      if (id === '#') continue;
      const li = this.tree.element.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (!li) continue;

      const isMatch = this._matches.includes(id);
      const anchor  = li.querySelector<HTMLElement>(':scope > .jstree-anchor');

      if (isMatch && anchor) {
        anchor.classList.add('jstree-search');
      }

      if (showOnly && !visible.has(id)) {
        li.classList.add('jstree-hidden');
      }

      if (isMatch || visible.has(id)) {
        this.tree.open_node(id);
      }
    }
  }

  private _clearMarks(): void {
    for (const el of this.tree.element.querySelectorAll('.jstree-search')) {
      el.classList.remove('jstree-search');
    }
    for (const el of this.tree.element.querySelectorAll('.jstree-hidden')) {
      el.classList.remove('jstree-hidden');
    }
  }

  private _showAll(): void {
    const opts = this.opts as SearchOptions;
    if (opts.close_opened_onclear ?? true) {
      this.tree.close_all();
    }
    for (const el of this.tree.element.querySelectorAll('li.jstree-hidden')) {
      (el as HTMLElement).classList.remove('jstree-hidden');
    }
  }
}

registerPlugin('search', SearchPlugin);
export { SearchPlugin };
