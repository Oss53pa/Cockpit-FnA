import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock du module db AVANT l'import des fonctions à tester
vi.mock('../db/schema', () => {
  const periods: any[] = [];
  const fiscalYears: any[] = [];
  return {
    db: {
      periods: {
        where: (key: string) => ({
          equals: (value: any) => ({
            and: (predicate: (p: any) => boolean) => ({
              toArray: async () => periods.filter((p: any) => p[key] === value && predicate(p)),
            }),
            toArray: async () => periods.filter((p: any) => p[key] === value),
          }),
        }),
        update: async (id: string, patch: any) => {
          const idx = periods.findIndex((p: any) => p.id === id);
          if (idx >= 0) periods[idx] = { ...periods[idx], ...patch };
        },
        bulkPut: async (items: any[]) => {
          for (const it of items) {
            const idx = periods.findIndex((p: any) => p.id === it.id);
            if (idx >= 0) periods[idx] = it;
            else periods.push(it);
          }
        },
        __reset: () => { periods.length = 0; },
        __seed: (items: any[]) => { periods.push(...items); },
      },
      fiscalYears: {
        get: async (id: string) => fiscalYears.find((fy: any) => fy.id === id),
        update: async (id: string, patch: any) => {
          const idx = fiscalYears.findIndex((fy: any) => fy.id === id);
          if (idx >= 0) fiscalYears[idx] = { ...fiscalYears[idx], ...patch };
        },
        where: (key: string) => ({
          equals: (value: any) => ({
            toArray: async () => fiscalYears.filter((fy: any) => fy[key] === value),
          }),
        }),
        __reset: () => { fiscalYears.length = 0; },
        __seed: (items: any[]) => { fiscalYears.push(...items); },
      },
    },
  };
});

import { db } from '../db/schema';
import {
  getPeriodForDate,
  getPeriodStatus,
  isPeriodLocked,
  assertPeriodOpen,
  lockPeriod,
  unlockPeriod,
  PeriodLockedError,
} from './periodLock';

const ORG = 'org-1';

beforeEach(() => {
  (db.periods as any).__reset();
  (db.fiscalYears as any).__reset();
  (db.periods as any).__seed([
    { id: 'p-2026-01', orgId: ORG, fiscalYearId: 'fy-2026', year: 2026, month: 1, label: 'Jan 2026', closed: false },
    { id: 'p-2026-02', orgId: ORG, fiscalYearId: 'fy-2026', year: 2026, month: 2, label: 'Fév 2026', closed: false },
    { id: 'p-2025-12', orgId: ORG, fiscalYearId: 'fy-2025', year: 2025, month: 12, label: 'Déc 2025', closed: true },
  ]);
});

describe('periodLock — getPeriodForDate', () => {
  it('trouve la période correspondant à une date', async () => {
    const p = await getPeriodForDate('2026-01-15', ORG);
    expect(p?.id).toBe('p-2026-01');
  });

  it('retourne null si pas de période', async () => {
    const p = await getPeriodForDate('2030-06-15', ORG);
    expect(p).toBeNull();
  });
});

describe('periodLock — getPeriodStatus', () => {
  it('période ouverte → status open', async () => {
    expect(await getPeriodStatus('2026-01-15', ORG)).toBe('open');
  });

  it('période clôturée → status closed', async () => {
    expect(await getPeriodStatus('2025-12-31', ORG)).toBe('closed');
  });

  it('période inconnue → status open par défaut', async () => {
    expect(await getPeriodStatus('2030-06-15', ORG)).toBe('open');
  });
});

describe('periodLock — isPeriodLocked', () => {
  it('false pour période ouverte', async () => {
    expect(await isPeriodLocked('2026-01-15', ORG)).toBe(false);
  });

  it('true pour période clôturée', async () => {
    expect(await isPeriodLocked('2025-12-31', ORG)).toBe(true);
  });
});

describe('periodLock — assertPeriodOpen', () => {
  it('passe sans erreur sur période ouverte', async () => {
    await expect(assertPeriodOpen('2026-01-15', ORG)).resolves.toBeUndefined();
  });

  it('throw PeriodLockedError sur période clôturée', async () => {
    await expect(assertPeriodOpen('2025-12-31', ORG)).rejects.toThrow(PeriodLockedError);
  });

  it("ne throw pas si pas de période (cas edge)", async () => {
    await expect(assertPeriodOpen('2030-06-15', ORG)).resolves.toBeUndefined();
  });
});

describe('periodLock — lock / unlock', () => {
  it('lockPeriod ferme la période', async () => {
    await lockPeriod('p-2026-01');
    const status = await getPeriodStatus('2026-01-15', ORG);
    expect(status).toBe('closed');
  });

  it('unlockPeriod refuse motif < 5 chars', async () => {
    await expect(unlockPeriod('p-2026-01', 'oups')).rejects.toThrow();
  });

  it('unlockPeriod réouvre avec motif valide', async () => {
    await lockPeriod('p-2026-01');
    await unlockPeriod('p-2026-01', 'correction écriture inversée par compta');
    expect(await isPeriodLocked('2026-01-15', ORG)).toBe(false);
  });
});
