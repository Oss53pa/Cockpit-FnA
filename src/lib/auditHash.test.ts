import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { hashEntry, hashChain, verifyChain, type HashableEntry } from './auditHash';

// Polyfill crypto.subtle pour Node < 18 (Vitest tourne sur Node)
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error injection runtime
  globalThis.crypto = webcrypto;
}

const e = (id: number, account: string, debit = 0, credit = 0): HashableEntry => ({
  id,
  date: `2026-01-${String(id).padStart(2, '0')}`,
  journal: 'OD',
  piece: `P${id}`,
  account,
  label: `Op ${id}`,
  debit,
  credit,
});

describe('auditHash — hashEntry', () => {
  it('produit un hash 64 hex chars', async () => {
    const h = await hashEntry(e(1, '411'), '');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deux écritures identiques avec même previousHash → même hash', async () => {
    const a = await hashEntry(e(1, '411', 1000), 'abc');
    const b = await hashEntry(e(1, '411', 1000), 'abc');
    expect(a).toBe(b);
  });

  it('un changement de montant change le hash', async () => {
    const a = await hashEntry(e(1, '411', 1000), 'abc');
    const b = await hashEntry(e(1, '411', 1001), 'abc');
    expect(a).not.toBe(b);
  });

  it('un changement de previousHash change le hash (chaînage)', async () => {
    const a = await hashEntry(e(1, '411', 1000), 'abc');
    const b = await hashEntry(e(1, '411', 1000), 'def');
    expect(a).not.toBe(b);
  });

  it('un changement de date change le hash', async () => {
    const a = await hashEntry(e(1, '411'), '');
    const b = await hashEntry({ ...e(1, '411'), date: '2026-12-31' }, '');
    expect(a).not.toBe(b);
  });
});

describe('auditHash — hashChain', () => {
  it('génère N hashes pour N écritures', async () => {
    const entries = [e(1, '411', 100), e(2, '512', 200), e(3, '601', 300)];
    const hashes = await hashChain(entries);
    expect(hashes).toHaveLength(3);
    expect(new Set(hashes).size).toBe(3); // tous différents
  });

  it('chaque hash dépend du précédent', async () => {
    const entries = [e(1, '411', 100), e(2, '512', 200)];
    const [h1, h2] = await hashChain(entries);
    // Recalcul manuel : h2 doit dépendre de h1
    const h2bis = await hashEntry(entries[1], h1);
    expect(h2).toBe(h2bis);
  });
});

describe('auditHash — verifyChain', () => {
  it('chaîne valide → result.valid = true', async () => {
    const entries = [e(1, '411', 100), e(2, '512', 200), e(3, '601', 300)];
    const hashes = await hashChain(entries);
    const signed = entries.map((entry, i) => ({
      ...entry,
      hash: hashes[i],
      previousHash: i === 0 ? '' : hashes[i - 1],
    }));
    const result = await verifyChain(signed);
    expect(result.valid).toBe(true);
    expect(result.count).toBe(3);
    expect(result.finalHash).toBe(hashes[2]);
  });

  it('détecte une altération : modification du montant de l\'écriture #2', async () => {
    const entries = [e(1, '411', 100), e(2, '512', 200), e(3, '601', 300)];
    const hashes = await hashChain(entries);
    const signed = entries.map((entry, i) => ({
      ...entry,
      hash: hashes[i],
      previousHash: i === 0 ? '' : hashes[i - 1],
    }));

    // Quelqu'un modifie le débit de l'écriture #2 a posteriori (sans recalculer le hash)
    signed[1].debit = 99999;

    const result = await verifyChain(signed);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe('2');
    expect(result.brokenIndex).toBe(1);
  });

  it('détecte un hash réécrit avec previousHash incohérent', async () => {
    const entries = [e(1, '411', 100), e(2, '512', 200)];
    const hashes = await hashChain(entries);
    const signed = entries.map((entry, i) => ({
      ...entry,
      hash: hashes[i],
      previousHash: i === 0 ? '' : hashes[i - 1],
    }));
    // Quelqu'un réécrit le previousHash sans recalculer le hash
    signed[1].previousHash = 'fakehash';
    const result = await verifyChain(signed);
    expect(result.valid).toBe(false);
    expect(result.brokenIndex).toBe(1);
  });

  it('détecte une écriture sans hash', async () => {
    const entries = [e(1, '411', 100)];
    const signed = entries.map((entry) => ({ ...entry, previousHash: '' })); // pas de hash
    const result = await verifyChain(signed);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe('1');
  });

  it('chaîne vide → valide', async () => {
    const result = await verifyChain([]);
    expect(result.valid).toBe(true);
    expect(result.count).toBe(0);
  });
});

describe('auditHash — résistance aux altérations', () => {
  it('toute modification d\'1 champ critique invalide la chaîne', async () => {
    const fields: Array<keyof HashableEntry> = ['date', 'journal', 'piece', 'account', 'label', 'debit', 'credit'];
    for (const field of fields) {
      const entries = [e(1, '411', 100), e(2, '512', 200)];
      const hashes = await hashChain(entries);
      const signed = entries.map((entry, i) => ({
        ...entry,
        hash: hashes[i],
        previousHash: i === 0 ? '' : hashes[i - 1],
      }));
      // Altération du champ
      if (field === 'debit' || field === 'credit') (signed[1] as any)[field] = 99999;
      else (signed[1] as any)[field] = 'altered';

      const result = await verifyChain(signed);
      expect(result.valid, `champ ${field} devrait invalider la chaîne`).toBe(false);
    }
  });
});
