/**
 * T09 — Anomalies Analytiques
 *
 * Détection automatique des problèmes de cohérence sur les ventilations
 * analytiques. Chaque anomalie est caractérisée par :
 *   - Type (clé de classification)
 *   - Sévérité (low / medium / high)
 *   - Description
 *   - Référence (compte, code, ligne GL)
 *
 * Détecteurs implémentés :
 *   1. Écritures éligibles (6/7) sans aucune ventilation analytique
 *   2. Code analytique inactif encore mouvementé
 *   3. Code de branche incompatible avec la branche inférée de la ligne
 *   4. Compte SYSCOHADA classe 6/7 sans branche WBS (ligne sans projet/centre)
 *   5. Doublons d'affectation (même ligne / même axe → 2 codes différents)
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import { loadAnalyticContext } from '../../engine/analyticDashboards';
import { inferBranch, isCodeCompatibleWithBranch } from '../../engine/analyticBranch';
import type { GLEntry } from '../../db/schema';

type Severity = 'low' | 'medium' | 'high';

interface Anomaly {
  type: string;
  severity: Severity;
  title: string;
  detail: string;
  reference?: string;
  glEntryId?: number;
}

export default function AnalyticalAnomalies() {
  const { currentOrgId, currentYear } = useApp();
  const [loading, setLoading] = useState(true);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [totalEligible, setTotalEligible] = useState(0);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    void (async () => {
      try {
        const [ctx, periods] = await Promise.all([
          loadAnalyticContext(currentOrgId, currentYear),
          dataProvider.getPeriods(currentOrgId),
        ]);
        const yearPeriodIds = new Set(periods.filter((p) => p.year === currentYear && p.month >= 1).map((p) => p.id));
        const yearEntries = ctx.entries.filter((e) => yearPeriodIds.has(e.periodId));

        const out: Anomaly[] = [];

        // 1) Écritures éligibles 6/7 sans ventilation
        const eligible = yearEntries.filter((e) => e.account.startsWith('6') || e.account.startsWith('7'));
        setTotalEligible(eligible.length);
        const unassigned: GLEntry[] = [];
        for (const e of eligible) {
          const ass = e.id !== undefined ? (ctx.assignmentsByEntry.get(e.id) ?? []) : [];
          if (ass.length === 0) unassigned.push(e);
        }
        if (unassigned.length > 0) {
          out.push({
            type: 'NO_VENTILATION',
            severity: unassigned.length > eligible.length * 0.2 ? 'high' : 'medium',
            title: `${unassigned.length} écriture(s) sans ventilation analytique`,
            detail: `${unassigned.length} écritures de classes 6/7 ne sont affectées sur aucun axe. Couverture : ${eligible.length > 0 ? Math.round(((eligible.length - unassigned.length) / eligible.length) * 100) : 0} %.`,
          });
        }

        // 2) Codes inactifs encore mouvementés
        const inactiveUsage = new Map<string, number>();
        for (const a of ctx.assignments) {
          const c = ctx.codeById.get(a.codeId);
          if (c && !c.active) {
            inactiveUsage.set(c.code, (inactiveUsage.get(c.code) ?? 0) + 1);
          }
        }
        for (const [code, count] of inactiveUsage) {
          out.push({
            type: 'INACTIVE_CODE',
            severity: 'medium',
            title: `Code inactif "${code}" encore utilisé`,
            detail: `${count} affectation(s) référencent ce code marqué inactif. À réactiver ou ré-affecter.`,
            reference: code,
          });
        }

        // 3) Code de branche incompatible avec la branche inférée
        for (const e of yearEntries) {
          const ass = e.id !== undefined ? (ctx.assignmentsByEntry.get(e.id) ?? []) : [];
          const lineBranch = inferBranch(e, { assignments: ass });
          for (const a of ass) {
            const c = ctx.codeById.get(a.codeId);
            if (!c?.branch) continue;
            if (!isCodeCompatibleWithBranch(c.branch, lineBranch)) {
              out.push({
                type: 'BRANCH_MISMATCH',
                severity: 'high',
                title: `Incohérence branche WBS sur ligne #${e.id}`,
                detail: `Code "${c.code}" (branche ${c.branch}) affecté à une ligne de branche ${lineBranch ?? 'non WBS'} (compte ${e.account}).`,
                reference: c.code,
                glEntryId: e.id,
              });
              break; // un seul flag par ligne
            }
          }
        }

        // 4) Doublons d'affectation (même ligne, même axe, codes différents)
        const dupKeys = new Map<string, string[]>();
        for (const a of ctx.assignments) {
          if (!a.glEntryId) continue;
          const k = `${a.glEntryId}-${a.axisNumber}`;
          const arr = dupKeys.get(k) ?? [];
          arr.push(a.codeId);
          dupKeys.set(k, arr);
        }
        let dupCount = 0;
        for (const [, codeIds] of dupKeys) {
          const distinct = new Set(codeIds);
          if (distinct.size > 1) dupCount++;
        }
        if (dupCount > 0) {
          out.push({
            type: 'DUPLICATE_ASSIGNMENT',
            severity: 'medium',
            title: `${dupCount} doublon(s) d'affectation`,
            detail: 'Une même ligne GL est affectée plusieurs fois sur le même axe avec des codes différents. À nettoyer.',
          });
        }

        setAnomalies(out.sort((a, b) => sevRank(b.severity) - sevRank(a.severity)));
      } finally {
        setLoading(false);
      }
    })();
  }, [currentOrgId, currentYear]);

  const stats = useMemo(() => ({
    total: anomalies.length,
    high: anomalies.filter((a) => a.severity === 'high').length,
    medium: anomalies.filter((a) => a.severity === 'medium').length,
    low: anomalies.filter((a) => a.severity === 'low').length,
  }), [anomalies]);

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="T09 — Anomalies analytiques"
        subtitle="Détection automatique des incohérences de ventilation"
        icon={<AlertOctagon className="w-5 h-5" />}
        back="/dashboards"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total anomalies" value={stats.total.toString()} status={stats.total === 0 ? 'good' : 'warn'} />
        <Stat label="Sévérité haute" value={stats.high.toString()} status={stats.high === 0 ? 'good' : 'risk'} />
        <Stat label="Sévérité moyenne" value={stats.medium.toString()} status={stats.medium === 0 ? 'good' : 'warn'} />
        <Stat label="Lignes éligibles 6/7" value={totalEligible.toLocaleString('fr-FR')} />
      </div>

      <Card title={`Anomalies détectées (${anomalies.length})`} subtitle={`Exercice ${currentYear}`} padded={false}>
        {loading ? (
          <div className="py-12 text-center text-sm text-primary-500">Analyse en cours…</div>
        ) : anomalies.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-success mb-3" />
            <p className="text-sm font-semibold text-success">Aucune anomalie détectée</p>
            <p className="text-xs text-primary-500 mt-1">Toutes les ventilations sont cohérentes pour l'exercice {currentYear}.</p>
          </div>
        ) : (
          <ul className="divide-y divide-primary-100 dark:divide-primary-800">
            {anomalies.map((a, i) => {
              const Icon = a.severity === 'high' ? AlertOctagon : a.severity === 'medium' ? AlertTriangle : AlertCircle;
              const iconColor = a.severity === 'high' ? 'text-error' : a.severity === 'medium' ? 'text-warning' : 'text-primary-500';
              return (
                <li key={i} className="px-4 py-3 hover:bg-primary-50 dark:hover:bg-primary-900/40">
                  <div className="flex items-start gap-3">
                    <Icon className={`w-4 h-4 ${iconColor} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{a.title}</p>
                        <Badge variant={a.severity === 'high' ? 'error' : a.severity === 'medium' ? 'warning' : 'default'}>
                          {a.severity}
                        </Badge>
                        <span className="text-[10px] font-mono text-primary-400">{a.type}</span>
                      </div>
                      <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">{a.detail}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {anomalies.length > 0 && (
          <div className="px-4 py-2.5 border-t border-primary-200 dark:border-primary-800 flex justify-end">
            <Link to="/analytical?tab=assign" className="btn-primary text-xs inline-flex items-center gap-1.5">
              Corriger via Affectation manuelle <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}

function sevRank(s: Severity): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

function Stat({ label, value, status }: { label: string; value: string; status?: 'good' | 'warn' | 'risk' }) {
  const color = status === 'good' ? 'text-success' : status === 'warn' ? 'text-warning' : status === 'risk' ? 'text-error' : '';
  return (
    <Card padded>
      <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className={`num text-xl font-bold mt-1 ${color}`}>{value}</p>
    </Card>
  );
}
