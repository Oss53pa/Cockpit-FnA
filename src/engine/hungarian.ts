/**
 * Algorithme Hungarian (Kuhn-Munkres) pour résolution optimale du problème
 * d'assignment.
 *
 * Cas d'usage Cockpit FnA : assigner N lignes du fichier GL Tiers à M écritures
 * du GL (N et M typiquement petits, regroupés par même date+montants). Le score
 * de chaque (tier_i, gl_j) est calculé en amont (cf. importer.ts scoreCandidate).
 *
 * Le greedy "first-match-wins" est sous-optimal : si la ligne 1 a deux candidats
 * (A=100, B=80) et la ligne 2 a un seul candidat (A=90), le greedy donne A à 1
 * et rien à 2 (total 100). Hungarian donne B à 1 et A à 2 (total 80+90 = 170).
 *
 * Implémentation : O(n³) où n = max(rows, cols). Acceptable pour les groupes
 * typiques (1-20 candidats). Pour de plus gros groupes, on tronquerait à un
 * sous-ensemble des meilleurs candidats.
 *
 * Signature : retourne un tableau `assignments[i]` = j (l'indice de la colonne
 * assignée à la ligne i), ou -1 si pas d'assignment (ligne non couverte).
 *
 * On accepte des MATRICES DE SCORE (plus élevé = mieux). En interne on convertit
 * en coût (Hungarian minimise).
 */

/**
 * Hungarian (maximisation de score). Cellules à -Infinity = interdit.
 *
 * @param scores matrice [rows][cols], scores positifs (-Infinity = pas valide)
 * @returns assignments[i] = j (-1 si i n'a pas d'assignment)
 */
export function hungarianMaximize(scores: number[][]): number[] {
  const n = scores.length;
  if (n === 0) return [];
  const m = scores[0]?.length ?? 0;
  if (m === 0) return Array(n).fill(-1);

  // Carréifier : padding lignes ou colonnes avec coût "neutre" élevé.
  const size = Math.max(n, m);
  const FINITE_MIN = -1e9; // assez bas pour ne jamais être choisi mais pas Infinity
  // Coût = -score. Cellules interdites = +Infinity (jamais sélectionnées).
  const cost: number[][] = [];
  let maxScore = 0;
  for (let i = 0; i < size; i++) {
    cost.push([]);
    for (let j = 0; j < size; j++) {
      const sc = (i < n && j < m) ? scores[i][j] : 0;
      if (!isFinite(sc) || sc <= FINITE_MIN) {
        cost[i].push(Number.POSITIVE_INFINITY);
      } else {
        cost[i].push(-sc);
        if (sc > maxScore) maxScore = sc;
      }
    }
  }

  // Implémentation Kuhn-Munkres (potentials u, v, slack)
  const u = new Array(size + 1).fill(0);
  const v = new Array(size + 1).fill(0);
  const p = new Array(size + 1).fill(0); // p[j] = ligne assignée à col j
  const way = new Array(size + 1).fill(0);

  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(size + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array(size + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Number.POSITIVE_INFINITY;
      let j1 = -1;
      for (let j = 1; j <= size; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      if (j1 === -1) break;
      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  // Reconstruire assignments[i] = j
  const assignments = new Array(n).fill(-1);
  for (let j = 1; j <= size; j++) {
    const i = p[j];
    if (i >= 1 && i <= n && j <= m) {
      // Vérifier que la cellule n'était pas interdite (score valide)
      if (cost[i - 1][j - 1] !== Number.POSITIVE_INFINITY) {
        assignments[i - 1] = j - 1;
      }
    }
  }
  return assignments;
}
