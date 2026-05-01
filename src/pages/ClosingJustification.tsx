/**
 * Justification des écritures de clôture — provisions, CCA/PCA, FAE/FAP.
 * Filtre les écritures de fin d'exercice sur les comptes spéciaux à justifier.
 * Ce que les commissaires aux comptes veulent voir.
 */
import { useEffect, useMemo, useState } from 'react';
import { Shield, FileText, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { TabSwitch } from '../components/ui/TabSwitch';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';

type Cat = 'provisions' | 'cca_pca' | 'fae_fap' | 'amorts';

const CATEGORIES: Record<Cat, { label: string; prefixes: string[]; desc: string }> = {
  provisions: {
    label: 'Provisions',
    prefixes: ['15', '19', '29', '39', '49', '59'],
    desc: 'Provisions réglementées (15), pour risques (19), dépréciations (29-39-49-59)',
  },
  cca_pca: {
    label: 'CCA / PCA',
    prefixes: ['486', '487'],
    desc: 'Charges constatées d\'avance (486), Produits constatés d\'avance (487)',
  },
  fae_fap: {
    label: 'FAE / FAP',
    prefixes: ['418', '408'],
    desc: 'Factures à recevoir (4181), Factures à recevoir fournisseurs (408)',
  },
  amorts: {
    label: 'Dotations amortissements',
    prefixes: ['681', '687'],
    desc: 'Dotations aux amortissements d\'exploitation et HAO',
  },
};

export default function ClosingJustificationPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [tab, setTab] = useState<Cat>('provisions');
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    db.gl.where('orgId').equals(currentOrgId).toArray().then(setEntries);
  }, [currentOrgId, currentYear]);

  const config = CATEGORIES[tab];

  // Filtre par catégorie
  const filtered = useMemo(() => {
    return entries
      .filter((e) => config.prefixes.some((p) => e.account.startsWith(p)))
      .filter((e) => e.date.startsWith(String(currentYear)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, config, currentYear]);

  // Agrégation par compte
  const byAccount = useMemo(() => {
    const map = new Map<string, { account: string; label: string; debit: number; credit: number; count: number }>();
    for (const e of filtered) {
      const cur = map.get(e.account) ?? { account: e.account, label: e.label || '—', debit: 0, credit: 0, count: 0 };
      cur.debit += e.debit;
      cur.credit += e.credit;
      cur.count++;
      map.set(e.account, cur);
    }
    return Array.from(map.values()).sort((a, b) => Math.abs(b.debit + b.credit) - Math.abs(a.debit + a.credit));
  }, [filtered]);

  const totalDebit = filtered.reduce((s, e) => s + e.debit, 0);
  const totalCredit = filtered.reduce((s, e) => s + e.credit, 0);
  const solde = totalDebit - totalCredit;

  // Détection automatique des écritures de clôture (12/31)
  const ecrCloture = filtered.filter((e) => e.date.endsWith('-12-31'));

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Justification des écritures de clôture"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · Provisions, CCA/PCA, FAE/FAP, dotations`}
      />

      <TabSwitch
        tabs={Object.entries(CATEGORIES).map(([k, v]) => ({ key: k, label: v.label }))}
        value={tab}
        onChange={(v) => setTab(v as Cat)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          variant="hero"
          title={`Solde ${config.label}`}
          value={fmtK(solde)}
          unit="XOF"
          icon={<Shield className="w-5 h-5" strokeWidth={2} />}
          subValue={`${filtered.length} écritures`}
        />
        <KPICard title="Total débits" value={fmtK(totalDebit)} unit="XOF" icon={<FileText className="w-4 h-4" />} />
        <KPICard title="Total crédits" value={fmtK(totalCredit)} unit="XOF" icon={<FileText className="w-4 h-4" />} />
        <KPICard title="Écritures du 31/12" value={String(ecrCloture.length)} subValue="Inventaire" icon={<AlertTriangle className="w-4 h-4" />} />
      </div>

      <div className="card-ghost p-4 bg-primary-100/40 dark:bg-primary-800/40 text-xs text-primary-600 dark:text-primary-300">
        <strong className="text-primary-900 dark:text-primary-100">{config.label}</strong> — {config.desc}
      </div>

      <ChartCard title={`Synthèse par compte`} subtitle={`${byAccount.length} comptes mouvementés`} accent={ct.accent}>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
                <th className="text-left py-2.5 px-3">Compte</th>
                <th className="text-left py-2.5 px-3">Libellé</th>
                <th className="text-right py-2.5 px-3">Nb écr.</th>
                <th className="text-right py-2.5 px-3 text-success">Débit</th>
                <th className="text-right py-2.5 px-3 text-error">Crédit</th>
                <th className="text-right py-2.5 px-3">Solde</th>
              </tr>
            </thead>
            <tbody>
              {byAccount.map((a) => (
                <tr key={a.account} className="border-b border-primary-100/60 dark:border-primary-800/40 table-row-hover">
                  <td className="py-2 px-3 num font-medium">{a.account}</td>
                  <td className="py-2 px-3 truncate max-w-[280px]">{a.label}</td>
                  <td className="text-right py-2 px-3 num">{a.count}</td>
                  <td className="text-right py-2 px-3 num text-success">{fmtFull(a.debit)}</td>
                  <td className="text-right py-2 px-3 num text-error">{fmtFull(a.credit)}</td>
                  <td className="text-right py-2 px-3 num font-semibold">{fmtFull(a.debit - a.credit)}</td>
                </tr>
              ))}
              {byAccount.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-primary-400">Aucune écriture dans cette catégorie pour {currentYear}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {ecrCloture.length > 0 && (
        <ChartCard title="Écritures du 31/12 (clôture)" subtitle="À justifier en annexes" accent={ct.at(1)}>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
                  <th className="text-left py-2 px-3">Journal</th>
                  <th className="text-left py-2 px-3">Pièce</th>
                  <th className="text-left py-2 px-3">Compte</th>
                  <th className="text-left py-2 px-3 min-w-[300px]">Libellé</th>
                  <th className="text-right py-2 px-3 text-success">Débit</th>
                  <th className="text-right py-2 px-3 text-error">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {ecrCloture.slice(0, 50).map((e) => (
                  <tr key={e.id} className="border-b border-primary-100/60 dark:border-primary-800/40 table-row-hover">
                    <td className="py-1.5 px-3"><span className="badge-neutral">{e.journal}</span></td>
                    <td className="py-1.5 px-3 num">{e.piece}</td>
                    <td className="py-1.5 px-3 num">{e.account}</td>
                    <td className="py-1.5 px-3 truncate">{e.label}</td>
                    <td className="text-right py-1.5 px-3 num">{e.debit > 0 ? fmtFull(e.debit) : '—'}</td>
                    <td className="text-right py-1.5 px-3 num">{e.credit > 0 ? fmtFull(e.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
