import { describe, it, expect } from 'vitest';
import {
  computeConvergenceBp, canResolve, canTransition, nextStatuses, isFrozen,
  requiredRolesFor, nextDecisionRef, isOverdue, runVigie, hashSnapshot, buildClosureReport,
  SPACE_TEMPLATES, relativeDueDate,
} from './spaces';
import type { Space, SpaceSolution, SpaceDecision, SpaceSnapshot } from '../db/schema';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

describe('Vigie (relances automatiques, idempotentes)', () => {
  const space = { status: 'action' as const, ownerId: 'DAF Awa' };
  const late = { id: 1, label: 'Relancer SGCI', status: 'todo' as const, dueDate: daysAgo(3), assignee: 'Comptable Koffi', isCriticalPath: true };
  const onTime = { id: 2, label: 'Vérifier avis', status: 'todo' as const, dueDate: daysAgo(-2), assignee: 'Koffi', isCriticalPath: false };

  it('émet retard + escalade + chemin critique pour une action en retard ≥ 2 j', () => {
    const alerts = runVigie(space, [late, onTime], new Set());
    const kinds = alerts.map((a) => a.kind).sort();
    expect(kinds).toEqual(['critical_block', 'escalation', 'overdue']);
    expect(alerts.find((a) => a.kind === 'overdue')!.target).toBe('Comptable Koffi');
    expect(alerts.find((a) => a.kind === 'escalation')!.target).toBe('DAF Awa');
  });

  it('est idempotente : ne réémet pas une relance déjà présente', () => {
    const already = new Set(['overdue:1', 'escalation:1', 'critical:1']);
    expect(runVigie(space, [late, onTime], already)).toHaveLength(0);
  });

  it('ne relance rien sur un espace résolu ou gelé', () => {
    expect(runVigie({ status: 'resolu', ownerId: 'x' }, [late], new Set())).toHaveLength(0);
    expect(runVigie({ status: 'archive', ownerId: 'x' }, [late], new Set())).toHaveLength(0);
  });
});

describe('Rapport de clôture (assemblage déterministe)', () => {
  const space = {
    id: 'sp1', orgId: 'o', title: 'Écart BICICI', status: 'archive',
    problemStatement: 'Écart de 14 120 000 sur 521100', problemImpact: 'Clôture bloquée',
    anchorType: 'account_period', anchorRef: '521100 · 2026-03', ownerId: 'DAF Awa',
    initialGapXof: 14_120_000, convergenceBp: 10000, createdAt: 1_000_000, archivedAt: 1_000_000 + 5 * 86400000,
  } as unknown as Space;
  const solutions = [
    { status: 'kept', title: 'Analyse ligne à ligne', proposedBy: 'Awa' },
    { status: 'discarded', title: 'Provisionner l\'écart', statusReason: 'Non justifié comptablement' },
  ] as unknown as SpaceSolution[];
  const decisions = [
    { ref: 'DEC-2026-041', title: 'Abattement pénalités', amountXof: 2_450_000, status: 'approved', requiredRoles: ['DAF'], approvedBy: ['DAF'] },
  ] as unknown as SpaceDecision[];
  const snapshots = [{ label: 'Positions BICICI', hashSha256: 'abcdef0123456789'.repeat(4), takenAt: 1_000_000 }] as unknown as SpaceSnapshot[];

  it('produit toutes les sections, solutions retenue+écartée, durée et convergence', () => {
    const r = buildClosureReport(space, { solutions, actions: [], decisions, events: [], snapshots, criteria: [] });
    const headings = r.sections.map((s) => s.heading);
    expect(headings.some((h) => h.startsWith('1. Problème'))).toBe(true);
    expect(headings.some((h) => h.startsWith('8. Bilan'))).toBe(true);
    expect(r.meta.durationDays).toBe(5);
    expect(r.meta.convergencePct).toBe(100);
    const sols = r.sections.find((s) => s.heading.startsWith('2. Solutions'))!.rows.join(' | ');
    expect(sols).toMatch(/Retenue/);
    expect(sols).toMatch(/Écartée.*Non justifié/);           // motif d'écartement tracé
    const pieces = r.sections.find((s) => s.heading.startsWith('5. Pièces'))!.rows.join(' | ');
    expect(pieces).toMatch(/SHA-256/);                        // hash du snapshot
  });
});

describe('Templates d\'espaces', () => {
  it('chaque template a un ancrage, des critères et des actions cohérents', () => {
    for (const t of SPACE_TEMPLATES) {
      expect(t.criteria.length).toBeGreaterThan(0);
      expect(t.actions.length).toBeGreaterThan(0);
      expect(t.anchorType).toBeTruthy();
      // Un template « avec écart » DOIT porter au moins un critère calculé (règle CDC).
      if (t.withGap) expect(t.criteria.some((c) => c.kind === 'computed' && c.computeRef)).toBe(true);
      // Les actions ont un échéancier relatif positif.
      expect(t.actions.every((a) => a.dueInDays >= 0)).toBe(true);
    }
  });

  it('relativeDueDate calcule une échéance J+n au format YYYY-MM-DD', () => {
    const base = new Date('2026-03-10T00:00:00');
    expect(relativeDueDate(5, base)).toBe('2026-03-15');
    expect(relativeDueDate(25, base)).toBe('2026-04-04');   // franchit le mois
    expect(relativeDueDate(0, base)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Snapshot — hash SHA-256 déterministe', () => {
  it('deux données identiques (ordre de clés différent) → même hash', async () => {
    const h1 = await hashSnapshot({ a: 1, b: [2, 3], c: { x: 'v' } });
    const h2 = await hashSnapshot({ c: { x: 'v' }, b: [2, 3], a: 1 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it('une différence de données change le hash', async () => {
    const h1 = await hashSnapshot({ gap: 14_120_000 });
    const h2 = await hashSnapshot({ gap: 2_400_400 });
    expect(h1).not.toBe(h2);
  });
});

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
