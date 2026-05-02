// Dashboard Executive Summary — NEW GENERATION
// Conçu en mode « one-pager » pour un DAF / CEO : en un seul scroll,
// toutes les métriques clés, ratios, tendances et alertes.
//
// Combine :
// - @nivo/* pour les visualisations riches (radar pyramide DuPont, waterfall,
//   radial bar, stream)
// - composants premium internes (KPICard, ChartCard, DashHeader) pour
//   garder la cohérence de palette avec le reste de l'app
//
// L'objectif est de servir de référence pour la refonte progressive de
// tous les autres dashboards.
import { useMemo } from 'react';
import { ArrowLeft, Download, ShieldAlert, ShieldCheck, TrendingUp, Wallet, Scale, Target, Activity, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveRadar } from '@nivo/radar';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { DashHeader } from '../components/ui/DashHeader';
import { useApp } from '../store/app';
import { useBalance, useCurrentOrg, useRatios, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtFull, fmtK } from '../lib/format';

// ─── Thème Nivo unifié avec les CSS vars de l'app ─────────────────
function useNivoTheme() {
  return {
    background: 'transparent',
    text: { fontSize: 11, fill: 'rgb(var(--p-600))' },
    axis: {
      ticks: { text: { fontSize: 10, fill: 'rgb(var(--p-500))' }, line: { stroke: 'rgb(var(--p-300))' } },
      legend: { text: { fontSize: 11, fill: 'rgb(var(--p-700))', fontWeight: 600 } },
      domain: { line: { stroke: 'rgb(var(--p-300))', strokeWidth: 1 } },
    },
    grid: { line: { stroke: 'rgb(var(--p-200))', strokeDasharray: '3 3' } },
    legends: { text: { fontSize: 11, fill: 'rgb(var(--p-600))' } },
    tooltip: {
      container: {
        background: 'rgb(var(--p-900))',
        color: 'rgb(var(--p-50))',
        fontSize: 11,
        borderRadius: 8,
        boxShadow: '0 10px 25px rgb(0 0 0 / 0.15)',
        padding: '8px 12px',
      },
    },
  };
}

