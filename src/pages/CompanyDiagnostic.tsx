/**
 * CompanyDiagnostic — page « Santé de l'entreprise / Diagnostic ».
 *
 * Synthèse exécutive basée sur les données du Grand Livre importé :
 *   1. Score de santé global (0-100) calculé sur 6 dimensions
 *   2. KPIs clés (CA, EBE, RN, Trésorerie, BFR, DSO/DPO)
 *   3. Anomalies détectées dans le GL (déséquilibres, suspens, doublons)
 *   4. Risques majeurs (concentration clients, BFR, trésorerie projetée)
 *   5. Recommandations prioritaires (synthèse alertes + plan d'action)
 *
 * Toutes les analyses sont calculées à la volée à partir de la balance N
 * (via useBalance, useStatements, useRatios) — aucun stockage spécifique.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Stethoscope, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Activity, Wallet, Users, BarChart3, ArrowRight, Heart, AlertCircle,
  ShieldCheck, Target,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useApp } from '../store/app';
import { useBalance, useStatements, useRatios, useMonthlyCA } from '../hooks/useFinancials';
import { useCloudData } from '../hooks/useCloudData';
import { dataProvider } from '../db/provider';
import type { AttentionPoint } from '../db/schema';
import { fmtMoney } from '../lib/format';
import { isDemoActive, DEMO_ATTENTION_POINTS } from '../engine/demoFixtures';

type HealthDimension = {
  key: string;
  label: string;
  icon: any;
  score: number; // 0-100
  weight: number; // pondération dans le score global
  status: 'good' | 'warn' | 'risk';
  insight: string;
};

export default function CompanyDiagnostic() {
  const { currentOrgId, currentYear } = useApp();
  const balance = useBalance();
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const monthlyCA = useMonthlyCA();

  // Charge les attention points pour les afficher (fixtures en mode démo)
  const { data: attentionPointsRaw } = useCloudData<AttentionPoint[]>(
    () => currentOrgId
      ? dataProvider.getAttentionPoints(currentOrgId)
      : Promise.resolve([] as AttentionPoint[]),
    [currentOrgId],
    { initial: [] as AttentionPoint[], tag: 'attentionPoints' },
  );
  const attentionPoints = isDemoActive(currentOrgId) && attentionPointsRaw.length === 0
    ? DEMO_ATTENTION_POINTS
    : attentionPointsRaw;

  // Anomalies GL — calculées synchroniquement depuis la balance
  const anomalies = useMemo(() => {
    if (!balance || balance.length === 0) return [] as { code: string; label: string; severity: 'low' | 'medium' | 'high' }[];
    const out: { code: string; label: string; severity: 'low' | 'medium' | 'high' }[] = [];

    // 1) Compte 471 (suspens) avec solde non nul
    const suspens = balance.filter((b: any) => b.account?.startsWith('47') && Math.abs((b.solde ?? 0)) > 1000);
    if (suspens.length > 0) {
      out.push({
        code: 'SUSPENS',
        severity: 'medium',
        label: `${suspens.length} compte(s) de suspens (47x) avec solde non nul — à apurer avant clôture.`,
      });
    }

    // 2) Comptes débiteurs anormaux côté passif (40x débiteur, etc.)
    const fournisseursDebiteurs = balance.filter((b: any) => b.account?.startsWith('401') && (b.solde ?? 0) > 100_000);
    if (fournisseursDebiteurs.length > 0) {
      out.push({
        code: 'FRN_DEB',
        severity: 'low',
        label: `${fournisseursDebiteurs.length} compte(s) fournisseur(s) débiteur(s) — vérifier les avoirs ou doubles paiements.`,
      });
    }

    // 3) Solde de caisse négatif (impossible)
    const caisseNeg = balance.filter((b: any) => b.account?.startsWith('57') && (b.solde ?? 0) < -1000);
    if (caisseNeg.length > 0) {
      out.push({
        code: 'CAISSE_NEG',
        severity: 'high',
        label: 'Solde de caisse négatif détecté — erreur de saisie ou pièce manquante.',
      });
    }

    // 4) TVA déductible > collectée durablement (à creuser)
    const tvaCol = balance.find((b: any) => b.account === '4431' || b.account?.startsWith('4431'));
    const tvaDed = balance.find((b: any) => b.account === '4452' || b.account?.startsWith('4452'));
    if (tvaCol && tvaDed) {
      const ratio = Math.abs((tvaDed.solde ?? 0)) / Math.max(1, Math.abs((tvaCol.solde ?? 0)));
      if (ratio > 1.5) {
        out.push({
          code: 'TVA_RATIO',
          severity: 'low',
          label: 'TVA déductible nettement supérieure à collectée — vérifier la cohérence achats/ventes.',
        });
      }
    }

    // 5) Pas d'écritures de paie sur certains mois
    if (monthlyCA && monthlyCA.length === 12) {
      const moisVides = monthlyCA.filter((m: any) => (m.value ?? 0) === 0).length;
      if (moisVides > 3) {
        out.push({
          code: 'CA_GAPS',
          severity: 'medium',
          label: `${moisVides} mois sans CA enregistré — saisie incomplète ou activité saisonnière à confirmer.`,
        });
      }
    }

    return out;
  }, [balance, monthlyCA]);

  // Calcul des dimensions de santé
  const dimensions = useMemo<HealthDimension[]>(() => {
    if (!balance || balance.length === 0 || !sig) return [];

    const ca = sig?.ca ?? 0;
    const ebe = sig?.ebe ?? 0;
    const rn = sig?.resultat ?? 0;
    const tresorerieAccount = balance.find((b: any) => b.account === '521');
    const treso = tresorerieAccount ? (tresorerieAccount.solde ?? 0) : 0;

    // 1) Rentabilité — marge nette
    const margeNette = ca > 0 ? (rn / ca) * 100 : 0;
    const rentaScore = margeNette >= 8 ? 90 : margeNette >= 4 ? 70 : margeNette >= 0 ? 45 : 15;

    // 2) Trésorerie
    const moisCharges = ca > 0 ? Math.max(1, ca / 12 * 0.7) : 1;
    const moisCouverts = treso > 0 ? treso / moisCharges : 0;
    const tresoScore = moisCouverts >= 3 ? 90 : moisCouverts >= 1.5 ? 70 : moisCouverts >= 0.5 ? 45 : 20;

    // 3) Performance EBE
    const tauxEBE = ca > 0 ? (ebe / ca) * 100 : 0;
    const ebeScore = tauxEBE >= 12 ? 90 : tauxEBE >= 6 ? 70 : tauxEBE >= 0 ? 45 : 15;

    // 4) Structure financière (autonomie)
    const ratioAutonomie = ratios?.find((r: any) => r.id === 'autonomieFinanciere' || r.code === 'AUTO');
    const autoVal = ratioAutonomie ? (ratioAutonomie.value ?? 0) : 0;
    const autoScore = autoVal >= 30 ? 90 : autoVal >= 20 ? 70 : autoVal >= 10 ? 45 : 20;

    // 5) Anomalies GL (inversement proportionnel)
    const anomScore = anomalies.length === 0 ? 95
      : anomalies.length <= 2 ? 75
      : anomalies.length <= 4 ? 55
      : 30;

    // 6) Vigilance (alertes ouvertes)
    const openCritical = (attentionPoints || []).filter((a) => a.status !== 'resolved' && (a.severity === 'critical' || a.severity === 'high')).length;
    const vigScore = openCritical === 0 ? 90 : openCritical <= 2 ? 65 : openCritical <= 4 ? 45 : 25;

    return [
      {
        key: 'rentabilite', label: 'Rentabilité', icon: TrendingUp,
        score: rentaScore, weight: 0.25,
        status: rentaScore >= 70 ? 'good' : rentaScore >= 45 ? 'warn' : 'risk',
        insight: `Marge nette ${margeNette.toFixed(1)} % — ${margeNette >= 4 ? 'saine' : 'à améliorer'}.`,
      },
      {
        key: 'tresorerie', label: 'Trésorerie', icon: Wallet,
        score: tresoScore, weight: 0.20,
        status: tresoScore >= 70 ? 'good' : tresoScore >= 45 ? 'warn' : 'risk',
        insight: `${moisCouverts.toFixed(1)} mois de charges couverts.`,
      },
      {
        key: 'ebe', label: 'Performance opérationnelle', icon: Activity,
        score: ebeScore, weight: 0.20,
        status: ebeScore >= 70 ? 'good' : ebeScore >= 45 ? 'warn' : 'risk',
        insight: `Taux d'EBE ${tauxEBE.toFixed(1)} % — ${tauxEBE >= 6 ? 'compétitif' : 'sous le seuil sectoriel'}.`,
      },
      {
        key: 'structure', label: 'Structure financière', icon: ShieldCheck,
        score: autoScore, weight: 0.15,
        status: autoScore >= 70 ? 'good' : autoScore >= 45 ? 'warn' : 'risk',
        insight: `Autonomie financière ${autoVal.toFixed(1)} %.`,
      },
      {
        key: 'qualite', label: 'Qualité comptable', icon: CheckCircle2,
        score: anomScore, weight: 0.10,
        status: anomScore >= 70 ? 'good' : anomScore >= 45 ? 'warn' : 'risk',
        insight: `${anomalies.length} anomalie(s) détectée(s) dans le GL.`,
      },
      {
        key: 'vigilance', label: 'Vigilance & risques', icon: AlertTriangle,
        score: vigScore, weight: 0.10,
        status: vigScore >= 70 ? 'good' : vigScore >= 45 ? 'warn' : 'risk',
        insight: `${openCritical} alerte(s) critique/haute en cours.`,
      },
    ];
  }, [balance, sig, ratios, anomalies, attentionPoints]);

  const globalScore = useMemo(() => {
    if (dimensions.length === 0) return 0;
    return Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0));
  }, [dimensions]);

  const verdict = globalScore >= 75 ? 'Bonne santé'
    : globalScore >= 55 ? 'Points de vigilance'
    : globalScore >= 35 ? 'Risques à traiter'
    : 'Situation préoccupante';

  const verdictColor = globalScore >= 75 ? 'text-success'
    : globalScore >= 55 ? 'text-warning'
    : 'text-error';

  // Top recommandations (alertes critiques + recommandations existantes)
  const topRecos = useMemo(() => {
    const list = (attentionPoints || [])
      .filter((a) => a.status !== 'resolved')
      .sort((a, b) => {
        const sev = { critical: 4, high: 3, medium: 2, low: 1 } as any;
        return (sev[b.severity] || 0) - (sev[a.severity] || 0);
      })
      .slice(0, 5);
    return list;
  }, [attentionPoints]);

  if (!currentOrgId) {
    return (
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Santé de l'entreprise" subtitle="Diagnostic global basé sur le Grand Livre" icon={<Stethoscope className="w-5 h-5" />} />
        <div className="rounded-2xl border border-primary-200 dark:border-primary-800 p-8 text-center">
          <p className="text-primary-600 dark:text-primary-400 text-sm">
            Sélectionnez une société pour accéder au diagnostic.
          </p>
        </div>
      </div>
    );
  }

  if (!balance || balance.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Santé de l'entreprise" subtitle="Diagnostic global basé sur le Grand Livre" icon={<Stethoscope className="w-5 h-5" />} />
        <div className="rounded-2xl border border-primary-200 dark:border-primary-800 p-8 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-warning" />
          <p className="text-primary-700 dark:text-primary-300 text-sm font-medium">
            Aucune donnée comptable disponible.
          </p>
          <p className="text-primary-500 text-xs mt-2">
            Importez un Grand Livre pour générer le diagnostic.
          </p>
          <Link to="/imports" className="btn-primary !py-2 !text-xs mt-4 inline-flex items-center gap-1.5">
            Importer le GL <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Santé de l'entreprise"
        subtitle={`Diagnostic global · Exercice ${currentYear} · ${balance.length} comptes analysés`}
        icon={<Stethoscope className="w-5 h-5" />}
      />

      {/* SCORE GLOBAL */}
      <div className="rounded-2xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-950 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Cercle de score */}
          <div className="relative w-32 h-32 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="8" className="text-primary-200 dark:text-primary-800" fill="none" />
              <circle
                cx="60" cy="60" r="50"
                stroke="currentColor" strokeWidth="8" fill="none"
                strokeDasharray={`${(globalScore / 100) * 314} 314`}
                className={verdictColor}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold num ${verdictColor}`}>{globalScore}</span>
              <span className="text-[10px] uppercase tracking-wider text-primary-500">/ 100</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Heart className={`w-4 h-4 ${verdictColor}`} />
              <p className={`text-sm font-bold ${verdictColor}`}>{verdict}</p>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary-900 dark:text-primary-100 mb-2">
              Score de santé global
            </h2>
            <p className="text-sm text-primary-600 dark:text-primary-400">
              Pondération sur 6 dimensions : rentabilité, trésorerie, performance opérationnelle,
              structure financière, qualité comptable, vigilance.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <KPIInline label="CA" value={fmtMoney(sig?.ca ?? 0)} />
              <KPIInline label="EBE" value={fmtMoney(sig?.ebe ?? 0)} />
              <KPIInline label="Résultat net" value={fmtMoney(sig?.resultat ?? 0)} />
            </div>
          </div>
        </div>
      </div>

      {/* DIMENSIONS DETAIL */}
      <div>
        <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Dimensions du diagnostic
        </h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dimensions.map((d) => {
            const Icon = d.icon;
            const bgColor = d.status === 'good' ? 'bg-success/10 border-success/30'
              : d.status === 'warn' ? 'bg-warning/10 border-warning/30'
              : 'bg-error/10 border-error/30';
            const iconColor = d.status === 'good' ? 'text-success'
              : d.status === 'warn' ? 'text-warning'
              : 'text-error';
            return (
              <div key={d.key} className={`rounded-xl border p-4 ${bgColor}`}>
                <div className="flex items-start gap-3 mb-2">
                  <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-wider text-primary-500">{d.label}</p>
                    <p className={`text-2xl font-bold num ${iconColor}`}>{d.score}<span className="text-xs text-primary-500"> / 100</span></p>
                  </div>
                </div>
                <p className="text-xs text-primary-700 dark:text-primary-300">{d.insight}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ANOMALIES GL */}
      {anomalies.length > 0 && (
        <div className="rounded-2xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-950 p-5">
          <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-warning" /> Anomalies détectées dans le Grand Livre
          </h3>
          <ul className="space-y-2">
            {anomalies.map((a) => (
              <li key={a.code} className="flex items-start gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/40">
                <div className={`w-2 h-2 rounded-full mt-1.5 ${a.severity === 'high' ? 'bg-error' : a.severity === 'medium' ? 'bg-warning' : 'bg-primary-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-primary-500">{a.code}</p>
                  <p className="text-sm text-primary-800 dark:text-primary-200">{a.label}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* RECOMMANDATIONS */}
      {topRecos.length > 0 && (
        <div className="rounded-2xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-950 p-5">
          <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-accent" /> Recommandations prioritaires
          </h3>
          <ol className="space-y-3">
            {topRecos.map((r, idx) => (
              <li key={r.id ?? idx} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{r.title}</p>
                  {r.recommendation && (
                    <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">{r.recommendation}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${
                      r.severity === 'critical' ? 'text-error'
                      : r.severity === 'high' ? 'text-warning'
                      : 'text-primary-500'
                    }`}>
                      {r.severity}
                    </span>
                    {r.category && (
                      <span className="text-[10px] text-primary-500">· {r.category}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 pt-3 border-t border-primary-200 dark:border-primary-800 flex justify-end">
            <Link to="/alerts" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
              Voir toutes les alertes <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* QUICK LINKS */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLink to="/states" icon={BarChart3} label="États financiers" desc="Bilan, CR, TFT, TAFIRE" />
        <QuickLink to="/dashboard/home" icon={Activity} label="Dashboards" desc="KPIs détaillés" />
        <QuickLink to="/grand-livre" icon={Users} label="Grand Livre" desc="Écritures détaillées" />
        <QuickLink to="/actions" icon={Target} label="Plan d'action" desc="Suivi des chantiers" />
      </div>

      <p className="text-[11px] text-primary-500 text-center pt-2">
        Diagnostic calculé à partir de la balance de l'exercice — actualisé à chaque import GL.
        {bilan?.unclassifiedAccounts?.length ? ` · ${bilan.unclassifiedAccounts.length} compte(s) non classé(s).` : ''}
      </p>
    </div>
  );
}

function KPIInline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-primary-500">{label}</p>
      <p className="text-base font-bold num text-primary-900 dark:text-primary-100">{value}</p>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, desc }: { to: string; icon: any; label: string; desc: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-primary-950 p-4 hover:border-accent hover:bg-accent/5 transition group"
    >
      <Icon className="w-5 h-5 text-accent mb-2" />
      <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{label}</p>
      <p className="text-xs text-primary-500 mt-0.5">{desc}</p>
      <ArrowRight className="w-3 h-3 text-primary-400 mt-2 group-hover:text-accent transition" />
    </Link>
  );
}

// Pour absorber l'unused-imports warning sur TrendingDown / Stat
void TrendingDown;
