/**
 * Bank Reconciliation — réconciliation bancaire mensuelle.
 * Compare le solde GL banque (compte 521) vs le solde du relevé bancaire saisi
 * par l'utilisateur, avec écart automatique et liste des écritures non lettrées.
 */
import { useEffect, useMemo, useState } from 'react';
import { Banknote, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useCurrentOrg } from '../hooks/useFinancials';
import { SEMANTIC } from '../lib/semantic';

export default function BankReconciliationPage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [bankAccounts, setBankAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [statementBalance, setStatementBalance] = useState<string>('');
  const [glEntries, setGlEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    db.gl.where('orgId').equals(currentOrgId).toArray().then((entries) => {
      const banks = Array.from(new Set(entries.filter((e) => e.account.startsWith('521') || e.account.startsWith('522')).map((e) => e.account)));
      setBankAccounts(banks);
      if (banks[0]) setSelectedAccount(banks[0]);
      setGlEntries(entries);
    });
  }, [currentOrgId, currentYear]);

  // Calcul du solde GL pour le compte sélectionné
  const glBalance = useMemo(() => {
    if (!selectedAccount) return 0;
    return glEntries
      .filter((e) => e.account === selectedAccount)
      .reduce((s, e) => s + e.debit - e.credit, 0);
  }, [glEntries, selectedAccount]);

  const stmtBalance = parseFloat(statementBalance) || 0;
  const ecart = glBalance - stmtBalance;
  const reconcilie = Math.abs(ecart) < 1;

  // Liste des écritures du compte (à lettrer)
  const entriesAccount = useMemo(() => {
    if (!selectedAccount) return [];
    return glEntries
      .filter((e) => e.account === selectedAccount)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);
  }, [glEntries, selectedAccount]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/bank-reconciliation" />
      <PageHeader
        title="Réconciliation bancaire"
        subtitle={`${org?.name ?? '—'} · Comparaison GL / relevé bancaire`}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartCard title="Compte bancaire" accent={ct.accent}>
          <select className="input" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}>
            {bankAccounts.length === 0 && <option>Aucun compte 52x trouvé</option>}
            {bankAccounts.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="text-xs text-primary-500 mt-2">{entriesAccount.length} écritures sur ce compte</p>
        </ChartCard>

        <ChartCard title="Solde du relevé bancaire" accent={ct.at(2)}>
          <input
            type="number"
            className="input num"
            value={statementBalance}
            onChange={(e) => setStatementBalance(e.target.value)}
            placeholder="Saisir le solde du relevé"
          />
          <p className="text-xs text-primary-500 mt-2">Solde au {new Date().toLocaleDateString('fr-FR')}</p>
        </ChartCard>

        <ChartCard title="Statut" accent={reconcilie ? SEMANTIC.success : SEMANTIC.danger}>
          {reconcilie ? (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold">Comptes réconciliés ✓</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-error">
              <AlertTriangle className="w-5 h-5 mt-0.5" />
              <div>
                <p className="font-semibold">Écart détecté</p>
                <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">{stmtBalance === 0 ? 'Saisir le solde du relevé' : `${fmtFull(Math.abs(ecart))} XOF`}</p>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          variant="hero"
          title="Solde GL"
          value={fmtK(glBalance)}
          unit="XOF"
          icon={<Banknote className="w-5 h-5" strokeWidth={2} />}
          subValue={`Compte ${selectedAccount}`}
        />
        <KPICard title="Solde relevé" value={fmtK(stmtBalance)} unit="XOF" icon={<Banknote className="w-4 h-4" />} subValue="Saisi manuellement" />
        <KPICard
          title="Écart"
          value={fmtK(ecart)}
          unit="XOF"
          icon={<AlertTriangle className="w-4 h-4" />}
          subValue={reconcilie ? '✓ Réconcilié' : 'À analyser'}
          inverse
        />
      </div>

      <ChartCard title="Écritures du compte" subtitle="30 dernières (par date décroissante)" accent={ct.at(1)}>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-left py-2 px-3">Journal</th>
                <th className="text-left py-2 px-3">Pièce</th>
                <th className="text-left py-2 px-3 min-w-[300px]">Libellé</th>
                <th className="text-right py-2 px-3 text-success">Débit</th>
                <th className="text-right py-2 px-3 text-error">Crédit</th>
                <th className="text-center py-2 px-3">Lettrage</th>
              </tr>
            </thead>
            <tbody>
              {entriesAccount.map((e) => (
                <tr key={e.id} className="border-b border-primary-100/60 dark:border-primary-800/40 table-row-hover">
                  <td className="py-1.5 px-3 num">{e.date}</td>
                  <td className="py-1.5 px-3"><span className="badge-neutral">{e.journal}</span></td>
                  <td className="py-1.5 px-3 num text-primary-500">{e.piece}</td>
                  <td className="py-1.5 px-3 truncate">{e.label}</td>
                  <td className="text-right py-1.5 px-3 num text-success">{e.debit > 0 ? fmtFull(e.debit) : '—'}</td>
                  <td className="text-right py-1.5 px-3 num text-error">{e.credit > 0 ? fmtFull(e.credit) : '—'}</td>
                  <td className="text-center py-1.5 px-3 text-xs">
                    {e.lettrage ? <span className="badge-success">{e.lettrage}</span> : <span className="text-primary-300">—</span>}
                  </td>
                </tr>
              ))}
              {entriesAccount.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-primary-400">Aucune écriture sur ce compte</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
