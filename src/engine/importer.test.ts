/**
 * Tests unitaires importer.ts
 *
 * Couvre les FONCTIONS PURES critiques métier :
 *   - detectColumns(headers) : détection auto colonnes GL (Cockpit FnA + Sage + Cegid + Excel libre)
 *   - detectTiersColumns(headers) : détection colonnes GL Tiers
 *
 * Les fonctions async qui touchent dataProvider/Supabase ne sont pas testées
 * ici (nécessitent un mock du DAL). Cibler ce niveau dans une 2e phase.
 */
import { describe, it, expect } from 'vitest';
import { detectColumns, detectTiersColumns } from './importer';

describe('detectColumns — format Cockpit FnA standard', () => {
  it('détecte le format Excel généré par Cockpit FnA', () => {
    const headers = ['COMPTE', 'LIBELLE', 'DATE', 'JOURNAL', 'NUMERO DE SAISIE', 'DESCRIPTION', 'LETTRAGE', 'DEBIT', 'CREDIT'];
    const m = detectColumns(headers);
    expect(m.account).toBe('COMPTE');
    // Le 1er header qui match `label` gagne — ici 'LIBELLE' avant 'DESCRIPTION'
    expect(['LIBELLE', 'DESCRIPTION']).toContain(m.label);
    expect(m.date).toBe('DATE');
    expect(m.journal).toBe('JOURNAL');
    expect(m.piece).toBe('NUMERO DE SAISIE');
    expect(m.debit).toBe('DEBIT');
    expect(m.credit).toBe('CREDIT');
  });
});

describe('detectColumns — format Sage / Sage X3', () => {
  it('détecte le format Sage classique', () => {
    const headers = ['Date', 'Pièce', 'Libellé écriture', 'N° compte', 'Code journal', 'Débit', 'Crédit', 'Code tiers'];
    const m = detectColumns(headers);
    expect(m.date).toBe('Date');
    expect(m.piece).toBe('Pièce');
    expect(m.account).toBe('N° compte');
    expect(m.journal).toBe('Code journal');
    expect(m.debit).toBe('Débit');
    expect(m.credit).toBe('Crédit');
    expect(m.tiers).toBe('Code tiers');
  });
});

describe('detectColumns — format anglais (Excel libre)', () => {
  it('détecte les en-têtes en anglais', () => {
    const headers = ['Date', 'Account', 'Label', 'Debit', 'Credit', 'Journal'];
    const m = detectColumns(headers);
    expect(m.date).toBe('Date');
    expect(m.account).toBe('Account');
    expect(m.label).toBe('Label');
    expect(m.debit).toBe('Debit');
    expect(m.credit).toBe('Credit');
    expect(m.journal).toBe('Journal');
  });
});

describe('detectColumns — robustesse (variations)', () => {
  it('reconnaît "Cpte" pour le compte', () => {
    expect(detectColumns(['Cpte', 'Date', 'Db', 'Cr']).account).toBe('Cpte');
  });

  it('reconnaît "DR" / "CR" anglais pour Débit/Crédit', () => {
    const m = detectColumns(['Date', 'Account', 'DR', 'CR']);
    expect(m.debit).toBe('DR');
    expect(m.credit).toBe('CR');
  });

  it('reconnaît "Voucher" / "Ref" pour pièce', () => {
    expect(detectColumns(['Date', 'Account', 'Voucher', 'Debit', 'Credit']).piece).toBe('Voucher');
    expect(detectColumns(['Date', 'Account', 'Ref', 'Debit', 'Credit']).piece).toBe('Ref');
  });

  it('détecte la section analytique', () => {
    expect(detectColumns(['Date', 'Account', 'Analytic', 'Debit']).analyticalSection).toBe('Analytic');
    expect(detectColumns(['Date', 'Account', 'Section', 'Debit']).analyticalSection).toBe('Section');
    expect(detectColumns(['Date', 'Account', 'Cost Center', 'Debit']).analyticalSection).toBe('Cost Center');
  });
});

describe('detectColumns — cas limite', () => {
  it('retourne mapping vide si aucune colonne reconnue', () => {
    const m = detectColumns(['col1', 'col2', 'col3']);
    expect(Object.keys(m)).toHaveLength(0);
  });

  it('ignore les colonnes en trop', () => {
    const m = detectColumns(['Date', 'Account', 'Debit', 'Credit', 'Notes', 'AutreCol']);
    expect(m.date).toBe('Date');
    expect(m.account).toBe('Account');
    expect(m.debit).toBe('Debit');
    expect(m.credit).toBe('Credit');
    expect((m as Record<string, unknown>).notes).toBeUndefined();
  });

  it('headers vide → mapping vide', () => {
    expect(Object.keys(detectColumns([]))).toHaveLength(0);
  });
});

describe('detectTiersColumns — format Cockpit FnA Tiers', () => {
  it('détecte le format standard tiers', () => {
    const headers = ['Date', 'Compte général', 'Code tiers', 'Nom tiers', 'Débit', 'Crédit', 'Journal', 'Pièce', 'Libellé'];
    const m = detectTiersColumns(headers);
    expect(m.date).toBe('Date');
    expect(m.account).toBe('Compte général');
    expect(m.codeTiers).toBe('Code tiers');
    expect(m.labelTiers).toBe('Nom tiers');
    expect(m.debit).toBe('Débit');
    expect(m.credit).toBe('Crédit');
  });
});

describe('detectTiersColumns — variations Sage / autres ERP', () => {
  it('reconnaît compte collectif', () => {
    expect(detectTiersColumns(['Compte collectif', 'Code tiers', 'Date']).account).toBe('Compte collectif');
  });

  it('reconnaît "Raison sociale" pour le label tiers', () => {
    expect(detectTiersColumns(['Date', 'Compte', 'Code tiers', 'Raison sociale', 'Débit']).labelTiers).toBe('Raison sociale');
  });

  it('reconnaît "Code client" / "Code fournisseur"', () => {
    expect(detectTiersColumns(['Date', 'Compte', 'Code client', 'Nom']).codeTiers).toBe('Code client');
    expect(detectTiersColumns(['Date', 'Compte', 'Code fournisseur', 'Nom']).codeTiers).toBe('Code fournisseur');
  });

  it('reconnaît auxiliaire', () => {
    expect(detectTiersColumns(['Date', 'Compte', 'Code auxiliaire', 'Nom']).codeTiers).toBe('Code auxiliaire');
  });
});

describe('detectColumns — priorité de détection', () => {
  it('si plusieurs en-têtes matchent un pattern, prend le 1er trouvé', () => {
    const headers = ['Date écriture', 'Date saisie', 'Account', 'Debit', 'Credit'];
    const m = detectColumns(headers);
    // Le 1er header qui match `^date` gagne
    expect(m.date).toBe('Date écriture');
  });
});
