import { describe, it, expect } from 'vitest';
import { hungarianMaximize } from './hungarian';

describe('hungarianMaximize', () => {
  it('retourne un tableau vide si la matrice est vide', () => {
    expect(hungarianMaximize([])).toEqual([]);
  });

  it('retourne -1 partout si la 1re ligne est vide', () => {
    expect(hungarianMaximize([[]])).toEqual([-1]);
  });

  it('assigne le seul candidat valide', () => {
    expect(hungarianMaximize([[100]])).toEqual([0]);
  });

  it('1 ligne, 2 candidats : prend le meilleur score', () => {
    expect(hungarianMaximize([[50, 80]])).toEqual([1]);
  });

  it('2 lignes / 2 candidats : assignment optimal (greedy sub-optimal)', () => {
    // Greedy : ligne 1 prend score 100 (col 0), ligne 2 doit prendre col 1 (score 0) → total 100
    // Hungarian : ligne 1 prend col 1 (80), ligne 2 prend col 0 (90) → total 170
    const scores = [
      [100, 80],
      [90, 0],
    ];
    const r = hungarianMaximize(scores);
    expect(r).toEqual([1, 0]);
  });

  it('cellules interdites (-Infinity) : ignore les paires non valides', () => {
    const scores = [
      [Number.NEGATIVE_INFINITY, 80],
      [90, Number.NEGATIVE_INFINITY],
    ];
    const r = hungarianMaximize(scores);
    expect(r).toEqual([1, 0]);
  });

  it('plus de lignes que de candidats : certaines lignes ont -1', () => {
    const scores = [
      [100],
      [80],
      [60],
    ];
    const r = hungarianMaximize(scores);
    // Seule la meilleure ligne (100) doit prendre le candidat unique
    expect(r.filter((x) => x !== -1).length).toBe(1);
    expect(r[0]).toBe(0); // ligne avec score 100 prend col 0
  });

  it('plus de candidats que de lignes : pas de souci', () => {
    const scores = [[50, 80, 100]];
    expect(hungarianMaximize(scores)).toEqual([2]);
  });

  it('ligne entièrement -Infinity : exclue du problème, autres lignes optimisées', () => {
    // Ligne 0 = aucun candidat valide → assignment -1
    // Lignes 1 et 2 doivent toujours obtenir l'optimum 100+90 = 190
    const scores = [
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [100, 50],
      [70, 90],
    ];
    const r = hungarianMaximize(scores);
    expect(r[0]).toBe(-1);
    // Vérifier que les lignes 1 et 2 ont des assignments distincts et optimaux
    expect(r[1]).not.toBe(-1);
    expect(r[2]).not.toBe(-1);
    expect(r[1]).not.toBe(r[2]);
    const total = r.reduce((s, j, i) => (j === -1 ? s : s + scores[i][j]), 0);
    expect(total).toBe(190);
  });

  it('toutes les lignes interdites → tous -1, pas de crash', () => {
    const inf = Number.NEGATIVE_INFINITY;
    const r = hungarianMaximize([[inf, inf], [inf, inf]]);
    expect(r).toEqual([-1, -1]);
  });

  it('matrice 3x3 réaliste — vérifie assignment optimal', () => {
    // Cas Cockpit FnA : 3 lignes tiers, 3 GL candidats du même jour/montant.
    // Tiers 1 = client A — préfère GL X (score 100) ou Y (90)
    // Tiers 2 = client B — préfère GL Y (95)
    // Tiers 3 = client C — préfère GL X (85) ou Z (50)
    const scores = [
      [100, 90, 0],   // T1
      [60, 95, 0],    // T2
      [85, 0, 50],    // T3
    ];
    const r = hungarianMaximize(scores);
    // L'assignment optimal : T1→0 (100), T2→1 (95), T3→2 (50) = 245
    // Vérifions la propriété : chaque colonne assignée au plus une fois
    const cols = r.filter((x) => x !== -1);
    expect(new Set(cols).size).toBe(cols.length);
    // Et le total est ≥ greedy (greedy = 100+0+50=150 ou 100+95+50=245 selon ordre)
    const total = r.reduce((s, j, i) => (j === -1 ? s : s + scores[i][j]), 0);
    expect(total).toBeGreaterThanOrEqual(245);
  });
});
