import { PluginBase, registerPlugin } from '../../core/JsTree';

class WholerowPlugin extends PluginBase {
  init(): void {
    this.tree.element.classList.add('jstree-wholerow-ul');
    this.tree.element.addEventListener('redraw.jstree', () => this._decorateAll());
    this.tree.element.addEventListener('ready.jstree',  () => this._decorateAll());

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
    if (li.querySelector(':scope > .jstree-wholerow')) return;
    const wr = document.createElement('i');
    wr.classList.add('jstree-icon', 'jstree-wholerow');
    wr.setAttribute('role', 'presentation');
    li.insertBefore(wr, li.firstChild);
    if (li.classList.contains('jstree-clicked')) {
      wr.classList.add('jstree-wholerow-clicked');
    }
  }
}

registerPlugin('wholerow', WholerowPlugin);
export { WholerowPlugin };
