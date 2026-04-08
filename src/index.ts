// ─── Core ────────────────────────────────────────────────────────────────────
export { JsTree, PluginBase, registerPlugin } from './core/JsTree';

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  JsTreeOptions,
  JsTreeNode,
  JsTreeNodeData,
  JsTreePlugin,
  JsTreeState,
  ContextMenuItem,
  ContextMenuActionData,
  ContextMenuOptions,
  DndOptions,
  SearchOptions,
  StateOptions,
  TypesOptions,
  TypeDefinition,
  CheckboxOptions,
  NodeEventDetail,
  MoveNodeEventDetail,
  RenameNodeEventDetail,
  DndStartData,
} from './core/JsTree.types';

// ─── Plugins (side-effect: registers each plugin) ────────────────────────────
import './plugins/wholerow/Wholerow';
import './plugins/search/Search';
import './plugins/state/State';
import './plugins/types/Types';
import './plugins/checkbox/Checkbox';
import './plugins/contextmenu/ContextMenu';
import './plugins/dnd/DragDrop';

// ─── Re-export plugin classes ────────────────────────────────────────────────
export { WholerowPlugin }  from './plugins/wholerow/Wholerow';
export { SearchPlugin }    from './plugins/search/Search';
export { StatePlugin }     from './plugins/state/State';
export { TypesPlugin }     from './plugins/types/Types';
export { CheckboxPlugin }  from './plugins/checkbox/Checkbox';
export { ContextMenuPlugin } from './plugins/contextmenu/ContextMenu';
export { DndPlugin }       from './plugins/dnd/DragDrop';

// ─── Styles ───────────────────────────────────────────────────────────────────
// imported transitively via JsTree.ts → JsTree.scss
