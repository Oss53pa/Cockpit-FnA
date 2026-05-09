import { describe, it, expect } from 'vitest';
import { inferBranch, isCodeCompatibleWithBranch, BRANCH_LABELS } from './analyticBranch';
import type { GLEntry, AnalyticAssignment } from '../db/schema';

function entry(account: string, extra: Partial<GLEntry> = {}): GLEntry {
  return {
    orgId: 'demo', periodId: 'p', date: '2026-01-15', journal: 'OD',
    piece: 'P1', account, label: 'Test', debit: 0, credit: 0, ...extra,
  } as GLEntry;
}

describe('inferBranch', () => {
  it('classe 7 → revenue', () => {
    expect(inferBranch(entry('701'))).toBe('revenue');
    expect(inferBranch(entry('706XYZ'))).toBe('revenue');
    expect(inferBranch(entry('771'))).toBe('revenue');
  });

  it('classe 6 sans projet → overhead', () => {
    expect(inferBranch(entry('601'))).toBe('overhead');
    expect(inferBranch(entry('622'))).toBe('overhead');
    expect(inferBranch(entry('681'))).toBe('overhead');
  });

  it('classe 6 avec analyticalSection → project_cost', () => {
    expect(inferBranch(entry('602', { analyticalSection: 'PRJ-001' }))).toBe('project_cost');
  });

  it('classe 6 avec analyticalAxis → project_cost', () => {
    expect(inferBranch(entry('624', { analyticalAxis: 'IB005' }))).toBe('project_cost');
  });

  it('classe 6 avec assignement axe 1 → project_cost', () => {
    const assignments: AnalyticAssignment[] = [{
      orgId: 'demo', glEntryId: 1, axisNumber: 1, codeId: 'c1',
      method: 'manual', assignedAt: 0,
    }];
    expect(inferBranch(entry('601'), { assignments })).toBe('project_cost');
  });

  it('classe 6 avec hasProjectMarker explicite → project_cost', () => {
    expect(inferBranch(entry('601'), { hasProjectMarker: true })).toBe('project_cost');
  });

  it('classes 1/2/3/4/5/8 → undefined (non analytique WBS)', () => {
    expect(inferBranch(entry('101'))).toBeUndefined();
    expect(inferBranch(entry('231'))).toBeUndefined();
    expect(inferBranch(entry('311'))).toBeUndefined();
    expect(inferBranch(entry('401'))).toBeUndefined();
    expect(inferBranch(entry('521'))).toBeUndefined();
    expect(inferBranch(entry('811'))).toBeUndefined();
  });

  it('compte vide → undefined', () => {
    expect(inferBranch(entry(''))).toBeUndefined();
  });
});

describe('isCodeCompatibleWithBranch', () => {
  it('code universel (branch undefined) accepté partout', () => {
    expect(isCodeCompatibleWithBranch(undefined, 'revenue')).toBe(true);
    expect(isCodeCompatibleWithBranch(undefined, 'project_cost')).toBe(true);
    expect(isCodeCompatibleWithBranch(undefined, undefined)).toBe(true);
  });

  it('code typé sur ligne sans branche → refus', () => {
    expect(isCodeCompatibleWithBranch('revenue', undefined)).toBe(false);
  });

  it('matching strict des branches', () => {
    expect(isCodeCompatibleWithBranch('revenue', 'revenue')).toBe(true);
    expect(isCodeCompatibleWithBranch('project_cost', 'project_cost')).toBe(true);
    expect(isCodeCompatibleWithBranch('overhead', 'overhead')).toBe(true);
    expect(isCodeCompatibleWithBranch('revenue', 'project_cost')).toBe(false);
    expect(isCodeCompatibleWithBranch('project_cost', 'overhead')).toBe(false);
  });
});

describe('BRANCH_LABELS', () => {
  it('couvre les 3 branches', () => {
    expect(BRANCH_LABELS.revenue).toBe('Revenus');
    expect(BRANCH_LABELS.project_cost).toBe('Coûts projets');
    expect(BRANCH_LABELS.overhead).toBe('Frais généraux');
  });
});
