import { PluginBase, registerPlugin } from '../../core/JsTree';

class WholerowPlugin extends PluginBase {
  init(): void {
    this.tree.element.classList.add('jstree-wholerow-ul');
    this.tree.element.addEventListener('redraw.jstree', () => this._decorateAll());
    this.tree.element.addEventListener('ready.jstree',  () => this._decorateAll());
    // La bande doit SUIVRE la sélection, pas seulement naître avec le nœud :
    // sans ces deux écoutes, elle gardait l'état du premier rendu et le nœud
    // ouvert restait indiscernable des autres.
    this.tree.element.addEventListener('changed.jstree',      () => this._decorateAll());
    this.tree.element.addEventListener('deselect_all.jstree', () => this._decorateAll());

    // Hover via delegation
    this.tree.element.addEventListener('mouseover', this._onMouseOver);
    this.tree.element.addEventListener('mouseout',  this._onMouseOut);
  }

  destroy(): void {
    this.tree.element.classList.remove('jstree-wholerow-ul');
    this.tree.element.removeEventListener('mouseover', this._onMouseOver);
    this.tree.element.removeEventListener('mouseout',  this._onMouseOut);
  }

  private _onMouseOver = (e: MouseEvent): void => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li.jstree-node');
    if (!li) return;
    li.querySelector<HTMLElement>('.jstree-wholerow')?.classList.add('jstree-wholerow-hovered');
  };

  private _onMouseOut = (e: MouseEvent): void => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li.jstree-node');
    if (!li) return;
    li.querySelector<HTMLElement>('.jstree-wholerow')?.classList.remove('jstree-wholerow-hovered');
  };

  // called from JsTree._pluginHook('redraw_node')
  redraw_node(li: HTMLLIElement, _node: unknown): void {
    this._decorateNode(li);
  }

  private _decorateAll(): void {
    for (const li of this.tree.element.querySelectorAll<HTMLLIElement>('li.jstree-node')) {
      this._decorateNode(li);
    }
  }

  private _decorateNode(li: HTMLLIElement): void {
    let wr = li.querySelector<HTMLElement>(':scope > .jstree-wholerow');
    if (!wr) {
      wr = document.createElement('i');
      wr.classList.add('jstree-icon', 'jstree-wholerow');
      wr.setAttribute('role', 'presentation');
      li.insertBefore(wr, li.firstChild);
    }
    // L'état sélectionné vit sur l'ANCRE (.jstree-anchor.jstree-clicked), pas
    // sur le <li> : le test portait sur le mauvais élément et n'était donc
    // jamais vrai. Et la synchronisation se fait à CHAQUE passage, y compris
    // sur une bande déjà présente — sinon elle fige l'état initial.
    const clique = li
      .querySelector<HTMLElement>(':scope > .jstree-anchor')
      ?.classList.contains('jstree-clicked') ?? false;
    wr.classList.toggle('jstree-wholerow-clicked', clique);
  }
}

registerPlugin('wholerow', WholerowPlugin);
export { WholerowPlugin };
