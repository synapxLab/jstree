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

/**
 * Classe posée sur <body> le temps d'un drag. Elle coupe la sélection de texte,
 * qui sinon surligne toutes les lignes survolées et transforme le glissé en
 * sélection : le pointeur traîne un helper pendant que le navigateur, lui,
 * croit qu'on surligne un paragraphe. Posée au drag et retirée après, pour que
 * les libellés restent copiables le reste du temps.
 */
const DRAG_BODY_CLASS = 'jstree-dragging';

/** Bande, en pixels, où le pointeur déclenche le défilement pendant un drag. */
const AUTOSCROLL_MARGE = 60;
/** Hauteur, en pixels, des bandes « insérer entre deux frères » en bord de ligne. */
const BANDE_ENTRE_DEUX = 5;
/** Vitesse maximale du défilement, en pixels par image. */
const AUTOSCROLL_VITESSE = 18;

let _autoscroll: number | null = null;
/** Ligne actuellement marquée comme cible, pour la démarquer au survol suivant. */
let _derniereLigneCible: HTMLElement | null = null;

/**
 * Fait défiler tant que le pointeur reste au bord pendant un glissé.
 *
 * Sans cela, une cible située hors de l'écran est INATTEIGNABLE : le pointeur
 * sort de la zone visible, `elementFromPoint` ne renvoie plus rien, la cible est
 * perdue et le dépôt s'annule. Un arbre de 70 nœuds dépliés mesure deux fois la
 * hauteur d'écran — déplacer le haut vers le bas y était donc impossible.
 *
 * Le défilement porte sur le premier ancêtre réellement scrollable, et à défaut
 * sur la fenêtre : selon les écrans, l'arbre vit dans un panneau à ascenseur ou
 * s'étale dans la page.
 */
function _arreterAutoscroll(): void {
  if (_autoscroll !== null) { cancelAnimationFrame(_autoscroll); _autoscroll = null; }
}

function _conteneurScrollable(el: HTMLElement | null): HTMLElement | null {
  let e: HTMLElement | null = el;
  while (e && e !== document.body) {
    const cs = getComputedStyle(e);
    if (/auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight) return e;
    e = e.parentElement;
  }
  return null;
}

function _majAutoscroll(y: number, hote: HTMLElement | null): void {
  const boite = _conteneurScrollable(hote);
  const haut  = boite ? boite.getBoundingClientRect().top : 0;
  const bas   = boite ? boite.getBoundingClientRect().bottom : window.innerHeight;

  let pas = 0;
  if (y < haut + AUTOSCROLL_MARGE)     pas = -Math.ceil(((haut + AUTOSCROLL_MARGE - y) / AUTOSCROLL_MARGE) * AUTOSCROLL_VITESSE);
  else if (y > bas - AUTOSCROLL_MARGE) pas =  Math.ceil(((y - (bas - AUTOSCROLL_MARGE)) / AUTOSCROLL_MARGE) * AUTOSCROLL_VITESSE);

  if (pas === 0) { _arreterAutoscroll(); return; }
  if (_autoscroll !== null) return;   // une boucle tourne déjà

  const boucle = (): void => {
    if (!_state?.dragging) { _arreterAutoscroll(); return; }
    if (boite) boite.scrollTop += pas;
    else       window.scrollBy(0, pas);
    _autoscroll = requestAnimationFrame(boucle);
  };
  _autoscroll = requestAnimationFrame(boucle);
}

/**
 * Trace du glissé, muette par défaut. S'allume dans la console du navigateur :
 *
 *     window.JSTREE_DEBUG = true          // pour la session
 *     localStorage.JSTREE_DEBUG = '1'     // et au rechargement
 *
 * Le drag est un geste : quand il échoue, il ne reste rien à inspecter après
 * coup. Cette trace dit à quelle étape la chaîne s'est rompue — nœud empoigné,
 * seuil franchi, cible survolée, dépôt — sans avoir à rejouer le geste à
 * l'aveugle.
 */
function _log(etape: string, detail?: unknown): void {
  const w = window as unknown as { JSTREE_DEBUG?: boolean };
  const actif = w.JSTREE_DEBUG || (() => {
    try { return localStorage.getItem('JSTREE_DEBUG') === '1'; } catch { return false; }
  })();
  if (!actif) return;
  // eslint-disable-next-line no-console
  console.log(`[jstree/dnd] ${etape}`, detail ?? '');
}