export default function ExecutiveSummary() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, bilan } = useStatements();
  const balance = useBalance();
  const ratios = useRatios();
  const ct = useChartTheme();
  const nivoTheme = useNivoTheme();

  // ─── KPIs clés ─────────────────────────────────────────
  const ca = sig?.ca ?? 0;
  const resultat = sig?.resultat ?? 0;
  const ebe = sig?.ebe ?? 0;
  const re = sig?.re ?? 0;
  const margePct = ca ? (resultat / ca) * 100 : 0;
  const ebePct = ca ? (ebe / ca) * 100 : 0;

  // Trésorerie nette (actif trésorerie − passif trésorerie)
  const tresoActive = balance.filter((r) => r.account.match(/^5[0-8]/)).reduce((s, r) => s + r.soldeD, 0);
  const tresoPass = balance.filter((r) => r.account.startsWith('56')).reduce((s, r) => s + r.soldeC, 0);
  const tresoNet = tresoActive - tresoPass;

  const totalActif = bilan ? (bilan.actif.find((l) => l.code === '_BZ')?.value ?? 0) : 0;
  const capPropres = bilan ? (bilan.passif.find((l) => l.code === '_CP')?.value ?? 0) : 0;
  const autonomie = totalActif ? (capPropres / totalActif) * 100 : 0;

  // ─── Radar pyramide DuPont — 6 axes de performance ─────
  const radarData = useMemo(() => {
    const get = (code: string) => ratios.find((r) => r.code === code);
    return [
      { axe: 'Rentabilité nette', valeur: Math.max(0, Math.min(100, (get('TRN')?.value ?? 0) * 5)), cible: 40 },
      { axe: 'ROE', valeur: Math.max(0, Math.min(100, (get('ROE')?.value ?? 0) * 5)), cible: 50 },
      { axe: 'Liquidité', valeur: Math.max(0, Math.min(100, (get('LG')?.value ?? 0) * 50)), cible: 75 },
      { axe: 'Autonomie', valeur: Math.max(0, Math.min(100, autonomie * 2)), cible: 60 },
      { axe: 'EBE / CA', valeur: Math.max(0, Math.min(100, ebePct * 5)), cible: 50 },
      { axe: 'Marge brute', valeur: Math.max(0, Math.min(100, (get('MB')?.value ?? 0) * 3)), cible: 60 },
    ];
  }, [ratios, autonomie, ebePct]);

  // ─── Waterfall du résultat net (cascade SIG) ────────────
  const waterfall = useMemo(() => {
    if (!sig) return [];
    const lines = [
      { key: "CA", value: sig.ca, type: 'positive' },
      { key: "Marge brute", value: sig.margeBrute, type: 'subtotal' },
      { key: 'VA', value: sig.valeurAjoutee, type: 'subtotal' },
      { key: 'EBE', value: sig.ebe, type: 'subtotal' },
      { key: "Résultat expl.", value: sig.re, type: 'subtotal' },
      { key: 'Résultat fin.', value: sig.rf, type: sig.rf >= 0 ? 'positive' : 'negative' },
      { key: 'Résultat HAO', value: sig.rhao, type: sig.rhao >= 0 ? 'positive' : 'negative' },
      { key: 'Impôt', value: -sig.impot, type: 'negative' },
      { key: 'Résultat net', value: sig.resultat, type: 'final' },
    ];
    return lines.map((l) => ({
      etape: l.key,
      valeur: Math.round(l.value),
      color:
        l.type === 'final' ? (l.value >= 0 ? ct.at(0) : '#ef4444') :
        l.type === 'subtotal' ? ct.at(3) :
        l.type === 'positive' ? '#22c55e' :
        '#ef4444',
    }));
  }, [sig, ct]);

  // ─── Structure du bilan (Actif vs Passif — empilés) ────
  // Filtre strict pour éviter les erreurs SVG transform de react-spring (nivo) :
  // valeurs NaN / Infinity / 0 / quasi-zéro produisent des "translate(, )" invalides.
  const isValidValue = (v: number) => Number.isFinite(v) && v >= 1; // au moins 1 unité (XOF)
  const bilanData = useMemo(() => {
    if (!bilan) return { actif: [], passif: [] };
    return {
      actif: [
        { id: 'Immobilisations', value: bilan.actif.find((l) => l.code === '_AZ')?.value ?? 0 },
        { id: 'Actif circulant', value: bilan.actif.find((l) => l.code === '_BK')?.value ?? 0 },
        { id: 'Trésorerie active', value: bilan.actif.find((l) => l.code === '_BT')?.value ?? 0 },
      ].filter((d) => isValidValue(d.value)),
      passif: [
        { id: 'Capitaux propres', value: bilan.passif.find((l) => l.code === '_CP')?.value ?? 0 },
        { id: 'Dettes financières', value: bilan.passif.find((l) => l.code === 'DA')?.value ?? 0 },
        { id: 'Passif circulant', value: bilan.passif.find((l) => l.code === '_DP')?.value ?? 0 },
        { id: 'Trésorerie passive', value: bilan.passif.find((l) => l.code === 'DV')?.value ?? 0 },
      ].filter((d) => isValidValue(d.value)),
    };
  }, [bilan]);

  // ─── Alertes santé financière ───────────────────────────
  const alerts = useMemo(() => {
    const out: Array<{ level: 'danger' | 'warn' | 'ok'; text: string }> = [];
    if (resultat < 0) out.push({ level: 'danger', text: 'Résultat net négatif — exercice déficitaire' });
    else if (margePct < 3) out.push({ level: 'warn', text: `Marge nette faible (${margePct.toFixed(1)} %) — sous le seuil SYSCOHADA de vigilance (3 %)` });
    else out.push({ level: 'ok', text: `Marge nette saine (${margePct.toFixed(1)} %)` });

    if (tresoNet < 0) out.push({ level: 'danger', text: 'Trésorerie nette négative — tensions de liquidité' });
    else out.push({ level: 'ok', text: `Trésorerie nette positive (${fmtFull(tresoNet)} XOF)` });

    if (autonomie < 30) out.push({ level: 'warn', text: `Autonomie financière basse (${autonomie.toFixed(1)} %)` });
    else if (autonomie < 50) out.push({ level: 'warn', text: `Autonomie financière à surveiller (${autonomie.toFixed(1)} %)` });
    else out.push({ level: 'ok', text: `Autonomie financière solide (${autonomie.toFixed(1)} %)` });

    ratios.filter((r) => r.status === 'alert').slice(0, 3).forEach((r) => {
      out.push({ level: 'warn', text: `${r.label} : ${r.unit === '%' ? r.value.toFixed(1) + ' %' : r.value.toFixed(2)} — cible ${r.target}${r.unit === '%' ? ' %' : ''}` });
    });
    return out;
  }, [resultat, margePct, tresoNet, autonomie, ratios]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Link to="/dashboards" className="btn-ghost text-sm"><ArrowLeft className="w-4 h-4" /> Catalogue</Link>
        <button className="btn-primary text-sm"><Download className="w-4 h-4" /> Exporter</button>
      </div>

      <DashHeader
        icon="EX"
        title="Executive Summary"
        subtitle={`Vue exécutive consolidée — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      {/* KPIs Headline — 4 colonnes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard
          title="Chiffre d'affaires"
          value={fmtK(ca)}
          unit="XOF"
          icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />}
          color={ct.at(0)}
        />
        <KPICard
          title="Résultat net"
          value={fmtK(resultat)}
          unit="XOF"
          subValue={`${margePct >= 0 ? '+' : ''}${margePct.toFixed(1)} % du CA`}
          icon={<Target className="w-4 h-4" strokeWidth={2} />}
          color={resultat >= 0 ? '#22c55e' : '#ef4444'}
        />
        <KPICard
          title="Trésorerie nette"
          value={fmtK(tresoNet)}
          unit="XOF"
          subValue={tresoNet >= 0 ? 'Position positive' : 'Découvert'}
          icon={<Wallet className="w-4 h-4" strokeWidth={2} />}
          color={tresoNet >= 0 ? ct.at(0) : '#ef4444'}
        />
        <KPICard
          title="Autonomie financière"
          value={`${autonomie.toFixed(1)} %`}
          subValue={`Cap. propres / Total actif`}
          icon={<Scale className="w-4 h-4" strokeWidth={2} />}
          color={autonomie >= 50 ? '#22c55e' : autonomie >= 30 ? '#f59e0b' : '#ef4444'}
        />
      </div>

      {/* KPIs secondaires */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="EBE" value={fmtK(ebe)} unit="XOF" subValue={`${ebePct.toFixed(1)} % du CA`} icon={<Activity className="w-4 h-4" />} color={ct.at(3)} />
        <KPICard title="Résultat d'exploitation" value={fmtK(re)} unit="XOF" icon={<Activity className="w-4 h-4" />} color={ct.at(4)} />
        <KPICard title="Total actif" value={fmtK(totalActif)} unit="XOF" icon={<Scale className="w-4 h-4" />} color={ct.at(5)} />
        <KPICard title="Capitaux propres" value={fmtK(capPropres)} unit="XOF" icon={<Scale className="w-4 h-4" />} color={ct.at(6)} />
      </div>

      {/* Alertes / Santé financière */}
      <ChartCard
        title="Santé financière — diagnostic automatique"
        subtitle="Indicateurs critiques détectés à partir du GL"
        accent={alerts.some((a) => a.level === 'danger') ? '#ef4444' : alerts.some((a) => a.level === 'warn') ? '#f59e0b' : '#22c55e'}
        className="mb-6"
      >
        <ul className="space-y-2">
          {alerts.map((a, i) => (
            <li key={i} className="flex items-start gap-3 py-2 border-b border-primary-200/40 dark:border-primary-800/60 last:border-0 text-sm">
              {a.level === 'danger' && <AlertTriangle className="w-4 h-4 text-error mt-0.5 shrink-0" />}
              {a.level === 'warn' && <ShieldAlert className="w-4 h-4 text-warning mt-0.5 shrink-0" />}
              {a.level === 'ok' && <ShieldCheck className="w-4 h-4 text-success mt-0.5 shrink-0" />}
              <span className={
                a.level === 'danger' ? 'text-error font-medium' :
                a.level === 'warn' ? 'text-warning' :
                'text-primary-700 dark:text-primary-300'
              }>{a.text}</span>
            </li>
          ))}
        </ul>
      </ChartCard>

      {/* Radar performance + Waterfall résultat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <ChartCard title="Pyramide de performance" subtitle="6 axes normalisés à 100 (cible indicative)" accent={ct.at(0)}>
          <div style={{ height: 260 }}>
            <ResponsiveRadar
              data={radarData}
              keys={['valeur', 'cible']}
              indexBy="axe"
              maxValue={100}
              margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
              colors={[ct.at(0), ct.at(3) + '80']}
              borderColor={{ from: 'color' }}
              gridLabelOffset={18}
              dotSize={6}
              dotColor={{ theme: 'background' }}
              dotBorderWidth={2}
              blendMode="multiply"
              motionConfig="wobbly"
              theme={nivoTheme}
              legends={[
                { anchor: 'top-left', direction: 'column', translateX: -70, translateY: -40, itemWidth: 80, itemHeight: 18, itemTextColor: 'rgb(var(--p-600))', symbolSize: 10 },
              ]}
            />
          </div>
        </ChartCard>

        <ChartCard title="Cascade du résultat — SIG SYSCOHADA" subtitle="De la valeur ajoutée au résultat net" accent={ct.at(1)}>
          <div style={{ height: 260 }}>
            <ResponsiveBar
              data={waterfall}
              keys={['valeur']}
              indexBy="etape"
              layout="vertical"
              margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
              padding={0.35}
              colors={({ data }) => (data as any).color as string}
              colorBy="indexValue"
              borderRadius={3}
              axisBottom={{ tickRotation: -25, legendOffset: 42 }}
              axisLeft={{ format: (v: number) => fmtK(v) }}
              enableLabel={false}
              theme={nivoTheme}
              animate={false}
              tooltip={({ data, value }) => (
                <div style={{ background: 'rgb(var(--p-900))', color: 'rgb(var(--p-50))', padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>
                  <strong>{(data as any).etape}</strong><br />{fmtFull(value)} XOF
                </div>
              )}
            />
          </div>
        </ChartCard>
      </div>

      {/* Structure du bilan en double pie chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <ChartCard title="Structure de l'Actif" subtitle="Répartition du Total Actif" accent={ct.at(0)}>
          <div style={{ height: 230 }}>
            <ResponsivePie
              data={bilanData.actif}
              margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
              innerRadius={0.6}
              padAngle={1}
              cornerRadius={4}
              colors={[ct.at(0), ct.at(3), ct.at(4)]}
              borderWidth={2}
              borderColor={{ from: 'color', modifiers: [['darker', 0.3]] }}
              enableArcLinkLabels={false}
              arcLabelsTextColor="#fff"
              arcLabel={(d) => `${Math.round((d.value / bilanData.actif.reduce((s, x) => s + x.value, 0)) * 100)} %`}
              theme={nivoTheme}
              animate={false}
              legends={[
                { anchor: 'bottom', direction: 'row', translateY: 30, itemWidth: 110, itemHeight: 14, itemTextColor: 'rgb(var(--p-600))', symbolSize: 10, symbolShape: 'circle' },
              ]}
            />
          </div>
        </ChartCard>

        <ChartCard title="Structure du Passif" subtitle="Répartition du Total Passif" accent={ct.at(1)}>
          <div style={{ height: 230 }}>
            <ResponsivePie
              data={bilanData.passif}
              margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
              innerRadius={0.6}
              padAngle={1}
              cornerRadius={4}
              colors={[ct.at(0), ct.at(3), ct.at(5), ct.at(6)]}
              borderWidth={2}
              borderColor={{ from: 'color', modifiers: [['darker', 0.3]] }}
              enableArcLinkLabels={false}
              arcLabelsTextColor="#fff"
              arcLabel={(d) => `${Math.round((d.value / bilanData.passif.reduce((s, x) => s + x.value, 0)) * 100)} %`}
              theme={nivoTheme}
              animate={false}
              legends={[
                { anchor: 'bottom', direction: 'row', translateY: 30, itemWidth: 110, itemHeight: 14, itemTextColor: 'rgb(var(--p-600))', symbolSize: 10, symbolShape: 'circle' },
              ]}
            />
          </div>
        </ChartCard>
      </div>

      {/* Ratios clés — tableau visuel */}
      <ChartCard title="Ratios financiers SYSCOHADA — Top 8" subtitle="Comparaison à la cible avec statut" accent={ct.at(3)} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
              <tr>
                <th className="text-left py-2 px-3">Ratio</th>
                <th className="text-left py-2 px-3">Famille</th>
                <th className="text-right py-2 px-3">Valeur</th>
                <th className="text-right py-2 px-3">Cible</th>
                <th className="text-center py-2 px-3">Statut</th>
                <th className="py-2 px-3">Progression</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200/60 dark:divide-primary-800/60">
              {ratios.slice(0, 8).map((r) => {
                const pct = r.target ? Math.min(100, Math.abs((r.value / r.target) * 100)) : 0;
                const statusColor =
                  r.status === 'good' ? '#22c55e' :
                  r.status === 'warn' ? '#f59e0b' :
                  '#ef4444';
                return (
                  <tr key={r.code} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                    <td className="py-2 px-3 font-medium text-[13px]">{r.label}</td>
                    <td className="py-2 px-3 text-[11px] text-primary-500">{r.family}</td>
                    <td className="py-2 px-3 text-right num">{r.unit === '%' ? `${r.value.toFixed(1)} %` : r.unit === 'j' ? `${Math.round(r.value)} j` : r.value.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right num text-primary-500">{r.target}{r.unit === '%' ? ' %' : ''}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: statusColor }} />
                    </td>
                    <td className="py-2 px-3 w-40">
                      <div className="h-1.5 bg-primary-200/60 dark:bg-primary-800/60 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: statusColor }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Line chart : évolution de la performance (placeholder visuel) */}
      <ChartCard title="Signature financière" subtitle="Positionnement courant sur les 6 axes clés (profil normalisé)" accent={ct.at(5)}>
        <div style={{ height: 180 }}>
          <ResponsiveLine
            data={[
              {
                id: 'Profil de la société',
                data: [
                  { x: 'Rentab.', y: margePct },
                  { x: 'EBE/CA', y: ebePct },
                  { x: 'Autonomie', y: autonomie },
                  { x: 'Marge B.', y: ratios.find((r) => r.code === 'MB')?.value ?? 0 },
                  { x: 'ROE', y: ratios.find((r) => r.code === 'ROE')?.value ?? 0 },
                  { x: 'Liquidité x', y: (ratios.find((r) => r.code === 'LG')?.value ?? 0) * 10 },
                ],
              },
            ]}
            margin={{ top: 20, right: 30, bottom: 40, left: 50 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            curve="monotoneX"
            colors={[ct.at(0)]}
            lineWidth={3}
            enablePoints
            pointSize={8}
            pointBorderWidth={2}
            pointBorderColor={{ theme: 'background' }}
            enableArea
            areaOpacity={0.15}
            enableGridY
            axisLeft={{ format: (v: number) => `${v}` }}
            theme={nivoTheme}
            animate={false}
          />
        </div>
      </ChartCard>
    </div>
  );
}
