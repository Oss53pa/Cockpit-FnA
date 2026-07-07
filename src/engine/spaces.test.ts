import { describe, it, expect } from 'vitest';
import {
  computeConvergenceBp, canResolve, canTransition, nextStatuses, isFrozen,
  requiredRolesFor, nextDecisionRef, isOverdue,
} from './spaces';

describe('Espace Collaboratif — moteur', () => {
  describe('convergence (points de base, jamais saisie)', () => {
    it('formule GL : 10000 − (restant × 10000 / initial), division entière', () => {
      // Scénario de référence : écart initial 14 120 000, restant 2 400 400 → 83 %.
      const bp = computeConvergenceBp({ initialGapXof: 14_120_000 }, [], 2_400_400);
      expect(bp).toBe(10000 - Math.trunc((2_400_400 * 10000) / 14_120_000));
      expect(bp).toBeGreaterThanOrEqual(8299);
      expect(bp).toBeLessThanOrEqual(8301);
    });
    it('borné [0, 10000] même si le restant dépasse l\'initial', () => {
      expect(computeConvergenceBp({ initialGapXof: 1000 }, [], 5000)).toBe(0);
      expect(computeConvergenceBp({ initialGapXof: 1000 }, [], 0)).toBe(10000);
    });
    it('sans écart initial : ratio des critères satisfaits', () => {
      const c = (s: boolean) => ({ satisfied: s });
      expect(computeConvergenceBp({}, [c(true), c(true), c(false), c(false)])).toBe(5000);
      expect(computeConvergenceBp({}, [])).toBe(0);
    });
    it("n'utilise que des entiers (pas de float)", () => {
      const bp = computeConvergenceBp({ initialGapXof: 3 }, [], 1);
      expect(Number.isInteger(bp)).toBe(true);
      expect(bp).toBe(10000 - 3333); // trunc(1*10000/3)=3333
    });
  });

  describe('verrou de clôture', () => {
    it('resolu impossible tant qu\'un critère est rouge ou sans critère', () => {
      expect(canResolve([])).toBe(false);
      expect(canResolve([{ satisfied: true }, { satisfied: false }])).toBe(false);
      expect(canResolve([{ satisfied: true }, { satisfied: true }])).toBe(true);
    });
  });

  describe('machine à états', () => {
    it('suit le cycle ouvert → analyse → action → resolu → archive', () => {
      expect(canTransition('ouvert', 'analyse')).toBe(true);
      expect(canTransition('analyse', 'action')).toBe(true);
      expect(canTransition('action', 'resolu')).toBe(true);
      expect(canTransition('resolu', 'archive')).toBe(true);
      expect(canTransition('ouvert', 'resolu')).toBe(false);   // pas de saut
      expect(nextStatuses('archive')).toEqual([]);              // gelé
      expect(isFrozen('archive')).toBe(true);
      expect(isFrozen('abandonne')).toBe(true);
      expect(isFrozen('action')).toBe(false);
    });
  });

  describe('matrice de validation par seuils', () => {
    it('applique les seuils du CDC (tenant de référence)', () => {
      expect(requiredRolesFor('regularisation', 500_000)).toEqual(['Comptable']);
      expect(requiredRolesFor('abattement', 2_450_000)).toEqual(['DAF']);
      expect(requiredRolesFor('passage_en_perte', 15_000_000)).toEqual(['DAF', 'DG']);
      expect(requiredRolesFor('passage_en_perte', 5_000_000)).toEqual(['DAF']);
    });
  });

  describe('références de décision', () => {
    it('séquence DEC-AAAA-NNN par année', () => {
      expect(nextDecisionRef(2026, [])).toBe('DEC-2026-001');
      expect(nextDecisionRef(2026, ['DEC-2026-001', 'DEC-2026-040', 'DEC-2025-099'])).toBe('DEC-2026-041');
    });
  });

  describe('retards', () => {
    it('détecte une action en retard (échéance dépassée, non faite)', () => {
      const today = new Date(2026, 6, 6); // 6 juillet 2026
      expect(isOverdue({ status: 'todo', dueDate: '2026-07-05' }, today)).toBe(true);
      expect(isOverdue({ status: 'todo', dueDate: '2026-07-07' }, today)).toBe(false);
      expect(isOverdue({ status: 'done', dueDate: '2026-07-01' }, today)).toBe(false);
    });
  });
});
