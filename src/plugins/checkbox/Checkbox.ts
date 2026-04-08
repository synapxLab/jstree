import { PluginBase, registerPlugin } from '../../core/JsTree';
import type { CheckboxOptions, JsTreeNode } from '../../core/JsTree.types';

class CheckboxPlugin extends PluginBase {

  private get _opts(): CheckboxOptions {
    const defaults: CheckboxOptions = {
      visible:          true,
      three_state:      true,
      whole_node:       true,
      keep_selected_style: false,
      cascade:          'up+down',
      tie_selection:    true,
    };
    return { ...defaults, ...(this.opts as CheckboxOptions) };
  }

  init(): void {
    this.tree.element.addEventListener('ready.jstree', () => this._decorateAll());
    this.tree.element.addEventListener('redraw.jstree', () => this._decorateAll());

    // Intercept select/deselect to cascade
    this.tree.element.addEventListener('select_node.jstree', (e) => {
      const node = (e as CustomEvent<{ node: JsTreeNode }>).detail.node;
      this._onSelect(node);
    });
    this.tree.element.addEventListener('deselect_node.jstree', (e) => {
      const node = (e as CustomEvent<{ node: JsTreeNode }>).detail.node;
      this._onDeselect(node);
    });
  }

  // called from JsTree._pluginHook('redraw_node')
  redraw_node(li: HTMLLIElement, node: JsTreeNode): void {
    if (!this._opts.visible) return;
    if (li.querySelector(':scope > .jstree-anchor > .jstree-checkbox')) return;

    const anchor = li.querySelector<HTMLElement>(':scope > .jstree-anchor');
    if (!anchor) return;

    const cb = document.createElement('i');
    cb.classList.add('jstree-icon', 'jstree-checkbox');
    cb.setAttribute('role', 'presentation');
    anchor.insertBefore(cb, anchor.children[1] ?? null); // after themeicon

    this._updateCheckbox(li, node);
  }

  private _updateCheckbox(li: HTMLLIElement, node: JsTreeNode): void {
    const cb = li.querySelector<HTMLElement>(':scope > .jstree-anchor > .jstree-checkbox');
    if (!cb) return;

    cb.classList.remove('jstree-checkbox-checked', 'jstree-checkbox-undetermined');

    if (node.state.checked) {
      cb.classList.add('jstree-checkbox-checked');
      cb.setAttribute('aria-checked', 'true');
    } else if (this._opts.three_state && this._hasCheckedChild(node)) {
      cb.classList.add('jstree-checkbox-undetermined');
      cb.setAttribute('aria-checked', 'mixed');
    } else {
      cb.setAttribute('aria-checked', 'false');
    }
  }

  private _hasCheckedChild(node: JsTreeNode): boolean {
    const model = this.tree['_model'].data as Record<string, JsTreeNode>;
    return node.children_d.some((id) => model[id]?.state.checked);
  }

  private _onSelect(node: JsTreeNode): void {
    if (this._opts.tie_selection) {
      node.state.checked = true;
    }
    const cascade = this._opts.cascade ?? '';
    const model = this.tree['_model'].data as Record<string, JsTreeNode>;

    if (cascade.includes('down')) {
      for (const id of node.children_d) {
        const c = model[id];
        if (c && !c.state.disabled) c.state.checked = true;
      }
    }
    if (cascade.includes('up')) {
      this._updateAncestors(node.parent, model);
    }
    this._decorateAll();
  }

  private _onDeselect(node: JsTreeNode): void {
    if (this._opts.tie_selection) {
      node.state.checked = false;
    }
    const cascade = this._opts.cascade ?? '';
    const model = this.tree['_model'].data as Record<string, JsTreeNode>;

    if (cascade.includes('down')) {
      for (const id of node.children_d) {
        const c = model[id];
        if (c && !c.state.disabled) c.state.checked = false;
      }
    }
    if (cascade.includes('up')) {
      this._updateAncestors(node.parent, model);
    }
    this._decorateAll();
  }

  private _updateAncestors(parentId: string, model: Record<string, JsTreeNode>): void {
    let pid = parentId;
    while (pid && pid !== '#') {
      const p = model[pid];
      if (!p) break;
      const allChecked = p.children.every((id) => model[id]?.state.checked);
      p.state.checked = allChecked;
      pid = p.parent;
    }
  }

  private _decorateAll(): void {
    const model = this.tree['_model'].data as Record<string, JsTreeNode>;
    for (const [id, node] of Object.entries(model)) {
      if (id === '#') continue;
      const li = this.tree.element.querySelector<HTMLLIElement>(`#${CSS.escape(id)}`);
      if (li) this.redraw_node(li, node);
    }
  }

  get_checked(full = false): string[] | JsTreeNode[] {
    const model = this.tree['_model'].data as Record<string, JsTreeNode>;
    const result: JsTreeNode[] = [];
    for (const [id, node] of Object.entries(model)) {
      if (id !== '#' && node.state.checked) result.push(node);
    }
    return full ? result : result.map((n) => n.id);
  }

  check_node(obj: string | HTMLElement): void {
    const node = this.tree.get_node(obj);
    if (node) this.tree.select_node(node.id, true);
  }

  uncheck_node(obj: string | HTMLElement): void {
    const node = this.tree.get_node(obj);
    if (node) this.tree.deselect_node(node.id);
  }

  uncheck_all(): void {
    this.tree.deselect_all();
  }
}

registerPlugin('checkbox', CheckboxPlugin);
export { CheckboxPlugin };
