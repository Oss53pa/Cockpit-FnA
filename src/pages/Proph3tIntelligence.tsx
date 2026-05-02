/**
 * Proph3t Intelligence — Page dédiée aux capacités avancées :
 *  - Contexte temporel (phase de l'exercice, recommandations contextuelles)
 *  - Prédictions rapides (run-rate, tendances mémorisées)
 *  - Corrections automatiques (déséquilibres, doublons, signes inversés)
 *  - Suggestions intelligentes pondérées par priorité
 *  - Audit comprehensive (intégrité, cohérence, arithmétique)
 *  - Insights agrégés
 *
 * Tout est calculé en temps réel à partir du Grand Livre — aucune donnée hardcodée.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Brain, Calendar, AlertOctagon, Lightbulb, ShieldCheck,
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, Clock, RefreshCw, ArrowRight,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ChartCard } from '../components/ui/ChartCard';
import { KPICard } from '../components/ui/KPICardV2';
import { useApp } from '../store/app';
import { useCurrentOrg } from '../hooks/useFinancials';
import { runIntelligenceAnalysis, type IntelligenceReport } from '../engine/proph3/intelligence';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import clsx from 'clsx';

const PHASE_LABEL = { opening: 'Ouverture', mid: 'Plein exercice', closing: 'Clôture', past: 'Clos' };
const PHASE_COLOR = { opening: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', mid: 'bg-success/10 text-success', closing: 'bg-warning/10 text-warning', past: 'bg-primary-500/10 text-primary-700 dark:text-primary-300' };

export default function Proph3tIntelligencePage() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const ct = useChartTheme();
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!currentOrgId) return;
    setLoading(true); setError(null);
    try {
      const r = await runIntelligenceAnalysis(currentOrgId, currentYear);
      setReport(r);
    } catch (e: any) {
      setError(e.message ?? 'Analyse impossible');
    } finally { setLoading(false); }
  };

  useEffect(() => { run(); /* eslint-disable-next-line */ }, [currentOrgId, currentYear]);

  const counts = useMemo(() => {
    if (!report) return { p0: 0, p1: 0, p2: 0, critiques: 0, warnings: 0 };
    return {
      p0: report.suggestions.filter((s) => s.priority === 'P0').length,
      p1: report.suggestions.filter((s) => s.priority === 'P1').length,
      p2: report.suggestions.filter((s) => s.priority === 'P2').length,
      critiques: report.corrections.filter((c) => c.severity === 'critical').length,
      warnings: report.corrections.filter((c) => c.severity === 'warn').length,
    };
  }, [report]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Proph3t · Intelligence avancée"
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · Date-aware · Predict · Correct · Suggest · Audit`}
        action={
          <button className="btn-outline" onClick={run} disabled={loading}>
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /> Recalculer
          </button>
        }
      />

      {loading && <div className="py-20 text-center text-primary-400 text-sm">Analyse Proph3t en cours…</div>}
      {error && <Card className="p-4 border-error/30 bg-error/5"><p className="text-sm text-error">⚠ {error}</p></Card>}

      {!loading && report && (
        <>
          {/* KPI Hero — 4 indicateurs synthétiques */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KPICard
              variant="hero"
              title="Score d'audit global"
              value={`${report.audit.globalScore}`}
              unit="/100"
              icon={<ShieldCheck className="w-5 h-5" strokeWidth={2} />}
              subValue={`${report.audit.passed} contrôles passés / ${report.audit.totalChecks}`}
            />
            <KPICard
              title="Phase de l'exercice"
              value={PHASE_LABEL[report.context.phase]}
              icon={<Calendar className="w-4 h-4" strokeWidth={2} />}
              subValue={`${report.context.progressPct.toFixed(0)} % écoulé · ${Math.abs(report.context.closingProximityWeeks)} sem ${report.context.closingProximityWeeks > 0 ? 'avant' : 'après'} clôture`}
            />
            <KPICard
              title="Actions prioritaires"
              value={String(counts.p0 + counts.p1)}
              icon={<Lightbulb className="w-4 h-4" strokeWidth={2} />}
              subValue={`${counts.p0} P0 (urgent) · ${counts.p1} P1 (important)`}
              inverse
            />
            <KPICard
              title="Corrections requises"
              value={String(counts.critiques + counts.warnings)}
              icon={<AlertOctagon className="w-4 h-4" strokeWidth={2} />}
              subValue={`${counts.critiques} critiques · ${counts.warnings} avertissements`}
              inverse
            />
          </div>

          {/* Insights agrégés */}
          {report.insights.length > 0 && (
            <Card className="p-5 border-l-4 border-l-accent">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Insights clés
              </div>
              <ul className="space-y-2">
                {report.insights.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-primary-800 dark:text-primary-200">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-accent/10 text-accent text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Recommandations contextuelles temporelles */}
          <ChartCard title="Recommandations contextuelles" subtitle={`Adaptées à la phase "${PHASE_LABEL[report.context.phase]}" de l'exercice`} accent={ct.at(2)}>
            <div className={clsx('inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4', PHASE_COLOR[report.context.phase])}>
              <Clock className="w-3.5 h-3.5" />
              {PHASE_LABEL[report.context.phase]} · {report.context.daysSinceYearStart} jours écoulés / {report.context.daysInYear}
            </div>
            <ul className="space-y-2">
              {report.context.recommendations.map((reco, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-accent" />
                  <span className="leading-relaxed text-primary-700 dark:text-primary-300">{reco}</span>
                </li>
              ))}
            </ul>
          </ChartCard>

          {/* Prédictions rapides */}
          {report.predictions.length > 0 && (
            <ChartCard title="Prédictions rapides" subtitle="Run-rate annualisé + tendances mémorisées" accent={ct.accent}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {report.predictions.map((p) => (
                  <div key={p.metric} className="border border-primary-200 dark:border-primary-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold">{p.metric}</p>
                      <span className={clsx(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                        p.confidence === 'high' ? 'bg-success/10 text-success' : p.confidence === 'medium' ? 'bg-warning/10 text-warning' : 'bg-primary-200/60 text-primary-600',
                      )}>{p.confidence}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="num text-xl font-bold">{fmtK(p.predicted)}</span>
                      <span className={clsx('text-xs font-semibold', p.variation > 0 ? 'text-success' : p.variation < 0 ? 'text-error' : 'text-primary-500')}>
                        {p.variation > 0 ? '+' : ''}{p.variation.toFixed(1)} %
                      </span>
                    </div>
                    <p className="text-[11px] text-primary-500 mt-1">Actuel : {fmtFull(p.current)} · Horizon : {p.horizon}</p>
                    <p className="text-[11px] text-primary-400 mt-1.5 italic">{p.comment}</p>
                  </div>
                ))}
              </div>
            </ChartCard>
          )}

          {/* Suggestions intelligentes */}
          {report.suggestions.length > 0 && (
            <ChartCard title="Suggestions intelligentes" subtitle="Recommandations actionnables, pondérées par priorité" accent={ct.at(1)}>
              <div className="space-y-3">
                {report.suggestions.map((s) => (
                  <div key={s.id} className={clsx('p-4 rounded-xl border', s.priority === 'P0' ? 'border-error/40 bg-error/5' : s.priority === 'P1' ? 'border-warning/40 bg-warning/5' : 'border-primary-200 dark:border-primary-700')}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                          s.priority === 'P0' ? 'bg-error text-white' : s.priority === 'P1' ? 'bg-warning text-white' : 'bg-primary-500 text-white',
                        )}>{s.priority}</span>
                        <p className="font-semibold text-sm">{s.title}</p>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{s.area}</span>
                    </div>
                    <p className="text-xs text-primary-600 dark:text-primary-400 mb-2"><strong>Pourquoi :</strong> {s.rationale}</p>
                    <p className="text-xs text-primary-700 dark:text-primary-300 mb-1.5"><strong>Action :</strong> {s.action}</p>
                    {s.expectedGain && <p className="text-xs text-success"><strong>Gain estimé :</strong> {s.expectedGain}</p>}
                  </div>
                ))}
              </div>
            </ChartCard>
          )}

          {/* Corrections automatiques */}
          {report.corrections.length > 0 && (
            <ChartCard title={`Corrections automatiques (${report.corrections.length})`} subtitle="Incohérences détectées + propositions de régularisation" accent={ct.at(3)}>
              <div className="space-y-2">
                {report.corrections.slice(0, 15).map((c) => (
                  <div key={c.id} className="p-3 rounded-lg border border-primary-200 dark:border-primary-700 hover:border-accent transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2">
                        {c.severity === 'critical' ? <XCircle className="w-4 h-4 text-error shrink-0" /> : c.severity === 'warn' ? <AlertTriangle className="w-4 h-4 text-warning shrink-0" /> : <MinusCircle className="w-4 h-4 text-primary-400 shrink-0" />}
                        <p className="font-semibold text-sm">{c.title}</p>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{c.category}</span>
                    </div>
                    <p className="text-xs text-primary-600 dark:text-primary-400 ml-6">{c.description}</p>
                    <p className="text-xs text-accent ml-6 mt-1">→ {c.proposal}</p>
                    {c.estimatedImpact !== undefined && c.estimatedImpact > 0 && <p className="text-[10px] text-primary-400 ml-6 mt-1">Impact estimé : {fmtFull(c.estimatedImpact)}</p>}
                  </div>
                ))}
                {report.corrections.length > 15 && <p className="text-xs text-primary-500 text-center italic">+ {report.corrections.length - 15} autre(s) correction(s)…</p>}
              </div>
            </ChartCard>
          )}

          {/* Audit comprehensive */}
          <ChartCard title="Audit comprehensive" subtitle={`${report.audit.passed} passés · ${report.audit.warnings} avertissements · ${report.audit.failed} en échec`} accent={ct.at(0)}>
            <div className="space-y-2">
              {report.audit.checks.map((c) => (
                <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border border-primary-200/60 dark:border-primary-700/60">
                  {c.status === 'pass' ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" /> :
                   c.status === 'fail' ? <XCircle className="w-4 h-4 text-error shrink-0 mt-0.5" /> :
                   c.status === 'warn' ? <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" /> :
                   <MinusCircle className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{c.title}</p>
                    <p className="text-xs text-primary-600 dark:text-primary-400">{c.description}</p>
                    {c.details && <p className="text-[10px] text-primary-400 mt-0.5">{c.details}</p>}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">{c.category}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </>
      )}

      {/* Méthodologie */}
      <Card className="p-4 border-l-4 border-l-accent">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary-500 font-semibold mb-2">
          <Brain className="w-3.5 h-3.5" />
          Méthodologie Proph3t
        </div>
        <ul className="text-xs text-primary-500 space-y-1">
          <li>• Toutes les analyses sont déterministes — pas de LLM, pas d'aléa.</li>
          <li>• Date-aware : le contexte temporel est calculé à partir de la date système et du calendrier UEMOA OHADA.</li>
          <li>• Mémoire persistée localement (localStorage) — Proph3t apprend de chaque analyse.</li>
          <li>• Audit basé sur les standards SYSCOHADA révisé 2017 (équilibre, cohérence, intégrité hash chain).</li>
          <li>• Aucune donnée hardcodée : tous les calculs partent du Grand Livre via le moteur de balance Cockpit.</li>
        </ul>
      </Card>
    </div>
  );
}
