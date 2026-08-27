import type {
  JsTreeOptions, JsTreeNode, JsTreeNodeData,
  MoveNodeEventDetail,
} from './JsTree.types';
import './JsTree.scss';

// ─── Constants ───────────────────────────────────────────────────────────────

const ROOT = '#';
let instanceCounter = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return 'j' + (++instanceCounter) + '_' + Math.random().toString(36).slice(2, 8);
}

function escId(id: string): string {
  return id.replace(/[\\:&!^|()\[\]<>@*'+~#";.,=\- \/${}%?`]/g, '\\$&');
}

// ─── JsTree ───────────────────────────────────────────────────────────────────

export class JsTree {

  readonly id: string;
  readonly element: HTMLElement;
  settings: JsTreeOptions;

  // internal model
  _model: {
    data: Record<string, JsTreeNode>;
    changed: string[];
  };

  // plugin data slots
  _data: Record<string, Record<string, unknown>> = { core: {} };

  // plugin instances map
  private _plugins: Map<string, PluginBase> = new Map();

  // static registry
  static plugins: Record<string, new (tree: JsTree, opts: unknown) => PluginBase> = {};

  // ─── static DnD helper (replaces $.vakata.dnd) ───────────────────────────
  static vakata = {
    dnd: {
      start(e: MouseEvent | TouchEvent, data: Record<string, unknown>, element: HTMLElement): void {
        const event = new CustomEvent('dnd_start.vakata', {
          bubbles: true,
          detail: { data, element, event: e },
        });
        (e.target as HTMLElement | null)?.dispatchEvent(event);
      },
    },
  };

  constructor(el: string | HTMLElement, options: JsTreeOptions = {}) {
    this.id = uid();

    const container = typeof el === 'string'
      ? (document.querySelector(el) as HTMLElement | null)
      : el;
    if (!container) throw new Error(`JsTree: element not found — ${String(el)}`);
    this.element = container;

    this.settings = this._mergeDefaults(options);

    this._model = {
      data: {},
      changed: [],
    };
    this._model.data[ROOT] = this._makeRootNode();

    this.element.classList.add('jstree', `jstree-${this.id}`);
    this.element.setAttribute('role', 'tree');
    if (this.settings.core?.multiple) {
      this.element.setAttribute('aria-multiselectable', 'true');
    }
    if (!this.element.getAttribute('tabindex')) {
      this.element.setAttribute('tabindex', '0');
    }

    this._applyTheme();
    this._bindCoreEvents();
    this._activatePlugins();
    JsTree._register(this);
    this.trigger('init');
    this._loadNode(ROOT);
  }

  // ─── Default options ────────────────────────────────────────────────────────

  private _mergeDefaults(options: JsTreeOptions): JsTreeOptions {
    const defaults: JsTreeOptions = {
      core: {
        multiple:       false,
        animation:      200,
        check_callback: false,
        dblclick_toggle: true,
        themes: { dots: true, icons: true, stripes: false },
        strings: {
          'Loading ...': 'Loading ...',
          'New node':    'New node',
        },
      },
      plugins: [],
    };
    return {
      ...defaults,
      ...options,
      core: { ...defaults.core, ...options.core },
      plugins: options.plugins ?? defaults.plugins ?? [],
    };
  }

  // ─── Internal model ─────────────────────────────────────────────────────────

  private _makeRootNode(): JsTreeNode {
    return {
      id: ROOT, text: '', parent: '', icon: false,
      state: { loaded: false, opened: true, selected: false, disabled: false, checked: false },
      children: [], children_d: [], parents: [],
      li_attr: {}, a_attr: {}, type: 'default', data: null,
    };
  }

  private _makeNode(d: JsTreeNodeData, parent: string): JsTreeNode {
    const id = d.id ?? uid();
    return {
      id,
      text:   d.text,
      parent,
      icon:   d.icon !== undefined ? d.icon : 'jstree-file',
      state: {
        loaded:   Array.isArray(d.children) || !d.children,
        opened:   d.state?.opened  ?? false,
        selected: d.state?.selected ?? false,
        disabled: d.state?.disabled ?? false,
        checked:  d.state?.checked  ?? false,
      },
      children:   [],
      children_d: [],
      parents:    this._buildParents(parent),
      li_attr: { ...(d.li_attr ?? {}), id },
      a_attr:  { ...(d.a_attr ?? {}), href: '#' },
      type:    d.type ?? 'default',
      data:    d.data ?? null,
      original: d,
    };
  }

  private _buildParents(parentId: string): string[] {
    if (parentId === ROOT) return [ROOT];
    const p = this._model.data[parentId];
    return p ? [parentId, ...p.parents] : [ROOT];
  }

  // ─── Data loading ───────────────────────────────────────────────────────────

  private _loadNode(id: string): void {
    const node = this._model.data[id];
    if (!node) return;

    const data = this.settings.core?.data;

    if (!data) {
      this._model.data[ROOT]!.state.loaded = true;
      this._redraw();
      this.trigger('ready');
      return;
    }

    if (typeof data === 'function') {
      data(node, (nodes) => this._loadNodeCallback(id, nodes));
      return;
    }

    if (typeof data === 'string') {
      const url = id === ROOT ? data : `${data}?id=${encodeURIComponent(id)}`;
      fetch(url)
        .then((r) => r.json() as Promise<JsTreeNodeData[]>)
        .then((nodes) => this._loadNodeCallback(id, nodes))
        .catch(() => this._loadNodeCallback(id, []));
      return;
    }

    if (Array.isArray(data) && id === ROOT) {
      this._loadNodeCallback(id, data);
    }
  }

  private _loadNodeCallback(parentId: string, items: JsTreeNodeData[]): void {
    const parent = this._model.data[parentId];
    if (!parent) return;
    parent.state.loaded = true;

    // Support nested or flat
    const flat = this._flatten(items, parentId);
    for (const n of flat) {
      this._model.data[n.id] = n;
    }
    // Rebuild children lists
    this._rebuildChildren();

    if (parentId === ROOT) {
      this.trigger('loaded');
    }
    this._redraw();
    this.trigger('ready');
  }

  private _flatten(items: JsTreeNodeData[], defaultParent: string): JsTreeNode[] {
    const result: JsTreeNode[] = [];

    const process = (list: JsTreeNodeData[], parent: string) => {
      for (const d of list) {
        const node = this._makeNode(d, parent);
        result.push(node);
        if (Array.isArray(d.children) && d.children.length > 0) {
          process(d.children as JsTreeNodeData[], node.id);
        }
      }
    };

    // Flat format: items have explicit parent field
    const hasExplicitParent = items.length > 0 && items[0] !== undefined && 'parent' in items[0];
    if (hasExplicitParent) {
      for (const d of items) {
        const parent = (d.parent !== undefined && d.parent !== '') ? d.parent : defaultParent;
        result.push(this._makeNode(d, parent));
      }
    } else {
      process(items, defaultParent);
    }

    return result;
  }

  private _rebuildChildren(): void {
    // Reset children
    for (const id of Object.keys(this._model.data)) {
      const n = this._model.data[id];
      if (n) { n.children = []; n.children_d = []; }
    }
    // Build from parent refs
    for (const id of Object.keys(this._model.data)) {
      if (id === ROOT) continue;
      const node = this._model.data[id];
      if (!node) continue;
      const parent = this._model.data[node.parent];
      if (parent && !parent.children.includes(id)) {
        parent.children.push(id);
      }
    }
    this._rebuildChildrenD();
  }

  /** Recompute children_d (all descendants) from the current, ordered children arrays. */
  private _rebuildChildrenD(): void {
    const buildDesc = (id: string): string[] => {
      const node = this._model.data[id];
      if (!node) return [];
      const desc: string[] = [];
      for (const cid of node.children) {
        desc.push(cid, ...buildDesc(cid));
      }
      node.children_d = desc;
      return desc;
    };
    buildDesc(ROOT);
  }

  /** Refresh the `parents` chain for a node and its whole subtree (top-down). */
  private _refreshParents(id: string): void {
    const node = this._model.data[id];
    if (!node) return;
    node.parents = this._buildParents(node.parent);
    for (const cid of node.children) this._refreshParents(cid);
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  private _redraw(): void {
    const root = this._model.data[ROOT];
    if (!root?.state.loaded) return;

    const ul = this._renderChildren(ROOT);
    ul.classList.add('jstree-container-ul', 'jstree-children');
    this.element.innerHTML = '';
    this.element.appendChild(ul);

    this.trigger('redraw');
  }

  private _renderChildren(parentId: string): HTMLUListElement {
    const ul = document.createElement('ul');
    ul.classList.add('jstree-children');
    ul.setAttribute('role', 'group');

    const parent = this._model.data[parentId];
    if (!parent) return ul;

    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
      const childId = children[i];
      if (!childId) continue;
      const node = this._model.data[childId];
      if (!node) continue;
      const isLast = i === children.length - 1;
      ul.appendChild(this._renderNode(node, isLast));
    }
    return ul;
  }

  private _renderNode(node: JsTreeNode, isLast: boolean): HTMLLIElement {
    const li = document.createElement('li');
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-selected', String(node.state.selected));
    li.dataset['id'] = node.id;

    // li_attr
    for (const [k, v] of Object.entries(node.li_attr)) {
      if (k !== 'id') li.setAttribute(k, v);
    }
    li.id = node.id;

    const isLeaf = node.children.length === 0 && node.state.loaded && node.icon !== false;
    const isOpen = node.state.opened && !isLeaf;

    li.classList.add('jstree-node');
    if (isLeaf)            li.classList.add('jstree-leaf');
    else if (isOpen)       li.classList.add('jstree-open');
    else                   li.classList.add('jstree-closed');
    if (isLast)            li.classList.add('jstree-last');
    if (node.state.selected) li.classList.add('jstree-clicked');
    if (node.state.disabled) li.classList.add('jstree-disabled');

    // open/close icon
    const ocl = document.createElement('i');
    ocl.classList.add('jstree-icon', 'jstree-ocl');
    ocl.setAttribute('role', 'presentation');
    li.appendChild(ocl);

    // anchor
    const a = document.createElement('a');
    a.classList.add('jstree-anchor');
    a.setAttribute('href', '#');
    a.setAttribute('tabindex', '-1');
    a.setAttribute('role', 'treeitem');
    if (node.state.selected) a.classList.add('jstree-clicked');
    if (node.state.disabled) a.classList.add('jstree-disabled');

    for (const [k, v] of Object.entries(node.a_attr)) {
      if (k !== 'href') a.setAttribute(k, v);
    }

    // theme icon
    const themeIcon = document.createElement('i');
    themeIcon.classList.add('jstree-icon', 'jstree-themeicon');
    if (node.icon === false) {
      themeIcon.classList.add('jstree-themeicon-hidden');
    } else if (node.icon) {
      // could be CSS class or image URL
      if (node.icon.startsWith('/') || node.icon.startsWith('http') || node.icon.endsWith('.png') || node.icon.endsWith('.svg')) {
        themeIcon.style.backgroundImage = `url(${node.icon})`;
        themeIcon.style.backgroundPosition = 'center';
        themeIcon.style.backgroundSize = 'auto';
        themeIcon.style.backgroundRepeat = 'no-repeat';
      } else {
        themeIcon.className = `jstree-icon jstree-themeicon ${node.icon}`;
      }
    }
    a.appendChild(themeIcon);

    // text
    const span = document.createElement('span');
    span.classList.add('jstree-text');
    span.textContent = node.text;
    a.appendChild(span);
    li.appendChild(a);

    // give plugins a chance to decorate
    this._pluginHook('redraw_node', li, node);

    // children
    if (!isLeaf) {
      if (isOpen) {
        li.appendChild(this._renderChildren(node.id));
      } else if (!node.state.loaded) {
        // lazy: render empty children list
        const emptyUl = document.createElement('ul');
        emptyUl.classList.add('jstree-children');
        li.appendChild(emptyUl);
      } else {
        const childUl = this._renderChildren(node.id);
        li.appendChild(childUl);
      }
    }

    return li;
  }

  // ─── Plugin system ──────────────────────────────────────────────────────────

  private _activatePlugins(): void {
    for (const name of (this.settings.plugins ?? [])) {
      const Ctor = JsTree.plugins[name];
      if (!Ctor) { console.warn(`JsTree: plugin "${name}" not registered`); continue; }
      this._data[name] = {};
      const inst = new Ctor(this, this.settings[name as keyof JsTreeOptions] ?? {});
      this._plugins.set(name, inst);
      inst.init?.();
    }
  }

  private _pluginHook(hook: string, ...args: unknown[]): void {
    for (const plugin of this._plugins.values()) {
      const fn = (plugin as unknown as Record<string, unknown>)[hook];
      if (typeof fn === 'function') {
        (fn as (...a: unknown[]) => void).apply(plugin, args);
      }
    }
  }

  getPlugin<T extends PluginBase>(name: string): T | undefined {
    return this._plugins.get(name) as T | undefined;
  }

  // ─── Theme ──────────────────────────────────────────────────────────────────

  private _applyTheme(): void {
    const t = this.settings.core?.themes ?? {};
    if (t.dots    === false) this.element.classList.add('jstree-no-dots');
    if (t.icons   === false) this.element.classList.add('jstree-no-icons');
    if (t.stripes === true)  this.element.classList.add('jstree-striped');
    this.element.classList.add('jstree-default');
  }

  // ─── Core events ────────────────────────────────────────────────────────────

  private _bindCoreEvents(): void {
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest<HTMLElement>('.jstree-anchor');
      const ocl    = target.closest<HTMLElement>('.jstree-ocl');
      const li     = target.closest<HTMLElement>('li.jstree-node');
      if (!li) return;

      const id = li.dataset['id'];
      if (!id) return;
      const node = this._model.data[id];
      if (!node || node.state.disabled) return;

      if (ocl) {
        e.preventDefault();
        if (li.classList.contains('jstree-leaf')) return;
        node.state.opened ? this.close_node(id) : this.open_node(id);
        return;
      }

      if (anchor) {
        e.preventDefault();
        if (this.settings.core?.multiple && e.ctrlKey) {
          node.state.selected ? this.deselect_node(id) : this.select_node(id, true);
        } else {
          this.select_node(id);
        }
      }
    });

    this.element.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      const li = target.closest<HTMLElement>('li.jstree-node');
      if (!li) return;
      const id = li.dataset['id'];
      if (!id) return;
      const node = this._model.data[id];
      if (!node || node.state.disabled) return;
      if (this.settings.core?.dblclick_toggle) {
        node.state.opened ? this.close_node(id) : this.open_node(id);
      }
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Refresh and reload all data */
  refresh(): void {
    this._model.data = {};
    this._model.data[ROOT] = this._makeRootNode();
    this.trigger('refresh');
    this._loadNode(ROOT);
  }

  /** Get a node by id, element or dataset */
  get_node(obj: string | HTMLElement | null): JsTreeNode | false {
    if (!obj) return false;
    let id: string;
    if (typeof obj === 'string') {
      id = obj.startsWith('#') && obj !== ROOT ? obj.slice(1) : obj;
    } else {
      id = obj.closest<HTMLElement>('li.jstree-node')?.dataset['id'] ?? '';
    }
    return this._model.data[id] ?? false;
  }

  /** Open a node (show its children) */
  open_node(obj: string | HTMLElement, callback?: (node: JsTreeNode) => void): void {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node || node.id === ROOT) return;
    if (node.state.opened) { callback?.(node); return; }

    if (!node.state.loaded) {
      this._loadNode(node.id);
      const onReady = () => {
        this.element.removeEventListener('ready.jstree' as string, onReady);
        node.state.opened = true;
        this._redrawNode(node.id);
        this.trigger('open_node', { node });
        callback?.(node);
      };
      this.element.addEventListener('ready.jstree', onReady);
      return;
    }

    node.state.opened = true;
    this._redrawNode(node.id);
    this.trigger('open_node', { node });
    callback?.(node);
  }

  /** Close a node */
  close_node(obj: string | HTMLElement): void {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node || !node.state.opened) return;
    node.state.opened = false;
    this._redrawNode(node.id);
    this.trigger('close_node', { node });
  }

  /** Open all nodes */
  open_all(obj?: string | HTMLElement): void {
    const root = obj ? this.get_node(obj) : this._model.data[ROOT];
    if (!root) return;
    const ids = root.id === ROOT ? root.children_d : [root.id, ...root.children_d];
    for (const id of ids) {
      const n = this._model.data[id];
      if (n && !n.state.opened && n.children.length > 0) {
        this.open_node(id);
      }
    }
  }

  /** Close all nodes */
  close_all(obj?: string | HTMLElement): void {
    const root = obj ? this.get_node(obj) : this._model.data[ROOT];
    if (!root) return;
    const ids = root.id === ROOT ? root.children_d : [root.id, ...root.children_d];
    for (const id of [...ids].reverse()) {
      const n = this._model.data[id];
      if (n && n.state.opened) this.close_node(id);
    }
  }

  /** Select a node */
  select_node(obj: string | HTMLElement, keepPrevious = false): void {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node || node.state.disabled || node.state.selected) return;

    if (!keepPrevious && !this.settings.core?.multiple) {
      this.deselect_all(true);
    }

    node.state.selected = true;
    this._model.changed.push(node.id);
    this._updateNodeDOM(node.id);
    this.trigger('select_node', { node });
    this.trigger('changed', { selected: this.get_selected() });
  }

  /** Deselect a node */
  deselect_node(obj: string | HTMLElement): void {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node || !node.state.selected) return;
    node.state.selected = false;
    this._model.changed.push(node.id);
    this._updateNodeDOM(node.id);
    this.trigger('deselect_node', { node });
    this.trigger('changed', { selected: this.get_selected() });
  }

  /** Deselect all nodes */
  deselect_all(silent = false): void {
    for (const id of Object.keys(this._model.data)) {
      const n = this._model.data[id];
      if (n?.state.selected) {
        n.state.selected = false;
        this._updateNodeDOM(id);
      }
    }
    if (!silent) this.trigger('deselect_all');
  }

  /** Get all selected node ids */
  get_selected(full = false): string[] | JsTreeNode[] {
    const sel: JsTreeNode[] = [];
    for (const n of Object.values(this._model.data)) {
      if (n?.state.selected) sel.push(n);
    }
    return full ? sel : sel.map((n) => n.id);
  }

  /** Get text of a node */
  get_text(obj: string | HTMLElement): string | false {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    return node ? node.text : false;
  }

  /** Set text of a node */
  set_text(obj: string | HTMLElement, text: string): boolean {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node) return false;
    const old = node.text;
    node.text = text;
    this._updateNodeDOM(node.id);
    this.trigger('set_text', { node, text, old });
    return true;
  }

  /** Get parent node id */
  get_parent(obj: string | HTMLElement): string | false {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    return node ? node.parent : false;
  }

  /** Get children ids */
  get_children_dom(obj: string): HTMLElement[] {
    const li = this.element.querySelector<HTMLElement>(`#${CSS.escape(obj)}`);
    if (!li) return [];
    return Array.from(li.querySelectorAll<HTMLElement>(':scope > ul > li'));
  }

  /** Create a new node */
  create_node(
    parent: string | HTMLElement | null,
    nodeData: Partial<JsTreeNodeData> = {},
    position: number | 'first' | 'last' = 'last',
    callback?: (node: JsTreeNode) => void,
  ): string | false {
    const parentNode = parent
      ? (typeof parent === 'string' ? this._model.data[parent] : this.get_node(parent))
      : this._model.data[ROOT];
    if (!parentNode) return false;

    const data: JsTreeNodeData = {
      text: this.settings.core?.strings?.['New node'] ?? 'New node',
      ...nodeData,
      parent: parentNode.id,
    };

    const node = this._makeNode(data, parentNode.id);
    node.parents = this._buildParents(parentNode.id);
    this._model.data[node.id] = node;
    this._rebuildChildren();
    this._redrawNode(parentNode.id);
    this.trigger('create_node', { node, parent: parentNode.id, position });
    callback?.(node);
    return node.id;
  }

  /** Rename a node (inline edit) */
  rename_node(obj: string | HTMLElement, text: string): boolean {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node) return false;
    const old = node.text;
    node.text = text;
    this._updateNodeDOM(node.id);
    this.trigger('rename_node', { node, text, old });
    return true;
  }

  /** Start inline editing */
  edit(obj: string | HTMLElement, defaultText?: string): void {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node) return;

    const li = this.element.querySelector<HTMLElement>(`#${CSS.escape(node.id)}`);
    const span = li?.querySelector<HTMLElement>('.jstree-text');
    if (!span) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultText ?? node.text;
    input.classList.add('jstree-rename-input');

    const originalText = node.text;
    span.style.display = 'none';
    span.parentElement!.insertBefore(input, span);
    input.focus();
    input.select();

    const finish = () => {
      const val = input.value.trim();
      input.remove();
      span.style.display = '';
      if (val && val !== originalText) {
        this.rename_node(node.id, val);
      }
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = originalText; input.blur(); }
    });
  }

  /** Delete a node */
  delete_node(obj: string | HTMLElement): boolean {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node || node.id === ROOT) return false;

    const parent = this._model.data[node.parent];
    const toDelete = [node.id, ...node.children_d];
    for (const id of toDelete) {
      delete this._model.data[id];
    }
    this._rebuildChildren();
    if (parent) this._redrawNode(parent.id);
    this.trigger('delete_node', { node, parent: node.parent });
    return true;
  }

  /** Move node to a new parent */
  move_node(
    obj: string | HTMLElement,
    newParent: string | HTMLElement,
    position: number | 'first' | 'last' = 'last',
  ): boolean {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    const np   = typeof newParent === 'string' ? this._model.data[newParent] : this.get_node(newParent);
    if (!node || !np) return false;
    // Garde anti-cycle : un nœud ne peut pas devenir enfant de lui-même ni d'un
    // de ses PROPRES descendants.
    //
    // Elle testait l'inverse — `np.children_d.includes(node.id)`, soit « le
    // nouveau parent contient déjà ce nœud » — ce qui refusait de REMONTER un
    // nœud vers un ancêtre. Or déplacer une sous-famille vers la racine, ou d'un
    // cran vers le grand-parent, est l'opération la plus courante de l'arbre.
    // Elle échouait sans un mot : le picto annonçait le dépôt, le drop rendait
    // false, et rien ne bougeait.
    if (node.id === ROOT || node.id === np.id) return false;
    if (node.children_d.includes(np.id)) return false;

    const oldParent   = node.parent;
    const oldPosition = this._model.data[oldParent]?.children.indexOf(node.id) ?? -1;

    // Reparent, then rebuild children/children_d from parent refs…
    node.parent = np.id;
    this._rebuildChildren();

    // …then place the node at the requested position among its new siblings.
    const cur = np.children.indexOf(node.id);
    if (cur !== -1) np.children.splice(cur, 1);

    let idx: number;
    if (position === 'first')     idx = 0;
    else if (position === 'last') idx = np.children.length;
    else {
      idx = position;
      if (cur !== -1 && cur < idx) idx -= 1; // compensate for removing the node itself
      idx = Math.max(0, Math.min(idx, np.children.length));
    }
    np.children.splice(idx, 0, node.id);

    // Reordering invalidates descendant lists and the moved subtree's parents chain.
    this._rebuildChildrenD();
    this._refreshParents(node.id);

    this._redrawNode(oldParent);
    this._redrawNode(np.id);

    const detail: MoveNodeEventDetail = {
      node,
      parent:       np.id,
      position:     idx,
      old_parent:   oldParent,
      old_position: oldPosition,
      is_multi:     false,
      old_instance: this,
      new_instance: this,
    };
    this.trigger('move_node', detail);
    return true;
  }

  /** Get path (array of texts) from root to node */
  get_path(obj: string | HTMLElement, glue?: string, ids = false): string | string[] | false {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    if (!node) return false;
    const path = [...node.parents].reverse()
      .filter((id) => id !== ROOT)
      .map((id) => ids ? id : (this._model.data[id]?.text ?? id));
    path.push(ids ? node.id : node.text);
    return glue ? path.join(glue) : path;
  }

  /** Check if node is selected */
  is_selected(obj: string | HTMLElement): boolean {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    return node ? node.state.selected : false;
  }

  /** Check if node is open */
  is_open(obj: string | HTMLElement): boolean {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    return node ? node.state.opened : false;
  }

  /** Check if node is leaf */
  is_leaf(obj: string | HTMLElement): boolean {
    const node = typeof obj === 'string' ? this._model.data[obj] : this.get_node(obj);
    return node ? node.children.length === 0 && node.state.loaded : false;
  }

  // ─── DOM updates ────────────────────────────────────────────────────────────

  private _redrawNode(id: string): void {
    const node = this._model.data[id];
    if (!node) return;

    if (id === ROOT) {
      this._redraw();
      return;
    }

    const li = this.element.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!li) {
      // node not yet rendered — redraw parent
      this._redrawNode(node.parent);
      return;
    }

    const parent = li.parentElement;
    if (!parent) return;

    const siblings = Array.from(parent.children);
    const isLast = siblings[siblings.length - 1] === li;
    const newLi = this._renderNode(node, isLast);
    parent.replaceChild(newLi, li);
  }

  private _updateNodeDOM(id: string): void {
    const node = this._model.data[id];
    if (!node) return;
    const li = this.element.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!li) return;

    li.classList.toggle('jstree-clicked',  node.state.selected);
    li.classList.toggle('jstree-disabled', node.state.disabled);
    li.setAttribute('aria-selected', String(node.state.selected));

    const a = li.querySelector<HTMLElement>(':scope > .jstree-anchor');
    if (a) {
      a.classList.toggle('jstree-clicked',  node.state.selected);
      a.classList.toggle('jstree-disabled', node.state.disabled);
      const span = a.querySelector<HTMLElement>('.jstree-text');
      if (span) span.textContent = node.text;
    }
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  trigger(name: string, detail?: unknown): void {
    const event = new CustomEvent(`${name}.jstree`, {
      bubbles: true,
      detail:  detail ?? { instance: this },
    });
    this.element.dispatchEvent(event);
  }

  on(event: string, handler: (e: CustomEvent) => void): void {
    this.element.addEventListener(`${event}.jstree`, handler as EventListener);
  }

  off(event: string, handler: (e: CustomEvent) => void): void {
    this.element.removeEventListener(`${event}.jstree`, handler as EventListener);
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  search(query: string): void {
    const plugin = this._plugins.get('search') as unknown as ({ search(q: string): void } | undefined);
    if (plugin) {
      plugin.search(query);
    }
  }

  // ─── Destroy ────────────────────────────────────────────────────────────────

  destroy(keepHtml = false): void {
    this.trigger('destroy');
    for (const plugin of this._plugins.values()) {
      plugin.destroy?.();
    }
    if (!keepHtml) this.element.innerHTML = '';
    this.element.classList.remove('jstree', `jstree-${this.id}`, 'jstree-default');
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  _escId = escId;

  /** Reference an instance from any element inside it */
  static reference(el: HTMLElement | EventTarget | null): JsTree | null {
    if (!el) return null;
    const container = (el as HTMLElement).closest?.('[class*="jstree-"]');
    if (!container) return null;
    const match = Array.from(container.classList).find((c) => c.startsWith('jstree-j'));
    if (!match) return null;
    return JsTree._instances.get(match.replace('jstree-', '')) ?? null;
  }

  static _instances: Map<string, JsTree> = new Map();

  private static _register(inst: JsTree): void {
    JsTree._instances.set(inst.id, inst);
  }

  // Allow access to private fields from plugin hooks via unknown cast
  [key: string]: unknown;
}

// ─── Plugin base ─────────────────────────────────────────────────────────────

export abstract class PluginBase {
  constructor(protected tree: JsTree, protected opts: unknown) {}
  init?(): void;
  destroy?(): void;
}

// ─── Plugin registration helper ──────────────────────────────────────────────

export function registerPlugin(
  name: string,
  Ctor: new (tree: JsTree, opts: unknown) => PluginBase,
): void {
  JsTree.plugins[name] = Ctor;
}
