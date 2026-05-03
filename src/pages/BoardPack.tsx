/**
 * Board Pack — synthèse trimestrielle pour Conseil d'Administration.
 * 1 slide / KPI principal, narration, projection, risques.
 */
import { Printer } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { useApp } from '../store/app';
import { useStatements, useRatios, useMonthlyCA, useCurrentOrg } from '../hooks/useFinancials';
import { fmtFull, fmtK, fmtPct } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';

export default function BoardPackPage() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const monthly = useMonthlyCA();
  const ct = useChartTheme();

  if (!sig || !bilan) return <div className="py-20 text-center text-primary-400">Chargement…</div>;

  const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
  const tn = get(bilan.actif, '_BT') - get(bilan.passif, 'DV');
  const totalActif = get(bilan.actif, '_BZ');
  const capPropres = get(bilan.passif, '_CP');
  const margeNette = sig.ca ? (sig.resultat / sig.ca) * 100 : 0;
  const alertes = ratios.filter((r) => r.status === 'alert');

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader title="Board Pack" subtitle={`${org?.name ?? '—'} · Document Conseil d'Administration · Exercice ${currentYear}`} action={<button className="btn-primary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Imprimer</button>} />

      {/* Slide 1 — Synthèse */}
      <Card className="p-8 print:break-after-page">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary-500 font-semibold">Slide 1 / 4</p>
        <h2 className="text-3xl font-bold mt-2 mb-6">Synthèse exécutive</h2>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="border-l-2 border-accent pl-3"><p className="text-[10px] uppercase text-primary-500 font-semibold">Chiffre d'Affaires</p><p className="num text-2xl font-bold mt-1">{fmtK(sig.ca)}</p><p className="text-[10px] text-primary-400">XOF</p></div>
          <div className="border-l-2 border-accent pl-3"><p className="text-[10px] uppercase text-primary-500 font-semibold">Résultat Net</p><p className="num text-2xl font-bold mt-1">{fmtK(sig.resultat)}</p><p className="text-[10px] text-primary-400">{fmtPct(margeNette)} marge</p></div>
          <div className="border-l-2 border-accent pl-3"><p className="text-[10px] uppercase text-primary-500 font-semibold">Trésorerie</p><p className="num text-2xl font-bold mt-1">{fmtK(tn)}</p><p className="text-[10px] text-primary-400">XOF</p></div>
          <div className="border-l-2 border-accent pl-3"><p className="text-[10px] uppercase text-primary-500 font-semibold">Alertes</p><p className="num text-2xl font-bold mt-1">{alertes.length}</p><p className="text-[10px] text-primary-400">/ {ratios.length} ratios</p></div>
        </div>
        <p className="text-sm leading-relaxed text-primary-700 dark:text-primary-300">L'exercice {currentYear} affiche un résultat de {fmtK(sig.resultat)} XOF avec une marge nette de {fmtPct(margeNette)}. {tn >= 0 ? 'La trésorerie nette est positive, offrant une marge de manœuvre stratégique.' : 'La trésorerie nette est négative, requérant une attention immédiate.'}</p>
      </Card>

      {/* Slide 2 — Performance financière */}
      <Card className="p-8 print:break-after-page">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary-500 font-semibold">Slide 2 / 4</p>
        <h2 className="text-3xl font-bold mt-2 mb-6">Performance financière</h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={monthly.map((m) => ({ mois: m.mois, ca: m.realise }))}>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} />
            <Line type="monotone" dataKey="ca" stroke={ct.accent} strokeWidth={3} dot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Slide 3 — Structure financière */}
      <Card className="p-8 print:break-after-page">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary-500 font-semibold">Slide 3 / 4</p>
        <h2 className="text-3xl font-bold mt-2 mb-6">Structure financière</h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-primary-500 font-semibold uppercase">Total Actif</p>
            <p className="num text-3xl font-bold mt-2">{fmtK(totalActif)}</p>
            <p className="text-xs text-primary-400 mt-1">XOF</p>
          </div>
          <div>
            <p className="text-xs text-primary-500 font-semibold uppercase">Capitaux propres</p>
            <p className="num text-3xl font-bold mt-2">{fmtK(capPropres)}</p>
            <p className="text-xs text-primary-400 mt-1">{totalActif ? `${((capPropres / totalActif) * 100).toFixed(1)}% du passif` : ''}</p>
          </div>
          <div>
            <p className="text-xs text-primary-500 font-semibold uppercase">Autonomie financière</p>
            <p className="num text-3xl font-bold mt-2">{totalActif ? ((capPropres / totalActif) * 100).toFixed(1) : '—'} %</p>
            <p className="text-xs text-primary-400 mt-1">Cible : ≥ 50%</p>
          </div>
        </div>
      </Card>

      {/* Slide 4 — Risques & actions */}
      <Card className="p-8">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary-500 font-semibold">Slide 4 / 4</p>
        <h2 className="text-3xl font-bold mt-2 mb-6">Risques identifiés</h2>
        {alertes.length === 0 ? (
          <p className="text-sm text-success">Aucun risque critique identifié — tous les ratios sont dans les seuils acceptables.</p>
        ) : (
          <ul className="space-y-3">
            {alertes.map((a, i) => (
              <li key={a.code} className="flex items-start gap-3 p-3 rounded-xl border border-error/30 bg-error/5">
                <span className="w-6 h-6 rounded-full bg-error text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                <div>
                  <p className="font-semibold">{a.label}</p>
                  <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">Valeur : {a.value.toFixed(2)} {a.unit} · Cible : {a.target}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
