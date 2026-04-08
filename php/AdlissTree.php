<?php
/**
 * AdlissTree — helper PHP pour générer des données JSON compatibles @synapxlab/jstree.
 *
 * Format attendu par le client JS (flat array) :
 *   [{ id, text, parent, icon?, state?, type?, data? }, ...]
 *
 * ---
 * Ce helper est conçu pour s'intégrer avec App\Shared\Folder (app/Shared/Folder.php),
 * la classe Adliss qui gère les arborescences de dossiers via le modèle Nested Set
 * (colonnes nfm_bg / nfm_bd). La méthode Folder::get_folders() retourne déjà
 * le format plat attendu par jstree — fromAdlissFolder() l'enveloppe directement.
 *
 * Cas d'usage principaux :
 *
 *   // 1. Depuis App\Shared\Folder (Nested Set Adliss) — cas le plus courant
 *   AdlissTree::fromAdlissFolder(\App\Model\Ged\Folder::class, $entity_id)
 *       ->sendJson();
 *
 *   // 2. Depuis un résultat App::getDb()->prepare() quelconque
 *   AdlissTree::fromAdlissQuery($rows, 'id', 'text', 'parent')
 *       ->sendJson();
 *
 *   // 3. Depuis une requête PDO directe (hors Adliss)
 *   (new AdlissTree($pdo))->fromTable('folder', 'id', 'name', 'parent_id')->toJson();
 */

namespace Synapxlab\JsTree;

class AdlissTree
{
    /** @var array<int, array<string,mixed>> */
    private array $nodes = [];

    // ─── Constructeurs ────────────────────────────────────────────────────────

    public function __construct(private ?\PDO $pdo = null) {}

    /**
     * Construit l'arbre depuis une table SQL.
     *
     * @param string      $table      Nom de la table
     * @param string      $idCol      Colonne id
     * @param string      $textCol    Colonne libellé
     * @param string      $parentCol  Colonne parent_id (NULL = racine)
     * @param string|null $iconCol    Colonne icône CSS (optionnel)
     * @param string|null $typeCol    Colonne type (optionnel)
     * @param array<string,mixed> $where  Conditions supplémentaires ['col' => val]
     */
    public function fromTable(
        string $table,
        string $idCol      = 'id',
        string $textCol    = 'name',
        string $parentCol  = 'parent_id',
        ?string $iconCol   = null,
        ?string $typeCol   = null,
        array  $where      = [],
    ): static {
        if (!$this->pdo) {
            throw new \RuntimeException('AdlissTree: PDO instance required for fromTable()');
        }

        $conditions = ['1=1'];
        $params     = [];
        foreach ($where as $col => $val) {
            $conditions[] = "`{$col}` = :{$col}";
            $params[":{$col}"] = $val;
        }

        $sql = "SELECT * FROM `{$table}` WHERE " . implode(' AND ', $conditions) . " ORDER BY `{$textCol}`";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        foreach ($rows as $row) {
            $node = [
                'id'     => (string) $row[$idCol],
                'text'   => (string) $row[$textCol],
                'parent' => $row[$parentCol] !== null ? (string) $row[$parentCol] : '#',
            ];
            if ($iconCol && isset($row[$iconCol]) && $row[$iconCol] !== null) {
                $node['icon'] = (string) $row[$iconCol];
            }
            if ($typeCol && isset($row[$typeCol])) {
                $node['type'] = (string) $row[$typeCol];
            }
            // Pass all extra columns under 'data'
            $extra = array_diff_key($row, array_flip([$idCol, $textCol, $parentCol]));
            if (!empty($extra)) {
                $node['data'] = $extra;
            }
            $this->nodes[] = $node;
        }

        return $this;
    }

    /**
     * Construit l'arbre depuis un tableau PHP.
     * Chaque entrée doit avoir au minimum 'id', 'text', 'parent'.
     *
     * @param array<int, array<string,mixed>> $rows
     */
    public static function fromArray(array $rows): static {
        $instance = new static();
        $instance->nodes = array_values($rows);
        return $instance;
    }

    /**
     * Ajoute un nœud manuellement.
     *
     * @param array<string,mixed> $node
     */
    public function addNode(array $node): static {
        if (!isset($node['id'], $node['text'])) {
            throw new \InvalidArgumentException('AdlissTree::addNode() — champs requis : id, text');
        }
        $node['parent'] ??= '#';
        $this->nodes[]   = $node;
        return $this;
    }

    // ─── Helpers de transformation ───────────────────────────────────────────

    /**
     * Convertit les ids et parent_ids en string (requis par jstree).
     */
    public function normalizeIds(): static {
        foreach ($this->nodes as &$n) {
            $n['id']     = (string) $n['id'];
            $n['parent'] = isset($n['parent']) && $n['parent'] !== null && $n['parent'] !== ''
                ? (string) $n['parent']
                : '#';
        }
        unset($n);
        return $this;
    }

