import { describe, it, expect } from 'vitest';
import { sumDotationsImmo } from './flows';
import type { BalanceRow } from './balance';

function row(account: string, debit: number, credit: number): BalanceRow {
  const solde = debit - credit;
  return {
    account,
    label: '',
    debit,
    credit,
    solde,
    soldeD: solde > 0 ? solde : 0,
    soldeC: solde < 0 ? -solde : 0,
  };
}

describe('sumDotationsImmo (M-2) — dotations sur immobilisations', () => {
  it('inclut 681 (amort. exploitation) et 687 (DAP HAO immo)', () => {
    const rows = [
      row('6811', 1000, 0), // dotation amort. immo exploitation
      row('687', 300, 0),   // dotation HAO sur immo
    ];
    expect(sumDotationsImmo(rows)).toBe(1300);
  });

  it('EXCLUT 691 (provisions risques) et 6817 (prov. actif circulant)', () => {
    const rows = [
      row('6811', 1000, 0), // immo → inclus
      row('6817', 500, 0),  // dépréciation actif circulant → EXCLU
      row('691', 800, 0),   // provisions pour risques → EXCLU
    ];
    // Seul 6811 compte : les dotations non rattachées aux immo gonfleraient
    // à tort les acquisitions d'immobilisations (bug M-2).
    expect(sumDotationsImmo(rows)).toBe(1000);
  });

  it('prend le net (D − C) pour gérer une reprise/annulation', () => {
    const rows = [row('6811', 1000, 200)];
    expect(sumDotationsImmo(rows)).toBe(800);
  });

  it('retourne 0 sur une balance sans dotation immo', () => {
    expect(sumDotationsImmo([row('601', 5000, 0), row('701', 0, 9000)])).toBe(0);
  });
});
