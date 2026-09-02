// ─── Node data (input format) ─────────────────────────────────────────────────

export interface JsTreeNodeData {
  id?: string;
  text: string;
  parent?: string;       // '#' = root, default '#'
  icon?: string | false; // CSS class, URL or false to hide
  state?: {
    opened?:   boolean;
    selected?: boolean;
    disabled?: boolean;
    checked?:  boolean;
  };
  children?: boolean | JsTreeNodeData[];  // true = lazy (AJAX), array = inline
  li_attr?: Record<string, string>;
  a_attr?:  Record<string, string>;
  type?: string;         // used by types plugin
  data?: unknown;
}

// ─── Internal model node ──────────────────────────────────────────────────────

export interface JsTreeNode {
  id:          string;
  text:        string;
  parent:      string;
  icon:        string | false;
  state: {
    loaded:   boolean;
    opened:   boolean;
    selected: boolean;
    disabled: boolean;
    checked:  boolean;
  };
  children:    string[];
  children_d:  string[];
  parents:     string[];
  li_attr:     Record<string, string>;
  a_attr:      Record<string, string>;
  type:        string;
  data:        unknown;
  original?:   JsTreeNodeData;
}

// ─── Core options ─────────────────────────────────────────────────────────────

export interface JsTreeCoreOptions {
  data?:
    | JsTreeNodeData[]
    | string                                          // AJAX URL
    | ((node: JsTreeNode, cb: (d: JsTreeNodeData[]) => void) => void);
  check_callback?: boolean | ((op: string, node: JsTreeNode, parent: JsTreeNode, position: number | string, more?: unknown) => boolean);
  multiple?:      boolean;
  animation?:     number | false;
  themes?: {
    name?:    string;
    dots?:    boolean;
    icons?:   boolean;
    stripes?: boolean;
    variant?: string;
  };
  strings?: Record<string, string>;
  force_text?: boolean;
  dblclick_toggle?: boolean;
  worker?: boolean;
}

// ─── Plugin options ───────────────────────────────────────────────────────────

export interface ContextMenuItem {
  label:            string | (() => string);
  title?:           string;
  icon?:            string;
  action?:          (data: ContextMenuActionData) => void;
  separator_before?: boolean;
  separator_after?:  boolean;
  _disabled?:       boolean | ((data: ContextMenuActionData) => boolean);
  shortcut?:        number;
  shortcut_label?:  string;
  submenu?:         Record<string, ContextMenuItem>;
}

export interface ContextMenuActionData {
  item:      ContextMenuItem;
  reference: HTMLElement;
  element:   HTMLElement;
  position:  { x: number; y: number };
}

export interface ContextMenuOptions {
  select_node?:  boolean;
  show_at_node?: boolean;
  items?:
    | Record<string, ContextMenuItem>
    | ((node: JsTreeNode, cb: (items: Record<string, ContextMenuItem>) => void) => Record<string, ContextMenuItem> | void);
}

export interface DndOptions {
  copy?:               boolean;
  open_timeout?:       number;
  is_draggable?:       boolean | ((nodes: JsTreeNode[], e: DragEvent) => boolean);
  check_while_dragging?: boolean;
  always_copy?:        boolean;
  inside_pos?:         number | 'first' | 'last';
  /**
   * Le dépôt ne connaît qu'une position : DANS le nœud survolé. Ni marqueur
   * d'insertion, ni bandes de bord — toute la ligne est une cible.
   *
   * À activer quand l'ordre des frères ne se décide pas au geste : un arbre
   * trié à la lecture reclassera de toute façon, et annoncer une insertion
   * « entre deux » promet un résultat qu'il ne tiendra pas.
   */
  inside_only?:        boolean;
  drag_selection?:     boolean;
  touch?:              boolean | 'selected';
  large_drop_target?:  boolean;
  large_drag_target?:  boolean;
  use_html5?:          boolean;
}

export interface SearchOptions {
  ajax?: false | { url: string };
  fuzzy?: boolean;
  case_sensitive?: boolean;
  search_leaves_only?: boolean;
  show_only_matches?: boolean;
  show_only_matches_children?: boolean;
  close_opened_onclear?: boolean;
}

export interface StateOptions {
  key?:      string;
  events?:   string;
  filter?:   (state: JsTreeState) => JsTreeState;
}

export interface JsTreeState {
  core: {
    open:     string[];
    scroll:   { x: number; y: number };
    selected: string[];
  };
}

export interface TypeDefinition {
  max_children?: number;    // -1 = unlimited
  max_depth?:    number;    // -1 = unlimited
  valid_children?: string[] | 'all' | 'none';
  icon?:         string | false;
  li_attr?:      Record<string, string>;
  a_attr?:       Record<string, string>;
}

export interface TypesOptions {
  default?: TypeDefinition;
  '#'?:     TypeDefinition;
  [key: string]: TypeDefinition | undefined;
}

export interface CheckboxOptions {
  visible?:         boolean;
  three_state?:     boolean;
  whole_node?:      boolean;
  keep_selected_style?: boolean;
  cascade?:         string;  // 'up', 'down', 'up+down'
  tie_selection?:   boolean;
}

// ─── Full options ─────────────────────────────────────────────────────────────

export type JsTreePlugin = 'contextmenu' | 'dnd' | 'search' | 'state' | 'types' | 'wholerow' | 'checkbox' | 'sort';

export interface JsTreeOptions {
  core?:        JsTreeCoreOptions;
  plugins?:     JsTreePlugin[];
  contextmenu?: ContextMenuOptions;
  dnd?:         DndOptions;
  search?:      SearchOptions;
  state?:       StateOptions;
  types?:       TypesOptions;
  checkbox?:    CheckboxOptions;
}

// ─── Event detail types ───────────────────────────────────────────────────────

export interface NodeEventDetail {
  node:     JsTreeNode;
  instance: import('./JsTree').JsTree;
}

export interface MoveNodeEventDetail {
  node:        JsTreeNode;
  parent:      string;
  position:    number;
  old_parent:  string;
  old_position: number;
  is_multi:    boolean;
  old_instance: import('./JsTree').JsTree;
  new_instance: import('./JsTree').JsTree;
}

export interface RenameNodeEventDetail {
  node: JsTreeNode;
  text: string;
  old:  string;
}

// ─── DnD external drag support ───────────────────────────────────────────────

export interface DndStartData {
  jstree?:  boolean;
  nodes?:   unknown[];
  obj?:     HTMLElement;
  ged_id?:  unknown;
  [key: string]:  unknown;
}
