import { PluginBase, registerPlugin } from '../../core/JsTree';
import type { TypesOptions, TypeDefinition, JsTreeNode } from '../../core/JsTree.types';

class TypesPlugin extends PluginBase {

  private get _types(): TypesOptions {
    return (this.opts as TypesOptions) ?? {};
  }

  init(): void {
    // Decorate nodes on redraw
    this.tree.element.addEventListener('redraw.jstree', () => this._applyAll());
    this.tree.element.addEventListener('ready.jstree',  () => this._applyAll());
  }

  // Called from JsTree._pluginHook('redraw_node')
  redraw_node(li: HTMLLIElement, node: JsTreeNode): void {
    const def = this._getTypeDef(node.type);
    if (!def) return;

    if (def.icon !== undefined) {
      const icon = li.querySelector<HTMLElement>(':scope > .jstree-anchor > .jstree-themeicon');
      if (icon) {
        if (def.icon === false) {
          icon.classList.add('jstree-themeicon-hidden');
        } else {
          icon.className = `jstree-icon jstree-themeicon ${def.icon}`;
        }
      }
    }

    if (def.li_attr) {
      for (const [k, v] of Object.entries(def.li_attr)) li.setAttribute(k, v);
    }
    if (def.a_attr) {
      const a = li.querySelector<HTMLElement>(':scope > .jstree-anchor');
      if (a) {
        for (const [k, v] of Object.entries(def.a_attr)) a.setAttribute(k, v);
      }
    }
  }

  private _getTypeDef(type: string): TypeDefinition | undefined {
    return this._types[type] ?? this._types['default'];
  }

  private _applyAll(): void {
    for (const [id, node] of Object.entries(this.tree['_model'].data as Record<string, JsTreeNode>)) {
      if (id === '#') continue;
      const li = this.tree.element.querySelector<HTMLLIElement>(`#${CSS.escape(id)}`);
      if (li) this.redraw_node(li, node);
    }
  }

  get_type(obj: string | HTMLElement): string | false {
    const node = this.tree.get_node(obj);
    return node ? node.type : false;
  }

  set_type(obj: string | HTMLElement, type: string): boolean {
    const node = this.tree.get_node(obj);
    if (!node) return false;
    node.type = type;
    const li = this.tree.element.querySelector<HTMLLIElement>(`#${CSS.escape(node.id)}`);
    if (li) this.redraw_node(li, node);
    return true;
  }
}

registerPlugin('types', TypesPlugin);
export { TypesPlugin };
