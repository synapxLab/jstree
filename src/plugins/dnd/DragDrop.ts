import { PluginBase, registerPlugin, JsTree } from '../../core/JsTree';
import type { DndOptions, JsTreeNode, DndStartData } from '../../core/JsTree.types';

// ─── Vakata DnD compatibility shim ───────────────────────────────────────────
// Replaces $.vakata.dnd for external drag sources (e.g. GED files)

export interface VakataDndEvent {
  data:    DndStartData;
  element: HTMLElement;
  event:   MouseEvent | TouchEvent;
}

// ─── Internal drag state ──────────────────────────────────────────────────────

interface DragState {
  dragging:    boolean;
  nodes:       JsTreeNode[];
  helper:      HTMLElement | null;
  target:      HTMLElement | null;
  targetId:    string | null;
  targetPos:   'before' | 'inside' | 'after';
  sourceTree:  JsTree;
  external:    boolean;
  externalData: DndStartData | null;
}

let _state: DragState | null = null;
let _marker: HTMLElement | null = null;

// A drag only starts once the pointer has moved past this many pixels — a plain
// click on a node must not spawn a drag helper.
const DRAG_THRESHOLD = 5;
interface PendingDrag { plugin: DndPlugin; node: JsTreeNode; x: number; y: number; }
let _pending: PendingDrag | null = null;

function _cleanupHelper(): void {
  _state?.helper?.remove();
  _marker?.remove();
  if (_state) {
    _state.helper = null;
    _state.dragging = false;
  }
  if (_state?.target) {
    _state.target.classList.remove('jstree-dnd-target');
  }
  _marker = null;
}

// ─── DnD Plugin ──────────────────────────────────────────────────────────────

class DndPlugin extends PluginBase {

  private get _opts(): DndOptions {
    const defaults: DndOptions = {
      copy:                false,
      open_timeout:        500,
      is_draggable:        true,
      check_while_dragging: true,
      always_copy:         false,
      inside_pos:          0,
      drag_selection:      true,
      touch:               true,
      large_drop_target:   false,
      large_drag_target:   false,
      use_html5:           false,
    };
    return { ...defaults, ...(this.opts as DndOptions) };
  }

  init(): void {
    this.tree.element.addEventListener('mousedown', this._onMouseDown, { passive: false });
    this.tree.element.addEventListener('touchstart', this._onTouchStart, { passive: false });

    // External vakata DnD
    this.tree.element.addEventListener('dnd_start.vakata', this._onExternalDndStart as EventListener);

    document.addEventListener('mousemove',  this._onMouseMove, { passive: false });
    document.addEventListener('mouseup',    this._onMouseUp);
    document.addEventListener('touchmove',  this._onTouchMove, { passive: false });
    document.addEventListener('touchend',   this._onTouchEnd);
  }

  destroy(): void {
    this.tree.element.removeEventListener('mousedown', this._onMouseDown);
    this.tree.element.removeEventListener('touchstart', this._onTouchStart);
    this.tree.element.removeEventListener('dnd_start.vakata', this._onExternalDndStart as EventListener);
    document.removeEventListener('mousemove',  this._onMouseMove);
    document.removeEventListener('mouseup',    this._onMouseUp);
    document.removeEventListener('touchmove',  this._onTouchMove);
    document.removeEventListener('touchend',   this._onTouchEnd);
    _cleanupHelper();
  }

  // ─── Mouse/Touch start ────────────────────────────────────────────────────