    /**
     * Filtre les nœuds dont le parent n'existe pas (orphelins).
     * Utile pour les arborescences partielles.
     */
    public function removeOrphans(): static {
        $ids = array_column($this->nodes, 'id');
        $this->nodes = array_values(array_filter(
            $this->nodes,
            fn($n) => $n['parent'] === '#' || in_array($n['parent'], $ids, true),
        ));
        return $this;
    }

    /**
     * Trie les nœuds : parents avant enfants (utile pour rendu côté serveur).
     */
    public function sortByDepth(): static {
        $map      = array_column($this->nodes, null, 'id');
        $depths   = [];
        foreach ($this->nodes as $n) {
            $depths[$n['id']] = $this->_depth($n['id'], $map);
        }
        usort($this->nodes, fn($a, $b) => $depths[$a['id']] <=> $depths[$b['id']]);
        return $this;
    }

    private function _depth(string $id, array $map, int $d = 0): int {
        if ($d > 100) return $d; // guard against circular refs
        $n = $map[$id] ?? null;
        if (!$n || $n['parent'] === '#') return $d;
        return $this->_depth($n['parent'], $map, $d + 1);
    }

    // ─── Output ──────────────────────────────────────────────────────────────

    /**
     * Retourne le tableau PHP prêt pour json_encode.
     *
     * @return array<int, array<string,mixed>>
     */
    public function toArray(): array {
        return $this->nodes;
    }

    /**
     * Retourne la chaîne JSON (Content-Type: application/json attendu côté serveur).
     */
    public function toJson(int $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES): string {
        return json_encode($this->nodes, $flags) ?: '[]';
    }

    /**
     * Envoie directement la réponse JSON avec les headers appropriés.
     */
    public function sendJson(): never {
        header('Content-Type: application/json; charset=UTF-8');
        echo $this->toJson();
        exit;
    }

    // ─── Intégration Adliss ───────────────────────────────────────────────────

    /**
     * Intégration directe avec App\Shared\Folder (Nested Set Model Adliss).
     *
     * App\Shared\Folder utilise les colonnes nfm_bg (borne gauche) et nfm_bd (borne droite)
     * pour représenter l'arborescence sans récursion SQL. La méthode get_folders() retourne
     * déjà le format plat jstree (id, text, parent) trié par position NFM.
     *
     * Exemple — contrôleur GED :
     *   $json = AdlissTree::fromAdlissFolder(\App\Model\Ged\Folder::class, $entity_id)
     *               ->sendJson();
     *
     * Avec icône et état ouvert sur le nœud racine :
     *   $json = AdlissTree::fromAdlissFolder(
     *       \App\Model\Ged\Folder::class,
     *       $entity_id,
     *       null,           // $folder_id = null → charge depuis la racine
     *       fn($node, $row) => array_merge($node, [
     *           'icon'  => $row['parent'] === '#' ? 'jstree-folder' : 'jstree-file',
     *           'state' => ['opened' => $row['parent'] === '#'],
     *       ])
     *   )->sendJson();
     *
     * @param class-string $folderClass  Classe héritant de App\Shared\Folder
     * @param int          $entityId     Tenant Adliss
     * @param int|null     $folderId     Nœud racine du sous-arbre (null = racine globale)
     * @param callable|null $transform   Callback(?array $node, object $row): array — enrichissement
     */
    public static function fromAdlissFolder(
        string    $folderClass,
        int       $entityId,
        ?int      $folderId  = null,
        ?callable $transform = null,
    ): static {
        /** @var array<object> $rows */
        $rows = $folderClass::get_folders($entityId, $folderId);
        return static::fromAdlissQuery($rows, 'id', 'text', 'parent', $transform);
    }

    /**
     * Génère les nœuds depuis un résultat App::getDb()->prepare().
     *
     * Compatible avec les stdClass retournés par le PDO wrapper Adliss.
     * Les colonnes id, text, parent sont mappées directement — toutes les
     * autres colonnes sont passées dans 'data' pour usage côté JS.
     *
     * @param array<array<string,mixed>|object> $rows  Résultat de prepare()
     * @param string    $idCol      Colonne id (défaut : 'id')
     * @param string    $textCol    Colonne libellé (défaut : 'text')
     * @param string    $parentCol  Colonne parent_id — '#' si NULL (défaut : 'parent')
     * @param callable|null $transform  Callback(array $node, array $row): array
     */
    public static function fromAdlissQuery(
        array     $rows,
        string    $idCol     = 'id',
        string    $textCol   = 'text',
        string    $parentCol = 'parent',
        ?callable $transform = null,
    ): static {
        $instance = new static();
        foreach ($rows as $row) {
            // Adliss retourne des stdClass depuis prepare()
            if (is_object($row)) {
                $row = (array) $row;
            }
            $parentVal = $row[$parentCol] ?? null;
            $node = [
                'id'     => (string) $row[$idCol],
                'text'   => (string) $row[$textCol],
                'parent' => ($parentVal !== null && $parentVal !== '' && $parentVal !== '0' && $parentVal !== 0)
                    ? (string) $parentVal
                    : '#',
                'data'   => $row,
            ];
            if ($transform !== null) {
                $node = $transform($node, $row);
            }
            $instance->nodes[] = $node;
        }
        return $instance;
    }
}
