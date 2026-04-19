// Compliance SYSCOHADA — check-list de conformité comptable
// Vérifie les invariants que tout GL SYSCOHADA doit satisfaire.
import { useMemo } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChartCard } from '../components/ui/ChartCard';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { useBalance, useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { fmtFull } from '../lib/format';

type Check = {
  id: string;
  label: string;
  description: string;
  status: 'ok' | 'warn' | 'fail';
  detail?: string;
  severity: 'critical' | 'major' | 'minor';
};

export default function ComplianceSyscohada() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const balance = useBalance();
  const { bilan, sig, movements } = useStatements();

  const checks = useMemo<Check[]>(() => {
    const c: Check[] = [];

    // 1. Balance équilibrée
    const totD = balance.reduce((s, r) => s + r.debit, 0);
    const totC = balance.reduce((s, r) => s + r.credit, 0);
    const deltaBal = Math.abs(totD - totC);
    c.push({
      id: 'balance_eq',
      label: 'Balance équilibrée (D = C)',
      description: 'La somme des débits doit être égale à la somme des crédits sur l\'ensemble du GL.',
      severity: 'critical',
      status: deltaBal < 1 ? 'ok' : 'fail',
      detail: deltaBal < 1 ? 'Parfaitement équilibrée' : `Écart de ${fmtFull(totD - totC)} XOF`,
    });

    // 2. Bilan équilibré (Actif = Passif)
    const deltaBilan = bilan ? Math.abs(bilan.totalActif - bilan.totalPassif) : 0;
    c.push({
      id: 'bilan_eq',
      label: 'Bilan équilibré (Actif = Passif)',
      description: 'Le Total Actif doit être strictement égal au Total Passif après affectation du résultat.',
      severity: 'critical',
      status: deltaBilan < 1 ? 'ok' : 'fail',
      detail: bilan ? (deltaBilan < 1 ? `Actif = Passif = ${fmtFull(bilan.totalActif)}` : `Écart de ${fmtFull(bilan.totalActif - bilan.totalPassif)} XOF`) : '—',
    });

    // 3. Résultat Bilan = Résultat SIG
    if (bilan && sig) {
      const resBilan = bilan.passif.find((l) => l.code === 'CF')?.value ?? 0;
      const delta = Math.abs(resBilan - sig.resultat);
      c.push({
        id: 'res_coherence',
        label: 'Résultat Bilan ↔ SIG cohérent',
        description: 'Le résultat calculé dans le bilan (classes 6/7) doit matcher celui de la cascade SIG.',
        severity: 'major',
        status: delta < 2 ? 'ok' : 'warn',
        detail: delta < 2 ? 'Cohérence parfaite' : `Écart de ${fmtFull(resBilan - sig.resultat)} XOF`,
      });
    }

    // 4. Classe 1 (capitaux propres) : au moins un 101 (capital social)
    const hasCapital = balance.some((r) => r.account.startsWith('101'));
    c.push({
      id: 'capital',
      label: 'Capital social (101) présent',
      description: 'Toute société SYSCOHADA doit avoir un compte 101 Capital social avec un solde créditeur.',
      severity: 'major',
      status: hasCapital ? 'ok' : 'warn',
      detail: hasCapital ? 'Compte 101 présent' : 'Aucun compte 101 trouvé',
    });

    // 5. Pas de compte dans la "mauvaise" classe
    const class8Fail = balance.filter((r) => r.account.startsWith('8') && r.account.length === 1).length;
    c.push({
      id: 'no_class_only',
      label: 'Pas de comptes racine seule',
      description: 'Les écritures ne devraient pas être passées sur un code de classe seul (ex: "8"), mais sur un compte détaillé.',
      severity: 'minor',
      status: class8Fail === 0 ? 'ok' : 'warn',
      detail: class8Fail === 0 ? 'Aucun compte racine seule' : `${class8Fail} compte(s) racine`,
    });

    // 6. Écritures sur comptes non-mappés SYSCOHADA
    const unmapped = balance.filter((r) => !r.syscoCode).length;
    c.push({
      id: 'mapping',
      label: 'Mapping SYSCOHADA complet',
      description: 'Tous les comptes mouvementés doivent être mappés vers un compte SYSCOHADA de référence.',
      severity: 'major',
      status: unmapped === 0 ? 'ok' : (unmapped < 5 ? 'warn' : 'fail'),
      detail: unmapped === 0 ? 'Tous les comptes mappés' : `${unmapped} compte(s) non mappé(s)`,
    });

    // 7. Comptes classe 6 à solde créditeur anormal
    const c6Cred = balance.filter((r) => r.account.startsWith('6') && r.soldeC > 1000).length;
    c.push({
      id: 'c6_sign',
      label: 'Classe 6 avec sens normal (débit)',
      description: 'Les charges (classe 6) doivent avoir un solde débiteur. Un solde créditeur > 1 000 est anormal.',
      severity: 'major',
      status: c6Cred === 0 ? 'ok' : 'warn',
      detail: c6Cred === 0 ? 'Tous les comptes 6 en débit' : `${c6Cred} compte(s) 6 en crédit anormal`,
    });

    // 8. Comptes classe 7 à solde débiteur anormal
    const c7Deb = balance.filter((r) => r.account.startsWith('7') && r.soldeD > 1000).length;
    c.push({
      id: 'c7_sign',
      label: 'Classe 7 avec sens normal (crédit)',
      description: 'Les produits (classe 7) doivent avoir un solde créditeur. Un solde débiteur > 1 000 est anormal.',
      severity: 'major',
      status: c7Deb === 0 ? 'ok' : 'warn',
      detail: c7Deb === 0 ? 'Tous les comptes 7 en crédit' : `${c7Deb} compte(s) 7 en débit anormal`,
    });

    // 9. TVA collectée (443) créditrice, TVA déductible (445) débitrice
    const tva443Deb = balance.filter((r) => r.account.startsWith('443') && r.soldeD > 100).length;
    const tva445Cred = balance.filter((r) => r.account.startsWith('445') && r.soldeC > 100).length;
    const tvaOk = tva443Deb === 0 && tva445Cred === 0;
    c.push({
      id: 'tva',
      label: 'TVA — sens normal (443 C / 445 D)',
      description: '443 État TVA facturée doit être créditrice, 445 TVA déductible doit être débitrice.',
      severity: 'minor',
      status: tvaOk ? 'ok' : 'warn',
      detail: tvaOk ? 'TVA cohérente' : 'Anomalies sur 443 ou 445',
    });

    // 10. Écritures avec libellé vide
    const emptyLabels = movements.filter((r) => !r.label || r.label === '—').length;
    c.push({
      id: 'labels',
      label: 'Libellés renseignés',
      description: 'Toutes les écritures devraient avoir un libellé explicatif.',
      severity: 'minor',
      status: emptyLabels === 0 ? 'ok' : 'warn',
      detail: emptyLabels === 0 ? 'Tous les libellés renseignés' : `${emptyLabels} compte(s) sans libellé`,
    });

    return c;
  }, [balance, bilan, sig, movements]);

  const okCount = checks.filter((c) => c.status === 'ok').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const score = Math.round((okCount / checks.length) * 100);

  const scoreColor = score >= 90 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Link to="/dashboards" className="btn-ghost text-sm"><ArrowLeft className="w-4 h-4" /> Catalogue</Link>
      </div>

      <DashHeader
        icon="✓"
        title="Compliance SYSCOHADA"
        subtitle={`Audit automatique de conformité — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="Score conformité" value={`${score} %`} icon={<Shield className="w-4 h-4" />} color={scoreColor} subValue={score >= 90 ? 'Excellent' : score >= 70 ? 'À améliorer' : 'Critique'} />
        <KPICard title="Contrôles OK" value={String(okCount)} subValue={`sur ${checks.length}`} icon={<CheckCircle2 className="w-4 h-4" />} color="#22c55e" />
        <KPICard title="Avertissements" value={String(warnCount)} icon={<AlertTriangle className="w-4 h-4" />} color="#f59e0b" />
        <KPICard title="Échecs critiques" value={String(failCount)} icon={<XCircle className="w-4 h-4" />} color="#ef4444" />
      </div>

      <ChartCard
        title="Check-list de conformité"
        subtitle={`${checks.length} points de contrôle SYSCOHADA appliqués au Grand Livre`}
        accent={scoreColor}
      >
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-primary-100/40 dark:hover:bg-primary-900/30 transition">
              <div className="shrink-0 mt-0.5">
                {c.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-success" />}
                {c.status === 'warn' && <AlertTriangle className="w-4 h-4 text-warning" />}
                {c.status === 'fail' && <XCircle className="w-4 h-4 text-error" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{c.label}</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold ${c.severity === 'critical' ? 'bg-error/15 text-error' : c.severity === 'major' ? 'bg-warning/15 text-warning' : 'bg-primary-200 dark:bg-primary-800 text-primary-600 dark:text-primary-300'}`}>
                    {c.severity}
                  </span>
                </div>
                <p className="text-[11px] text-primary-500 mt-0.5">{c.description}</p>
                {c.detail && (
                  <p className={`text-[11px] mt-1 num ${c.status === 'ok' ? 'text-success' : c.status === 'warn' ? 'text-warning' : 'text-error'}`}>{c.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </ChartCard>

      <p className="text-[11px] text-primary-500 italic mt-3">
        Les contrôles marqués <strong>critical</strong> doivent être résolus avant clôture de l'exercice.
        Les <strong>major</strong> affectent la lecture des états financiers. Les <strong>minor</strong> sont des bonnes pratiques.
      </p>
    </div>
  );
}