  private _onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    const node = this._getNodeFromEvent(e);
    if (!node) return;
    _pending = { plugin: this, node, x: e.clientX, y: e.clientY };
  };

  private _onTouchStart = (e: TouchEvent): void => {
    const touch = e.touches[0];
    if (!touch) return;
    const node = this._getNodeFromEvent(e);
    if (!node) return;
    _pending = { plugin: this, node, x: touch.clientX, y: touch.clientY };
  };

  /** Promote a pending press to a real drag once the pointer crosses the threshold. */
  private _maybeStartPending(x: number, y: number, e: MouseEvent | TouchEvent): void {
    if (!_pending || _pending.plugin !== this) return;
    const dx = x - _pending.x;
    const dy = y - _pending.y;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    const node = _pending.node;
    _pending = null;
    this._startDrag(e, node, x, y);
    this._moveDrag(x, y, e);
  }

  private _startDrag(e: MouseEvent | TouchEvent, node: JsTreeNode, x: number, y: number): void {
    const opts = this._opts;

    const isDraggable = typeof opts.is_draggable === 'function'
      ? opts.is_draggable([node], e as DragEvent)
      : (opts.is_draggable ?? true);

    if (!isDraggable) return;

    const nodes = opts.drag_selection && node.state.selected
      ? (this.tree.get_selected(true) as JsTreeNode[])
      : [node];

    const helper = this._createHelper(nodes);
    helper.style.left = `${x + 10}px`;
    helper.style.top  = `${y + 10}px`;
    document.body.appendChild(helper);

    _state = {
      dragging:    true,
      nodes,
      helper,
      target:      null,
      targetId:    null,
      targetPos:   'inside',
      sourceTree:  this.tree,
      external:    false,
      externalData: null,
    };

    this.tree.trigger('dnd_start', { nodes, event: e });
  }

  private _onExternalDndStart = (e: CustomEvent<{ data: DndStartData; element: HTMLElement; event: MouseEvent | TouchEvent }>): void => {
    const src = e.detail;
    const helper = src.element.cloneNode(true) as HTMLElement;
    helper.classList.add('jstree-dnd-helper');
    helper.style.position = 'fixed';
    helper.style.zIndex = '10001';
    document.body.appendChild(helper);

    const raw = src.event;
    const cx = raw instanceof MouseEvent ? raw.clientX : (raw as TouchEvent).touches[0]?.clientX ?? 0;
    const cy = raw instanceof MouseEvent ? raw.clientY : (raw as TouchEvent).touches[0]?.clientY ?? 0;

    helper.style.left = `${cx + 10}px`;
    helper.style.top  = `${cy + 10}px`;

    _state = {
      dragging:    true,
      nodes:       [],
      helper,
      target:      null,
      targetId:    null,
      targetPos:   'inside',
      sourceTree:  this.tree,
      external:    true,
      externalData: src.data,
    };
  };

  // ─── Mouse/Touch move ─────────────────────────────────────────────────────

  private _onMouseMove = (e: MouseEvent): void => {
    if (_state?.dragging) { this._moveDrag(e.clientX, e.clientY, e); return; }
    this._maybeStartPending(e.clientX, e.clientY, e);
  };

  private _onTouchMove = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (!t) return;
    if (_state?.dragging) { this._moveDrag(t.clientX, t.clientY, e); return; }
    this._maybeStartPending(t.clientX, t.clientY, e);
  };

  private _moveDrag(x: number, y: number, e: MouseEvent | TouchEvent): void {
    if (!_state?.helper) return;
    _state.helper.style.left = `${x + 10}px`;
    _state.helper.style.top  = `${y + 10}px`;

    const drop = this._findDropTarget(x, y);
    if (_state.target && _state.target !== drop?.el) {
      _state.target.classList.remove('jstree-dnd-target');
    }

    if (drop) {
      _state.target  = drop.el;
      _state.targetId = drop.id;
      _state.targetPos = drop.pos;
      drop.el.classList.add('jstree-dnd-target');
      this._positionMarker(drop.el, drop.pos);
    } else {
      _state.target  = null;
      _state.targetId = null;
      _marker?.remove();
    }

    this.tree.trigger('dnd_move', { nodes: _state.nodes, target: _state.targetId, position: _state.targetPos, event: e });
  }

  private _findDropTarget(x: number, y: number): { el: HTMLLIElement; id: string; pos: 'before' | 'inside' | 'after' } | null {
    const elUnder = document.elementFromPoint(x, y);
    if (!elUnder) return null;

    const li = (elUnder as HTMLElement).closest<HTMLLIElement>('li.jstree-node');
    if (!li) return null;

    const id = li.dataset['id'];
    if (!id) return null;

    const rect   = li.getBoundingClientRect();
    const relY   = y - rect.top;
    const third  = rect.height / 3;

    let pos: 'before' | 'inside' | 'after';
    if (relY < third)           pos = 'before';
    else if (relY > third * 2)  pos = 'after';
    else                         pos = 'inside';

    return { el: li, id, pos };
  }

  private _positionMarker(li: HTMLLIElement, pos: 'before' | 'inside' | 'after'): void {
    if (pos === 'inside') { _marker?.remove(); return; }

    if (!_marker) {
      _marker = document.createElement('div');
      _marker.classList.add('jstree-drop-marker');
      document.body.appendChild(_marker);
    }

    const rect = li.getBoundingClientRect();
    _marker.style.top    = `${(pos === 'before' ? rect.top : rect.bottom) + window.scrollY}px`;
    _marker.style.left   = `${rect.left + window.scrollX}px`;
    _marker.style.width  = `${rect.width}px`;
  }

  // ─── Mouse/Touch end ──────────────────────────────────────────────────────

  private _onMouseUp = (e: MouseEvent): void => {
    _pending = null;
    if (!_state?.dragging) return;
    this._endDrag(e);
  };

  private _onTouchEnd = (e: TouchEvent): void => {
    _pending = null;
    if (!_state?.dragging) return;
    this._endDrag(e);
  };

  private _endDrag(e: MouseEvent | TouchEvent): void {
    if (!_state) return;

    const { nodes, targetId, targetPos, external, externalData } = _state;
    _cleanupHelper();

    if (!targetId) {
      this.tree.trigger('dnd_cancel', { nodes, event: e });
      _state = null;
      return;
    }

    if (external && externalData) {
      this.tree.trigger('dnd_drop', {
        nodes:    [],
        target:   targetId,
        position: targetPos,
        external: true,
        data:     externalData,
        event:    e,
      });
    } else if (nodes.length > 0) {
      for (const node of nodes) {
        if (targetPos === 'inside') {
          this.tree.move_node(node.id, targetId, this._opts.inside_pos ?? 0);
        } else {
          const targetNode = this.tree.get_node(targetId);
          if (targetNode) {
            const parentId   = targetNode.parent;
            const parentNode = this.tree.get_node(parentId);
            let idx = parentNode ? parentNode.children.indexOf(targetId) : 0;
            if (idx < 0) idx = 0;
            if (targetPos === 'after') idx += 1;
            this.tree.move_node(node.id, parentId, idx);
          }
        }
      }
    }

    this.tree.trigger('dnd_stop', { nodes, target: targetId, position: targetPos, event: e });
    _state = null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _getNodeFromEvent(e: MouseEvent | TouchEvent): JsTreeNode | null {
    const target = e.target as HTMLElement;
    const anchor = this._opts.large_drag_target
      ? target.closest<HTMLElement>('li.jstree-node')
      : target.closest<HTMLElement>('.jstree-anchor');
    if (!anchor) return null;
    const li = anchor.closest<HTMLElement>('li.jstree-node');
    const id = li?.dataset['id'];
    if (!id) return null;
    const node = this.tree.get_node(id);
    return node || null;
  }

  private _createHelper(nodes: JsTreeNode[]): HTMLElement {
    const div = document.createElement('div');
    div.classList.add('jstree-dnd-helper');
    const label = nodes.length === 1
      ? nodes[0]?.text ?? ''
      : `${nodes.length} nodes`;
    div.textContent = label;
    return div;
  }
}

registerPlugin('dnd', DndPlugin);
export { DndPlugin };
