/**
 * Closing Pack — synthèse 1 page A4 print-ready pour fin de mois.
 * Format livrable Direction / Expert-comptable : KPIs, mini-charts, alertes,
 * faits saillants, plan d'action. All-in-one print-friendly.
 */
import { useMemo } from 'react';
import { Printer, Sparkles, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, BarChart, Bar, Cell } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { useApp } from '../store/app';
import { useStatements, useRatios, useMonthlyCA, useCurrentOrg } from '../hooks/useFinancials';
import { fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { SEMANTIC } from '../lib/semantic';

export default function ClosingPackPage() {
  const { currentYear, fromMonth, toMonth } = useApp();
  const org = useCurrentOrg();
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const monthly = useMonthlyCA();
  const ct = useChartTheme();

  const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const periodLabel = (fromMonth === 1 && toMonth === 12)
    ? `Cumul ${currentYear}`
    : `${MONTHS[fromMonth - 1]} → ${MONTHS[toMonth - 1]} ${currentYear}`;

  const kpis = useMemo(() => {
    if (!sig || !bilan) return null;
    const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
    const fr = get(bilan.passif, '_CP') - get(bilan.actif, '_AZ');
    const bfr = get(bilan.actif, '_BK') - get(bilan.passif, '_DP');
    const tn = get(bilan.actif, '_BT') - get(bilan.passif, 'DV');
    return {
      ca: sig.ca,
      rn: sig.resultat,
      ebe: sig.ebe,
      margeBrute: sig.margeBrute,
      margeNette: sig.ca ? (sig.resultat / sig.ca) * 100 : 0,
      fr, bfr, tn,
    };
  }, [sig, bilan]);

  const alerts = useMemo(() => ratios.filter((r) => r.status !== 'good'), [ratios]);

  const evolutionCA = useMemo(() => monthly.map((m) => ({ mois: m.mois, ca: m.realise })), [monthly]);

  const print = () => window.print();

  if (!sig || !bilan || !kpis) {
    return <div className="py-20 text-center text-primary-500">Chargement des données…</div>;
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <DashboardTopBar currentRoute="/dashboard/closing-pack" />
      <PageHeader
        title="Closing Pack"
        subtitle={`${org?.name ?? '—'} · ${periodLabel}`}
        action={
          <button className="btn-clay" onClick={print}>
            <Printer className="w-4 h-4" /> Imprimer / PDF
          </button>
        }
      />

      {/* Container A4 print-ready */}
      <div className="bg-surface dark:bg-primary-900 rounded-2xl shadow-card p-8 print:shadow-none print:rounded-none print:p-4 max-w-[210mm] mx-auto">
        {/* Header doc */}
        <div className="border-b-2 border-primary-900 dark:border-primary-100 pb-4 mb-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary-500 font-semibold">Document interne</p>
              <h1 className="text-3xl font-bold tracking-tight text-primary-900 dark:text-primary-50 mt-1">
                Synthèse de gestion
              </h1>
              <p className="text-sm text-primary-600 dark:text-primary-400 mt-1">
                {org?.name ?? '—'} · {periodLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-primary-500">Émis le</p>
              <p className="text-sm font-semibold num">{new Date().toLocaleDateString('fr-FR')}</p>
            </div>
          </div>
        </div>

        {/* KPI block 8 metrics */}
        <section className="grid grid-cols-4 gap-3 mb-6">
          <KpiBlock label="Chiffre d'Affaires" value={fmtK(kpis.ca)} unit="XOF" highlight />
          <KpiBlock label="Résultat Net" value={fmtK(kpis.rn)} unit="XOF" subValue={`${kpis.margeNette.toFixed(1)}% marge`} highlight={kpis.rn >= 0} />
          <KpiBlock label="EBE" value={fmtK(kpis.ebe)} unit="XOF" subValue={`${kpis.ca ? ((kpis.ebe / kpis.ca) * 100).toFixed(1) : 0}% du CA`} />
          <KpiBlock label="Marge brute" value={fmtK(kpis.margeBrute)} unit="XOF" subValue={`${kpis.ca ? ((kpis.margeBrute / kpis.ca) * 100).toFixed(1) : 0}% du CA`} />
          <KpiBlock label="Trésorerie nette" value={fmtK(kpis.tn)} unit="XOF" highlight={kpis.tn >= 0} />
          <KpiBlock label="Fonds de roulement" value={fmtK(kpis.fr)} unit="XOF" />
          <KpiBlock label="BFR" value={fmtK(kpis.bfr)} unit="XOF" subValue={kpis.ca ? `${((kpis.bfr / kpis.ca) * 360).toFixed(0)} jours CA` : '—'} />
          <KpiBlock label="Alertes ratios" value={String(alerts.length)} subValue={`/ ${ratios.length} ratios`} highlight={alerts.length === 0} />
        </section>

        {/* Charts mini : évolution CA + ratios principaux */}
        <section className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Évolution du CA mensuel</p>
            <div className="h-28 bg-primary-50/50 dark:bg-primary-950/50 rounded-xl p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolutionCA}>
                  <defs>
                    <linearGradient id="ca-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ct.accent} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={ct.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="mois" hide />
                  <Area type="monotone" dataKey="ca" stroke={ct.accent} strokeWidth={2} fill="url(#ca-gradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Top 5 ratios</p>
            <div className="h-28 bg-primary-50/50 dark:bg-primary-950/50 rounded-xl p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratios.slice(0, 5).map((r) => ({ name: r.code, value: r.value, status: r.status }))} layout="vertical">
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {ratios.slice(0, 5).map((r, i) => (
                      <Cell key={i} fill={r.status === 'good' ? SEMANTIC.success : r.status === 'warn' ? SEMANTIC.warning : SEMANTIC.danger} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Alertes & faits saillants */}
        <section className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-primary-200 dark:border-primary-700 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Alertes ({alerts.length})
            </p>
            {alerts.length === 0 ? (
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Tous les ratios sont conformes
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {alerts.slice(0, 5).map((a) => (
                  <li key={a.code} className="flex items-start gap-2">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${a.status === 'alert' ? 'bg-error' : 'bg-warning'}`} />
                    <span className="flex-1">
                      <strong className="text-primary-900 dark:text-primary-100">{a.label}</strong>
                      <span className="text-primary-500"> · {a.value.toFixed(2)} {a.unit}</span>
                      <span className="text-primary-400"> (cible {a.target})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-primary-200 dark:border-primary-700 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Faits saillants
            </p>
            <ul className="space-y-1.5 text-xs">
              {kpis.rn > 0 && (
                <li className="flex items-start gap-2">
                  <TrendingUp className="w-3 h-3 text-success mt-0.5 shrink-0" />
                  <span><strong>Bénéfice</strong> de {fmtK(kpis.rn)} XOF — marge nette {kpis.margeNette.toFixed(1)}%</span>
                </li>
              )}
              {kpis.rn < 0 && (
                <li className="flex items-start gap-2">
                  <TrendingDown className="w-3 h-3 text-error mt-0.5 shrink-0" />
                  <span><strong>Perte</strong> de {fmtK(Math.abs(kpis.rn))} XOF</span>
                </li>
              )}
              {kpis.tn < 0 && (
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 text-warning mt-0.5 shrink-0" />
                  <span>Trésorerie nette <strong>négative</strong> ({fmtK(kpis.tn)} XOF)</span>
                </li>
              )}
              {kpis.fr < kpis.bfr && (
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 text-warning mt-0.5 shrink-0" />
                  <span>FR ne couvre pas le BFR — tension de financement court terme</span>
                </li>
              )}
              {kpis.ebe / Math.max(kpis.ca, 1) > 0.20 && (
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3 h-3 text-success mt-0.5 shrink-0" />
                  <span>EBE supérieur à 20% du CA — performance opérationnelle solide</span>
                </li>
              )}
            </ul>
          </div>
        </section>

        {/* Footer signature */}
        <footer className="border-t border-primary-200 dark:border-primary-800 pt-4 text-[10px] text-primary-400 flex justify-between">
          <span>Cockpit F&amp;A · SYSCOHADA révisé 2017</span>
          <span>Document généré automatiquement · {new Date().toLocaleString('fr-FR')}</span>
        </footer>
      </div>
    </div>
  );
}

function KpiBlock({ label, value, unit, subValue, highlight }: {
  label: string; value: string; unit?: string; subValue?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800'}`}>
      <p className={`text-[9px] uppercase tracking-wider font-semibold ${highlight ? 'text-primary-300' : 'text-primary-500'}`}>{label}</p>
      <p className="num text-lg font-bold tracking-tight mt-1">
        {value}{unit && <span className="text-[10px] font-normal opacity-70 ml-1">{unit}</span>}
      </p>
      {subValue && <p className={`text-[10px] mt-0.5 ${highlight ? 'text-primary-400' : 'text-primary-500'}`}>{subValue}</p>}
    </div>
  );
}
