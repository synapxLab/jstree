import { PluginBase, registerPlugin } from '../../core/JsTree';
import type { ContextMenuOptions, ContextMenuItem, ContextMenuActionData, JsTreeNode } from '../../core/JsTree.types';

class ContextMenuPlugin extends PluginBase {

  private _menu: HTMLElement | null = null;

  private get _opts(): ContextMenuOptions {
    const defaults: ContextMenuOptions = {
      select_node:  true,
      show_at_node: true,
      items: (node) => this._defaultItems(node),
    };
    return { ...defaults, ...(this.opts as ContextMenuOptions) };
  }

  init(): void {
    this.tree.element.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onKeyDown);
  }

  destroy(): void {
    this.tree.element.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeyDown);
    this._closeMenu();
  }

  private _onContextMenu = (e: MouseEvent): void => {
    const anchor = (e.target as HTMLElement).closest<HTMLElement>('.jstree-anchor');
    if (!anchor) return;
    const li = anchor.closest<HTMLElement>('li.jstree-node');
    if (!li) return;

    e.preventDefault();
    const id = li.dataset['id'];
    if (!id) return;
    const node = this.tree.get_node(id);
    if (!node) return;

    if (this._opts.select_node && !node.state.selected) {
      this.tree.select_node(id);
    }

    this._showMenu(node, anchor, e.clientX, e.clientY);
  };

  private _onDocClick = (): void => { this._closeMenu(); };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this._closeMenu();
  };

  private _showMenu(node: JsTreeNode, reference: HTMLElement, x: number, y: number): void {
    this._closeMenu();

    const itemsFn = this._opts.items;
    if (!itemsFn) return;

    const resolve = (items: Record<string, ContextMenuItem>) => {
      this._renderMenu(items, node, reference, x, y);
    };

    if (typeof itemsFn === 'function') {
      const result = itemsFn(node, resolve);
      if (result) resolve(result);
    } else {
      resolve(itemsFn);
    }
  }

  private _renderMenu(
    items: Record<string, ContextMenuItem>,
    node: JsTreeNode,
    reference: HTMLElement,
    x: number,
    y: number,
  ): void {
    const menu = document.createElement('div');
    menu.classList.add('jstree-contextmenu');

    const ul = document.createElement('ul');

    for (const [, item] of Object.entries(items)) {
      if (item.separator_before) ul.appendChild(this._makeSeparator());
      ul.appendChild(this._makeItem(item, node, reference, menu, x, y));
      if (item.separator_after) ul.appendChild(this._makeSeparator());
    }

    menu.appendChild(ul);
    document.body.appendChild(menu);
    this._menu = menu;

    // Position
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top  = y;

    if (this._opts.show_at_node) {
      const rect = reference.getBoundingClientRect();
      left = rect.left;
      top  = rect.bottom;
    }

    menu.style.left = `${left}px`;
    menu.style.top  = `${top}px`;

    // Keep in viewport
    requestAnimationFrame(() => {
      const mr = menu.getBoundingClientRect();
      if (mr.right  > vw) menu.style.left = `${vw - mr.width - 4}px`;
      if (mr.bottom > vh) menu.style.top  = `${top - mr.height}px`;
    });

    this.tree.trigger('show_contextmenu', { node, reference, element: menu, position: { x, y } });
  }

  private _makeItem(
    item: ContextMenuItem,
    node: JsTreeNode,
    reference: HTMLElement,
    menu: HTMLElement,
    x: number,
    y: number,
  ): HTMLLIElement {
    const li = document.createElement('li');

    const disabled = typeof item._disabled === 'function'
      ? item._disabled({ item, reference, element: menu, position: { x, y } })
      : (item._disabled ?? false);

    if (disabled) li.classList.add('jstree-contextmenu-disabled');

    const a = document.createElement('a');
    a.href = '#';
    const label = typeof item.label === 'function' ? item.label() : item.label;
    a.textContent = label;
    if (item.title) a.title = item.title;

    if (item.icon) {
      const ico = document.createElement('i');
      ico.className = item.icon;
      ico.style.marginRight = '6px';
      a.insertBefore(ico, a.firstChild);
    }

    if (!disabled && item.action) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._closeMenu();
        const data: ContextMenuActionData = { item, reference, element: menu, position: { x, y } };
        item.action!(data);
      });
    } else {
      a.addEventListener('click', (e) => e.preventDefault());
    }

    li.appendChild(a);
    return li;
  }

  private _makeSeparator(): HTMLLIElement {
    const li = document.createElement('li');
    li.classList.add('jstree-contextmenu-separator');
    return li;
  }

  private _closeMenu(): void {
    this._menu?.remove();
    this._menu = null;
  }

  private _defaultItems(node: JsTreeNode): Record<string, ContextMenuItem> {
    return {
      create: {
        label: 'Create',
        separator_after: true,
        action: (data) => {
          const inst = this.tree;
          const newId = inst.create_node(node.id, {}, 'last');
          if (newId) {
            try { inst.edit(newId); }
            catch { setTimeout(() => inst.edit(newId), 0); }
          }
        },
      },
      rename: {
        label: 'Rename',
        action: () => this.tree.edit(node.id),
      },
      remove: {
        label: 'Delete',
        separator_before: true,
        action: () => this.tree.delete_node(node.id),
      },
    };
  }
}

registerPlugin('contextmenu', ContextMenuPlugin);
export { ContextMenuPlugin };
