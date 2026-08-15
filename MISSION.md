# Mission `@synapxlab/jstree`

> Dernière mise à jour : 2026-05-14

## Objectif

Bibliothèque arborescente **MIT, JS-only, zero-dependency**, remplaçante directe
de `jstree` (jQuery, MIT) + `jstree-grid` + helpers `$.vakata.*` utilisés dans
Adliss.

**Pas de PHP. Pas de DB.** Le projet est strictement front-end / TypeScript.
Le serveur (n'importe lequel) renvoie du JSON — la lib le rend.

## Périmètre

### IN
- Core arbre (rendu, sélection, expand/collapse, ARIA)
- Inline edit (rename / create) via `contenteditable`
- Plugins : `wholerow`, `search`, `state`, `types`, `checkbox`, `contextmenu`, `dnd`, **`grid`**
- DnD interne (réordonnancement) **et** externe (drag depuis un autre DOM,
  ex. ligne DataTable → dossier) via shim `JsTree.vakata.dnd.start(e, data, html)`
- Custom events natifs (`<event>.jstree` sur le container)
- Build dual ESM + UMD via Vite, types `.d.ts`

### OUT
- ❌ Code PHP (helper serveur, classes, traits) — supprimé
- ❌ Schéma DB / Nested Set Model — hors scope
- ❌ Adapters framework (React/Vue/Angular) — peut-être plus tard
- ❌ i18n — laissé au consommateur (chaînes via options)

## État au 2026-05-14

| Bloc | LOC | État |
|---|--:|---|
| `core/JsTree.ts` | 927 | ✅ |
| `core/JsTree.scss` | 301 | ✅ |
| `core/JsTree.types.ts` | 207 | ✅ |
| `plugins/wholerow` | 56 | ✅ |
| `plugins/search` | 127 | ✅ |
| `plugins/state` | 73 | ✅ |
| `plugins/types` | 71 | ✅ |
| `plugins/checkbox` | 154 | ✅ |
| `plugins/contextmenu` | 204 | ✅ |
| `plugins/dnd` | 320 | ✅ inclut shim `JsTree.vakata.dnd.start` |
| `plugins/grid` | — | ❌ **à porter** |
| Démo `index.html` | — | partielle (sans grid) |
| Build dist | — | ✅ ESM + UMD + .d.ts + style.css |
| Tag git / npm publish | — | ❌ |

## Ce qui reste à faire

### 1. Nettoyage JS-only (priorité haute, ~30 min)
- [ ] Supprimer `php/AdlissTree.php`
- [ ] Supprimer le dossier `php/` complet
- [ ] Retirer `"php"` de `package.json:files`
- [ ] Réécrire la section "PHP helper" du `README.md` → exemple **fetch JSON
      générique** côté serveur de l'utilisateur
- [ ] Supprimer `mit/jstree-php-demos/` (référence non utilisée)

### 2. Plugin `grid` (vue tableau) — priorité haute, ~3-4 jours
Port de `mit/jstree-grid/jstreegrid.js` (1377 LOC jQuery, MIT, **non maintenu
upstream**) vers `src/plugins/grid/Grid.ts` en TS zero-dep.

API cible :
```ts
new JsTree(el, {
  plugins: ['grid', 'dnd', 'contextmenu'],
  grid: {
    columns: [
      { header: 'Nom',    width: 'auto', value: 'text' },
      { header: 'Taille', width: 80,     value: 'data.size', align: 'right' },
      { header: 'Auteur', width: 120,    value: 'data.author', editable: true },
    ],
    resizable: true,
    stateful:  true,   // persiste largeurs via plugin state
  },
});
```

Sous-tâches :
- [ ] Layout : header sticky + body, sync horizontal scroll
- [ ] Rendu colonnes avec accesseur `value` (dot-path : `data.size`)
- [ ] Resize handles (mouse + touch via pointer events)
- [ ] Inline edit cellule (Enter/Esc/blur)
- [ ] Tri colonne au clic header (intègre plugin `types` pour ordre stable)
- [ ] Custom events : `select_cell.jstree`, `update_cell.jstree`, `loaded_grid.jstree`
- [ ] Intégration DnD : drag de la ligne entière (pas juste le label)
- [ ] Persistence largeurs colonnes via plugin `state`
- [ ] SCSS dans `core/JsTree.scss` (mêmes thèmes que l'arbre)
- [ ] Démo dans `index.html`

### 3. Sortie & versionning (~30 min)
- [ ] Bump `package.json` → `1.1.0` quand grid est livré
- [ ] Tag git `v1.1.0`
- [ ] `npm run build:lib` + commit du `dist/`
- [ ] (Optionnel) `npm publish --access public`

## Hors scope explicite (rappel)

Demande utilisateur 2026-05-14 :
> "MIT pour JS mais sans PHP ny database"

Toute future contribution doit refuser :
- L'ajout de code PHP ou de helpers serveur dans ce repo
- L'ajout d'un schéma DB ou de migrations
- L'ajout d'un adapter framework (React/Vue) dans ce repo — créer un sous-package
  séparé si besoin

## Migration Adliss (projet séparé, hors de ce repo)

La consommation par Adliss (`/data/vhosts/adliss.fr/`) est un **chantier distinct** :
- Remplacer `httpdocs/assets/vendor/jstree/dist/jstree.min.js` par
  `@synapxlab/jstree/dist/jstree.umd.cjs`
- Ordre suggéré : Wms → Shop (Vendor/Class_Folder) → GED (DnD cross-DataTable)
- Cible : voir audit jstree dans la conversation du 2026-05-14
