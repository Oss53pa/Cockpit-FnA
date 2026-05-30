/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ─── BLOCK PREVIEWS — aperçus inline tableau et dashboard ────────
// TablePreview : rendu tabulaire d'une source de données comptable.
// DashboardSnippet : re-exporté depuis son propre module (P-01 split).
import React from 'react';
import clsx from 'clsx';
import { fmtFull } from '../../lib/format';

// DashboardSnippet vit dans son propre module > 500 LOC — on le re-exporte
// ici pour satisfaire l'import existant dans BlockComponents.tsx.
export { DashboardSnippet } from './DashboardSnippet';

export function TablePreview({ source, data, palette, title }: any) {
  const head: string[] = [];
  let body: any[][] = [];
  switch (source) {
    case 'bilan_actif': head.push('Code', 'Poste', 'Montant'); body = data.bilanActif.slice(0, 12).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
    case 'bilan_passif': head.push('Code', 'Poste', 'Montant'); body = data.bilanPassif.slice(0, 12).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
    case 'cr': head.push('Code', 'Poste', 'Montant'); body = data.cr.slice(0, 14).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
    case 'sig': head.push('Solde', 'Valeur'); body = [['Marge brute', fmtFull(data.sig?.margeBrute ?? 0)], ['VA', fmtFull(data.sig?.valeurAjoutee ?? 0)], ['EBE', fmtFull(data.sig?.ebe ?? 0)], ['Résultat exploitation', fmtFull(data.sig?.re ?? 0)], ['Résultat net', fmtFull(data.sig?.resultat ?? 0)]]; break;
    case 'balance': {
      head.push('Compte', 'Libellé', 'Solde D', 'Solde C');
      // Filtrer les comptes sans solde (mouvements = 0)
      const filtered = data.balance.filter((r: any) => Math.abs(r.soldeD) > 0.01 || Math.abs(r.soldeC) > 0.01);
      body = filtered.slice(0, 30).map((r: any) => [r.account, r.label, r.soldeD ? fmtFull(r.soldeD) : '', r.soldeC ? fmtFull(r.soldeC) : '']);
      break;
    }
    case 'ratios': head.push('Ratio', 'Valeur', 'Cible', 'Statut'); body = data.ratios.slice(0, 10).map((r: any) => [r.label, r.unit === '%' ? `${r.value.toFixed(1)} %` : `${r.value.toFixed(2)}`, `${r.target}`, r.status === 'good' ? 'OK' : r.status === 'warn' ? '--' : '!!']); break;
    case 'budget_actual': {
      head.push('Compte', 'Réalisé', 'Budget', 'Écart', 'Var %');
      // Filtrer : exclure les comptes sans aucun mouvement (réalisé=0 ET budget=0)
      const filtered = (data.budgetActual ?? []).filter((r: any) =>
        Math.abs(r.realise) > 0.01 || Math.abs(r.budget) > 0.01
      );
      const totB = filtered.reduce((s: number, r: any) => s + (r.budget ?? 0), 0);
      const hasB = Math.abs(totB) > 0.01;
      body = filtered.slice(0, 30).map((r: any) => [
        r.label, fmtFull(r.realise),
        hasB ? fmtFull(r.budget) : '—',
        hasB ? fmtFull(r.ecart) : '—',
        hasB && r.ecartPct ? `${r.ecartPct.toFixed(1)}%` : '—',
      ]);
      break;
    }
    case 'capital': head.push('Rubrique', 'Ouverture', 'Augm.', 'Clôture'); body = (data.capital ?? []).map((m: any) => [m.rubrique, fmtFull(m.ouverture), m.augmentation ? '+' + fmtFull(m.augmentation) : '—', fmtFull(m.cloture)]); break;
    case 'tft': head.push('Code', 'Poste', 'Montant'); body = (data.tft ?? []).slice(0, 12).map((l: any) => [l.code.startsWith('_') ? '' : l.code, l.label, fmtFull(l.value)]); break;
    case 'cr_monthly': {
      const mcr = data.monthlyCR;
      if (mcr?.lines?.length) {
        head.push('Poste', ...mcr.months.slice(0, 6), 'YTD');
        body = mcr.lines.filter((l: any) => l.total || l.grand).slice(0, 10).map((l: any) => [
          l.label, ...l.values.slice(0, 6).map((v: number) => fmtFull(v)), fmtFull(l.ytd),
        ]);
      } else {
        head.push('Poste', 'Jan', 'Fév', 'Mar', 'Total');
        body = [['CA', '—', '—', '—', fmtFull(data.sig?.ca ?? 0)], ['RN', '—', '—', '—', fmtFull(data.sig?.resultat ?? 0)]];
      }
      break;
    }
    case 'bilan_monthly': {
      const mb = data.monthlyBilan;
      if (mb?.actif?.length) {
        head.push('Poste', ...mb.months.slice(0, 6), 'Fin');
        body = mb.actif.filter((l: any) => l.total || l.grand).slice(0, 8).map((l: any) => [
          l.label, ...l.values.slice(0, 6).map((v: number) => fmtFull(v)), fmtFull(l.ytd),
        ]);
      } else {
        head.push('Poste', 'Valeur'); body = data.bilanActif.slice(0, 8).map((l: any) => [l.label, fmtFull(l.value)]);
      }
      break;
    }
    case 'budget_monthly': {
      head.push('Section', 'Actual Mois', 'Budget Mois', 'N-1 Mois', 'Actual YTD', 'Budget YTD');
      const ba = data.budgetActual ?? [];
      const produits = ba.filter((r: any) => r.code?.startsWith('7'));
      const charges = ba.filter((r: any) => r.code?.startsWith('6'));
      const totProdR = produits.reduce((s: number, r: any) => s + r.realise, 0);
      const totProdB = produits.reduce((s: number, r: any) => s + r.budget, 0);
      const totChR = charges.reduce((s: number, r: any) => s + r.realise, 0);
      const totChB = charges.reduce((s: number, r: any) => s + r.budget, 0);
      body = [
        ['Produits expl.', '—', '—', '—', fmtFull(totProdR), fmtFull(totProdB)],
        ['Charges expl.', '—', '—', '—', fmtFull(totChR), fmtFull(totChB)],
        ['Résultat', '—', '—', '—', fmtFull(totProdR - totChR), fmtFull(totProdB - totChB)],
      ];
      break;
    }
    default: {
      // CR bloc par période (crtab_*_m / _q / _s / _a)
      if (source.startsWith('crtab_')) {
        const BASE_PREFIXES: Record<string, string[]> = {
          produits_expl: ['70','71','72','73','74','75','781'],
          charges_expl: ['60','61','62','63','64','65','66','681','691'],
          produits_fin: ['77','786','797'],
          charges_fin: ['67','687','697'],
          produits_hao: ['82','84','86','88'],
          charges_hao: ['81','83','85'],
          impots: ['87','89'],
        };
        const parts = source.replace('crtab_', '').split('_');
        const suffix = parts[parts.length - 1]; // m=Monthly, q=Quarterly, s=Semestre, a=Annual
        const sectionKey = parts.slice(0, -1).join('_');
        const prefixes = BASE_PREFIXES[sectionKey] ?? [];

        // Détermine la fenêtre de mois selon le suffixe : on agrège depuis le
        // monthlyCR pour avoir la VRAIE valeur de la période (pas YTD).
        const monthCount = ({ m: 1, q: 3, s: 6, a: 12 } as Record<string, number>)[suffix] ?? 12;
        const periodLabel = ({ m: 'Mois', q: 'Trimestre', s: 'Semestre', a: 'Annuel' } as Record<string, string>)[suffix] ?? 'Période';
        const mcr = data.monthlyCR;
        // Index des mois actifs : on prend les `monthCount` derniers mois ayant
        // au moins un mouvement (sinon rapport sur Q1, Q2... selon la position).
        const activeMonths: number[] = [];
        if (mcr?.lines && mcr.lines.length > 0) {
          for (let mi = 11; mi >= 0; mi--) {
            const hasData = mcr.lines.some((l: any) => Math.abs(l.values?.[mi] ?? 0) > 0);
            if (hasData) activeMonths.unshift(mi);
            if (activeMonths.length >= monthCount) break;
          }
        }
        // Indices = derniers mois actifs (ex: pour quarterly, 3 derniers mois actifs)

        // Construction du tableau : pour chaque compte du CR, agrège le réalisé
        // sur les mois retenus + budget sur ces mois + N-1 sur ces mêmes mois.
        type Row = { code: string; label: string; realise: number; budget: number; n1: number; isCharge: boolean };
        const rowMap = new Map<string, Row>();
        if (mcr?.lines) {
          for (const line of mcr.lines) {
            const code = String(line.code || line.accountCodes || '');
            if (!prefixes.some((p: string) => code.startsWith(p))) continue;
            if (line.total || line.intermediate) continue;
            const r: Row = { code, label: line.label ?? code, realise: 0, budget: 0, n1: 0, isCharge: line.isCharge ?? /^[68]/.test(code) };
            for (const mi of activeMonths) {
              r.realise += line.values?.[mi] ?? 0;
              r.budget  += line.budgets?.[mi] ?? 0;
              r.n1      += line.previousYear?.[mi] ?? 0;
            }
            if (Math.abs(r.realise) > 0.01 || Math.abs(r.budget) > 0.01 || Math.abs(r.n1) > 0.01) {
              rowMap.set(code, r);
            }
          }
        }
        // Fallback : si monthlyCR vide, retombe sur budgetActual YTD
        if (rowMap.size === 0) {
          const ba = data.budgetActual ?? [];
          for (const r of ba) {
            if (!prefixes.some((p: string) => r.code?.startsWith(p))) continue;
            if (Math.abs(r.realise) < 0.01 && Math.abs(r.budget) < 0.01) continue;
            rowMap.set(r.code, { code: r.code, label: r.label, realise: r.realise, budget: r.budget, n1: 0, isCharge: r.isCharge });
          }
        }
        const filtered = Array.from(rowMap.values()).sort((a, b) => a.code.localeCompare(b.code));

        // Sous-totaux SYSCOHADA pour la section
        const totR = filtered.reduce((s, r) => s + r.realise, 0);
        const totB = filtered.reduce((s, r) => s + r.budget, 0);
        const totN1 = filtered.reduce((s, r) => s + r.n1, 0);
        const ecartTot = totR - totB;
        const varN1Tot = totN1 ? ((totR - totN1) / Math.abs(totN1)) * 100 : 0;
        // Si AUCUN budget n'est saisi pour la table entière, on affiche "—" partout
        // au lieu de "0" (clarte : pas de budget != budget de zero).
        const hasBudget = Math.abs(totB) > 0.01;
        const fmtBudget = (v: number) => hasBudget ? fmtFull(v) : '—';
        const fmtEcart = (v: number) => hasBudget ? fmtFull(v) : '—';

        head.push('Compte', 'Libellé', `Réalisé ${periodLabel}`, `Budget`, 'Écart', 'Écart %', 'N-1', 'Var N-1 %');
        body = filtered.slice(0, 30).map((r) => {
          const ecart = r.realise - r.budget;
          const ecartPct = r.budget ? (ecart / Math.abs(r.budget)) * 100 : 0;
          const varN1 = r.n1 ? ((r.realise - r.n1) / Math.abs(r.n1)) * 100 : 0;
          return [
            r.code, r.label,
            fmtFull(r.realise), fmtBudget(r.budget), fmtEcart(ecart),
            r.budget ? `${ecartPct.toFixed(1)}%` : '—',
            r.n1 ? fmtFull(r.n1) : '—',
            r.n1 ? `${varN1.toFixed(1)}%` : '—',
          ];
        });
        // Ligne de TOTAL (sous-total intermédiaire SYSCOHADA)
        body.push([
          '─', `TOTAL ${sectionKey.toUpperCase()}`,
          fmtFull(totR), fmtBudget(totB), fmtEcart(ecartTot),
          totB ? `${((ecartTot / Math.abs(totB)) * 100).toFixed(1)}%` : '—',
          totN1 ? fmtFull(totN1) : '—',
          totN1 ? `${varN1Tot.toFixed(1)}%` : '—',
        ]);
      }
      break;
    }
  }
  return (
    <div>
      {title && <p className="text-xs font-semibold mb-1" style={{ color: palette.primary }}>{title}</p>}
      <table className="w-full text-xs">
        <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
          {head.map((h, i) => <th key={i} className="text-left py-1 px-2 first:rounded-l last:rounded-r">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
          {body.map((row, i) => (
            <tr key={i}>{row.map((c, j) => <td key={j} className={clsx('py-1 px-2', j === row.length - 1 && 'text-right num')}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="text-[9px] text-primary-400 italic mt-1">Aperçu tronqué — version complète dans le PDF</p>
    </div>
  );
}
