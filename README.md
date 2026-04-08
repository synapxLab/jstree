# @synapxlab/jstree

**EN** · [FR](#fr)

---

## EN

A complete tree component rewritten in **TypeScript** with **zero runtime dependencies**.  
Inspired by the battle-tested jsTree ecosystem — redesigned with modern ES2020, Vite lib build, and a clean class-based API.

### Features

- Flat or nested JSON data model
- AJAX lazy loading
- Multiple selection (Ctrl+click)
- Inline rename (`edit()`)
- Create / rename / delete / move nodes
- Events as native `CustomEvent` on the container element
- TypeScript strict, ES2020 target

### Plugins

| Plugin | Description |
|--------|-------------|
| `wholerow` | Full-row hover and click |
| `search` | Search with fuzzy, case-sensitive, show-only-matches modes |
| `state` | Persist open/selected state to `localStorage` |
| `types` | Per-type icons, `li_attr`, `a_attr` |
| `checkbox` | Three-state checkboxes with up/down cascade |
| `contextmenu` | Right-click context menu (custom or default items) |
| `dnd` | Drag & drop (internal moves + external drag source via `JsTree.vakata.dnd.start()`) |

### PHP helper

`php/AdlissTree.php` — server-side helper to generate jstree-compatible JSON:

```php
// From a PDO table
$tree = (new AdlissTree($pdo))
    ->fromTable('folder', 'id', 'name', 'parent_id')
    ->toJson();

// From Adliss App::getDb()->prepare() results
$tree = AdlissTree::fromAdlissQuery($rows, 'id', 'name', 'parent_id')
    ->sendJson(); // sends JSON response + exit
```

### Install

```bash
npm install @synapxlab/jstree
# or local reference
npm install file:../@synapxlab/jstree
```

### Usage

```typescript
import { JsTree } from '@synapxlab/jstree';
import '@synapxlab/jstree/style';

const tree = new JsTree('#my-tree', {
  plugins: ['wholerow', 'contextmenu', 'dnd', 'search', 'state'],
  core: {
    multiple: true,
    check_callback: true,
    data: [
      { id: '1', text: 'Root',      parent: '#', state: { opened: true } },
      { id: '2', text: 'Documents', parent: '1' },
      { id: '3', text: 'report.pdf', parent: '2' },
    ],
  },
  state: { key: 'my_tree_state' },
});

// API
tree.open_node('2');
tree.select_node('3');
tree.get_selected();            // ['3']
tree.get_path('3', ' / ');      // 'Root / Documents / report.pdf'
tree.create_node('2', { text: 'New file' });
tree.edit('3');                 // inline rename
tree.delete_node('3');
tree.move_node('3', '1');

// Events (native CustomEvent)
tree.element.addEventListener('select_node.jstree', (e) => {
  console.log(e.detail.node);
});

// Reference instance from any inner element
const inst = JsTree.reference(someChildElement);

// External drag source (e.g. file from a list)
JsTree.vakata.dnd.start(mouseEvent, { ged_id: 42 }, helperElement);
// then listen to dnd_drop.jstree on the tree element
```

### Build

```bash
npm run build:lib   # produces dist/jstree.es.js + dist/jstree.umd.cjs + dist/style.css
npm run dev         # Vite dev server (demo at index.html)
```

### Styling

Override SCSS variables before importing:

```scss
$jst-selected-bg:  #d4edda;
$jst-indent:       28px;
$jst-font-size:    14px;
@use '@synapxlab/jstree/src/core/JsTree.scss';
```

---

## FR

Un composant arbre réécrit en **TypeScript**, **zéro dépendance** à l'exécution.  
Inspiré de l'écosystème jsTree — redessiné avec ES2020 moderne, build Vite lib, et une API orientée classe.

### Fonctionnalités

- Modèle de données plat ou imbriqué (JSON)
- Chargement AJAX (lazy)
- Sélection multiple (Ctrl+clic)
- Renommage inline (`edit()`)
- Créer / renommer / supprimer / déplacer des nœuds
- Événements natifs `CustomEvent` sur l'élément conteneur
- TypeScript strict, cible ES2020

### Plugins

| Plugin | Description |
|--------|-------------|
| `wholerow` | Survol et clic sur toute la ligne |
| `search` | Recherche (fuzzy, case-sensitive, show-only-matches) |
| `state` | Persistance open/selected dans `localStorage` |
| `types` | Icônes par type, `li_attr`, `a_attr` |
| `checkbox` | Cases à cocher three-state avec cascade haut/bas |
| `contextmenu` | Menu contextuel clic droit (items custom ou défaut) |
| `dnd` | Glisser-déposer (déplacements internes + source externe via `JsTree.vakata.dnd.start()`) |

### Helper PHP

`php/AdlissTree.php` — génère du JSON compatible jstree côté serveur :

```php
// Depuis une table PDO
$tree = (new AdlissTree($pdo))
    ->fromTable('folder', 'id', 'name', 'parent_id')
    ->toJson();

// Depuis App::getDb()->prepare() d'Adliss
$tree = AdlissTree::fromAdlissQuery($rows, 'id', 'name', 'parent_id')
    ->sendJson(); // envoie la réponse JSON + exit
```

### Installation

```bash
npm install @synapxlab/jstree
# ou référence locale
npm install file:../@synapxlab/jstree
```

### Utilisation

```typescript
import { JsTree } from '@synapxlab/jstree';
import '@synapxlab/jstree/style';

const tree = new JsTree('#mon-arbre', {
  plugins: ['wholerow', 'contextmenu', 'dnd', 'search', 'state'],
  core: {
    multiple: true,
    check_callback: true,
    data: 'https://api.example.com/tree', // URL AJAX ou tableau inline
  },
  state: { key: 'ma_cle_state' },
});
```

### Build

```bash
npm run build:lib   # produit dist/jstree.es.js + dist/jstree.umd.cjs + dist/style.css
npm run dev         # serveur Vite dev (démo index.html)
```

---

## Acknowledgements / Remerciements

Cette bibliothèque a été conçue en s'appuyant sur les sources des projets suivants,  
conservés dans `mit/` à titre de référence. Aucun code n'est copié — ils ont guidé  
les décisions d'API, de comportement des plugins et du helper PHP.

> This library was designed with reference to the following open-source projects,  
> kept in `mit/` for study. No code was copied — they informed API decisions,  
> plugin behaviour, and the PHP helper design.

---

### [jsTree](https://www.jstree.com) — `mit/jstree/`

> jQuery tree plugin — v3.3.17  
> © Ivan Bozhanov (vakata) — [vakata.com](http://vakata.com)  
> License : MIT — [github.com/vakata/jstree](https://github.com/vakata/jstree)

L'original. Architecture des plugins, modèle de données plat (`id / parent / children_d`),
noms des événements (`select_node.jstree`, `move_node.jstree`, …), API publique (`open_node`, `get_path`, `edit`…)
et thème CSS `default` ont servi de référence directe.

The original. Plugin architecture, flat data model (`id / parent / children_d`),
event names (`select_node.jstree`, `move_node.jstree`, …), public API (`open_node`, `get_path`, `edit`…)
and the `default` CSS theme were direct references.

---

### [jstree-grid](https://github.com/deitch/jstree-grid) — `mit/jstree-grid/`

> Grid columns plugin for jsTree — v3.10.2  
> © Avi Deitcher — [github.com/deitch](https://github.com/deitch)  
> License : MIT

Plugin d'extension de colonnes. Analysé pour comprendre le pattern d'extension
du rendu DOM des nœuds (`redraw_node` hook). Non intégré dans cette version —
prévu pour une future release.

Column grid extension plugin. Studied to understand the node DOM decoration pattern
(`redraw_node` hook). Not integrated in this release — planned for a future version.

---

### [jstree-php-demos](https://github.com/vakata/jstree-php-demos) — `mit/jstree-php-demos/`

> PHP demos for jsTree (filebrowser, sitebrowser)  
> © Ivan Bozhanov (vakata)  
> License : MIT

Les classes `class.tree.php` et `class.db.php` ont servi d'inspiration pour
`php/AdlissTree.php` — notamment la génération du format JSON attendu par le client
et la gestion de l'arbre à partir d'une base de données relationnelle.

The `class.tree.php` and `class.db.php` classes inspired `php/AdlissTree.php` —
in particular the JSON output format expected by the client and the tree-from-relational-DB approach.

---

### [VanillaTree](https://github.com/ph1p/vanillatree) — `mit/vanillatree/`

> Standalone tree view library — v0.0.3  
> © Andrey Gubanov  
> License : MIT

Référence de la direction "sans jQuery" — a confirmé qu'un arbre DOM vanilla
sans framework est viable. L'approche de rendu (création d'éléments DOM directs
plutôt que manipulation de chaînes HTML) s'en est inspirée.

A "no jQuery" direction reference — confirmed that a vanilla DOM tree without
a framework is viable. The rendering approach (direct DOM element creation
rather than HTML string manipulation) was influenced by it.

---

## License

MIT — © synapxLab
