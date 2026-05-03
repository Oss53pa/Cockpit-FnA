/**
 * Audit Trail Visuel — liste GL avec hash chain SHA-256 et statut intégrité.
 * Branche le verifyChain() existant pour visualiser la chaîne d'audit.
 */
import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Hash } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { toast } from '../components/ui/Toast';
import { useApp } from '../store/app';
import { db } from '../db/schema';
import { verifyChain } from '../lib/auditHash';
import { fmtFull } from '../lib/format';
import { useCurrentOrg } from '../hooks/useFinancials';

export default function AuditTrailVisualizer() {
  const { currentOrgId } = useApp();
  const org = useCurrentOrg();
  const [entries, setEntries] = useState<any[]>([]);
  const [chainStatus, setChainStatus] = useState<{ valid: boolean; brokenAt?: string; brokenIndex?: number; count: number; finalHash?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!currentOrgId) return;
    db.gl.where('orgId').equals(currentOrgId).sortBy('id').then(setEntries);
  }, [currentOrgId]);

  const runVerify = async () => {
    setVerifying(true);
    try {
      const chain = entries.map((e) => ({
        id: e.id ?? '', date: e.date, journal: e.journal, piece: e.piece,
        account: e.account, label: e.label, debit: e.debit, credit: e.credit,
        tiers: e.tiers, hash: e.hash, previousHash: e.previousHash,
      }));
      const result = await verifyChain(chain);
      setChainStatus(result);
      if (result.valid) toast.success('Chaîne validée', `${result.count} écritures · SHA-256 cohérent`);
      else toast.error('Altération détectée', `Écriture #${result.brokenAt}`);
    } finally { setVerifying(false); }
  };

  const withHash = entries.filter((e) => e.hash);
  const withoutHash = entries.length - withHash.length;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/audit-trail" />
      <PageHeader
        title="Audit Trail Visuel"
        subtitle={`${org?.name ?? '—'} · Chaînage SHA-256 des écritures GL · Conformité SYSCOHADA art. 17`}
        action={
          <button className="btn-primary" onClick={runVerify} disabled={verifying || entries.length === 0}>
            <ShieldCheck className="w-4 h-4" /> {verifying ? 'Vérification…' : 'Vérifier la chaîne'}
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          variant={chainStatus?.valid ? 'hero' : 'default'}
          title="Statut chaîne"
          value={chainStatus ? (chainStatus.valid ? 'Valide ✓' : 'Cassée ⚠') : 'Non vérifiée'}
          icon={chainStatus?.valid ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          subValue={chainStatus ? `${chainStatus.count} écritures vérifiées` : 'Cliquez Vérifier'}
        />
        <KPICard title="Total écritures" value={String(entries.length)} icon={<Hash className="w-4 h-4" />} subValue={`${withHash.length} signées`} />
        <KPICard title="Écritures signées" value={String(withHash.length)} icon={<ShieldCheck className="w-4 h-4" />} subValue={`${entries.length ? Math.round((withHash.length / entries.length) * 100) : 0}% couverture`} />
        <KPICard title="Sans hash" value={String(withoutHash)} icon={<ShieldAlert className="w-4 h-4" />} subValue="Antérieures à l'audit trail" inverse />
      </div>

      {chainStatus && !chainStatus.valid && (
        <div className="card p-4 border-l-4 border-error bg-error/5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-error mt-0.5" />
            <div>
              <p className="font-semibold text-error">Altération détectée à l'écriture #{chainStatus.brokenAt}</p>
              <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                Position {chainStatus.brokenIndex} dans la chaîne. Une modification a posteriori a invalidé le hash SHA-256.
                Investigation requise — consulter le journal d'audit.
              </p>
            </div>
          </div>
        </div>
      )}

      <ChartCard title="Chaîne d'écritures" subtitle="100 dernières · hash + chaînage previousHash">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
                <th className="text-left py-2 px-3">ID</th>
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-left py-2 px-3">Compte</th>
                <th className="text-left py-2 px-3">Libellé</th>
                <th className="text-right py-2 px-3">Débit</th>
                <th className="text-right py-2 px-3">Crédit</th>
                <th className="text-left py-2 px-3 min-w-[130px]">Hash (8 premiers)</th>
                <th className="text-center py-2 px-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(-100).reverse().map((e, i) => {
                const isBroken = chainStatus?.brokenAt === String(e.id);
                return (
                  <tr key={e.id ?? i} className={`border-b border-primary-100/60 dark:border-primary-800/40 ${isBroken ? 'bg-error/10' : 'table-row-hover'}`}>
                    <td className="py-1.5 px-3 num text-primary-500">{e.id}</td>
                    <td className="py-1.5 px-3 num">{e.date}</td>
                    <td className="py-1.5 px-3 num">{e.account}</td>
                    <td className="py-1.5 px-3 truncate max-w-[200px]">{e.label}</td>
                    <td className="text-right py-1.5 px-3 num">{e.debit > 0 ? fmtFull(e.debit) : '—'}</td>
                    <td className="text-right py-1.5 px-3 num">{e.credit > 0 ? fmtFull(e.credit) : '—'}</td>
                    <td className="py-1.5 px-3 font-mono text-[10px] text-primary-500">
                      {e.hash ? e.hash.substring(0, 8) + '…' : <span className="text-primary-300">absent</span>}
                    </td>
                    <td className="text-center py-1.5 px-3">
                      {isBroken ? <ShieldAlert className="w-3.5 h-3.5 text-error inline" />
                        : e.hash ? <ShieldCheck className="w-3.5 h-3.5 text-success inline" />
                        : <span className="text-primary-300 text-[10px]">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