function _cleanupHelper(): void {
  _arreterAutoscroll();
  if (_derniereLigneCible) {
    _derniereLigneCible.classList.remove('jstree-dnd-target');
    delete _derniereLigneCible.dataset['drop'];
    _derniereLigneCible = null;
  }
  document.body.classList.remove(DRAG_BODY_CLASS);
  _state?.helper?.remove();
  _marker?.remove();
  if (_state) {
    _state.helper = null;
    _state.dragging = false;
  }
  // La marque vit sur la LIGNE (cf. _derniereLigneCible ci-dessus), plus sur le
  // <li> : ce nettoyage-ci n'a plus d'objet.
  _marker?.remove();
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
      // `inside_only` — le dépôt ne connaît qu'une position : DANS le nœud
      // survolé. À activer quand l'ordre des frères ne se décide pas au geste :
      // un arbre trié à la lecture (alphabétique, par date…) reclassera de
      // toute façon, et laisser croire qu'on insère « entre deux » promet un
      // résultat que l'arbre ne tiendra pas.
      inside_only:         false,
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
    if (!node) { _log('mousedown ignoré (aucun nœud sous le pointeur)'); return; }
    _pending = { plugin: this, node, x: e.clientX, y: e.clientY };
    _log('mousedown', { id: node.id, texte: node.text, selectionne: node.state.selected });
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

    if (!isDraggable) { _log('drag REFUSÉ par is_draggable', { id: node.id }); return; }

    const nodes = opts.drag_selection && node.state.selected
      ? (this.tree.get_selected(true) as JsTreeNode[])
      : [node];

    // Le press qui précède a pu amorcer une sélection de texte : on la purge
    // avant de poser la garde, sinon le surlignage déjà commencé survit au drag.
    document.body.classList.add(DRAG_BODY_CLASS);
    window.getSelection()?.removeAllRanges();

    const helper = this._createHelper(nodes);
    helper.dataset['drop'] = 'aucune';   // tant qu'aucune cible n'est survolée
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

    _log('drag démarré', { nodes: nodes.map((n) => `${n.id}:${n.text}`), drag_selection: opts.drag_selection });
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

  /** Dernière cible tracée, pour ne pas noyer la console à chaque pixel. */
  private _derniereCibleTracee: string | null = null;

  private _moveDrag(x: number, y: number, e: MouseEvent | TouchEvent): void {
    if (!_state?.helper) return;
    _state.helper.style.left = `${x + 10}px`;
    _state.helper.style.top  = `${y + 10}px`;

    _majAutoscroll(y, this.tree.element as HTMLElement);

    const drop = this._findDropTarget(x, y);
    // La marque de cible se pose sur la LIGNE, jamais sur le <li> : encadrer le
    // <li> d'une branche dépliée entourait tout son sous-arbre, ce qui ne
    // désigne rien. Elle porte aussi la position, pour que « entrer dedans » et
    // « insérer entre » ne se ressemblent pas.
    if (_derniereLigneCible && _derniereLigneCible !== drop?.ligne) {
      _derniereLigneCible.classList.remove('jstree-dnd-target');
      delete _derniereLigneCible.dataset['drop'];
    }

    if (drop) {
      _state.target  = drop.el;
      _state.targetId = drop.id;
      _state.targetPos = drop.pos;
      drop.ligne.classList.add('jstree-dnd-target');
      drop.ligne.dataset['drop'] = drop.pos;
      _derniereLigneCible = drop.ligne;
      this._positionMarker(drop.ligne, drop.pos);
    } else {
      _state.target  = null;
      _state.targetId = null;
      _marker?.remove();
    }

    // Trace au CHANGEMENT de cible seulement : à chaque pixel, la console
    // deviendrait illisible et masquerait justement le moment où la cible se perd.
    // Picto d'intention porté par le helper, donc lu SOUS le curseur — là où
    // l'œil se trouve déjà. Il dit ce que le relâchement va faire : entrer dans
    // le nœud, se glisser entre deux frères, ou rien du tout. Sans lui, « before »
    // et « inside » se ressemblent à trois pixels près et le geste se joue au
    // hasard. Le style vit dans JsTree.scss (.jstree-dnd-helper[data-drop]).
    if (_state.helper) {
      _state.helper.dataset['drop'] = _state.targetId ? _state.targetPos : 'aucune';
    }

    const cle = _state.targetId ? `${_state.targetId}/${_state.targetPos}` : null;
    if (cle !== this._derniereCibleTracee) {
      this._derniereCibleTracee = cle;
      _log(cle ? 'cible' : 'cible PERDUE', cle ? { id: _state.targetId, position: _state.targetPos } : undefined);
    }

    this.tree.trigger('dnd_move', { nodes: _state.nodes, target: _state.targetId, position: _state.targetPos, event: e });
  }

  private _findDropTarget(x: number, y: number): { el: HTMLLIElement; ligne: HTMLElement; id: string; pos: 'before' | 'inside' | 'after' } | null {
    const elUnder = document.elementFromPoint(x, y);
    if (!elUnder) return null;

    const li = (elUnder as HTMLElement).closest<HTMLLIElement>('li.jstree-node');
    if (!li) return null;

    const id = li.dataset['id'];
    if (!id) return null;

    // Les trois zones se mesurent sur la LIGNE du nœud, pas sur le <li>.
    //
    // Un <li> ouvert contient toute sa descendance : sur une branche dépliée il
    // fait plusieurs centaines de pixels, et son tiers supérieur — la zone
    // « before » — recouvre à lui seul la ligne du parent. Déposer DANS un nœud
    // déplié était donc impossible : le geste rendait toujours « before », donc
    // un simple changement d'ordre entre frères, jamais un changement de parent.
    //
    // La ligne, c'est l'ancre (ou le wholerow qui la double). Sur une feuille,
    // ligne et <li> se confondent : rien ne change.
    const ligne  = li.querySelector<HTMLElement>(':scope > .jstree-anchor') ?? li;
    const rect   = ligne.getBoundingClientRect();
    const relY   = y - rect.top;

    // Sans positions relatives, toute la ligne est une cible « dedans » : les
    // bandes de bord n'ont plus lieu d'être, et la surface utile double.
    if (this._opts.inside_only) return { el: li, ligne, id, pos: 'inside' };

    // Bandes « entre deux » de hauteur FIXE, au lieu des tiers de l'original.
    // Sur une ligne de 24 px, trois tiers laissent 8 px pour viser l'intérieur
    // du nœud : la main tombe presque toujours entre deux frères. Une bande de
    // 5 px en haut et en bas laisse 14 px au cœur — la cible devient la branche,
    // et l'insertion entre frères redevient un geste délibéré, en bord de ligne.
    const bande = Math.min(BANDE_ENTRE_DEUX, rect.height / 3);

    let pos: 'before' | 'inside' | 'after';
    if (relY < bande)                    pos = 'before';
    else if (relY > rect.height - bande) pos = 'after';
    else                                  pos = 'inside';

    return { el: li, ligne, id, pos };
  }

  private _positionMarker(ligne: HTMLElement, pos: 'before' | 'inside' | 'after'): void {
    if (pos === 'inside') { _marker?.remove(); _marker = null; return; }

    if (!_marker) {
      _marker = document.createElement('div');
      _marker.classList.add('jstree-drop-marker');
      document.body.appendChild(_marker);
    }

    const rect = ligne.getBoundingClientRect();
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
    _log('relâché', { cible: targetId, position: targetPos, nœuds: nodes.map((n) => `${n.id}:${n.text}`), externe: external });

    if (!targetId) {
      _log('ANNULÉ — relâché hors d\'une cible valide');
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
        let fait = false;
        if (targetPos === 'inside') {
          fait = this.tree.move_node(node.id, targetId, this._opts.inside_pos ?? 0);
        } else {
          const targetNode = this.tree.get_node(targetId);
          if (targetNode) {
            const parentId   = targetNode.parent;
            const parentNode = this.tree.get_node(parentId);
            let idx = parentNode ? parentNode.children.indexOf(targetId) : 0;
            if (idx < 0) idx = 0;
            if (targetPos === 'after') idx += 1;
            fait = this.tree.move_node(node.id, parentId, idx);
          }
        }
        // Un refus de move_node ne laissait AUCUNE trace : le picto annonçait le
        // dépôt, la main lâchait, et l'arbre restait immobile sans explication.
        // jsTree d'origine enregistrait la raison dans `last_error` ; ici on la
        // journalise et on la publie, à charge de l'écran d'en avertir l'usager.
        if (!fait) {
          _log('dépôt REFUSÉ par move_node', { nœud: node.id, cible: targetId, position: targetPos });
          this.tree.trigger('dnd_refused', { node, target: targetId, position: targetPos });
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
