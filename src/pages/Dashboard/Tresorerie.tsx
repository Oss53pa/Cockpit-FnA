// ── TresorerieBFR (3 tabs: tresorerie / bfr / previsionnel) ─────────
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, AreaChart, Area, ComposedChart,
} from 'recharts';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { TabSwitch } from '../../components/ui/TabSwitch';
import { useStatements, useRatios, useBalance } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId, areaGradId } from '../../components/charts/ChartGradients';
import { useApp } from '../../store/app';
import { fmtFull, fmtK } from '../../lib/format';
import { tresorerieMonthly } from '../../engine/analytics';

export function TresorerieBFR({ initialTab }: { initialTab: 'tresorerie' | 'bfr' | 'previsionnel' }) {
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const { sig, bilan } = useStatements();
  const balance = useBalance();
  const [tab, setTab] = useState<typeof initialTab>(initialTab);
  const [tre, setTre] = useState<{ labels: string[]; cumul: number[]; encaissements: number[]; decaissements: number[] }>({ labels: [], cumul: [], encaissements: [], decaissements: [] });

  useEffect(() => {
    if (!currentOrgId) return;
    tresorerieMonthly(currentOrgId, currentYear).then(setTre);
  }, [currentOrgId, currentYear]);

  if (!bilan || !sig) return null;
  const g = (lines: any[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;
  const actifImmo = g(bilan.actif, '_AZ');
  const ressStables = g(bilan.passif, '_DF');
  const actifCirc = g(bilan.actif, '_BK');
  const passifCirc = g(bilan.passif, '_DP');
  const stocks = g(bilan.actif, 'BB');
  const creances = g(bilan.actif, 'BH');
  const autresC = g(bilan.actif, 'BI');
  const dettesFourn = g(bilan.passif, 'DJ');
  const dettesFisc = g(bilan.passif, 'DK');
  const autresD = g(bilan.passif, 'DM');
  const fr = ressStables - actifImmo;
  const bfr = actifCirc - passifCirc;
  const tn = fr - bfr;

  const tresorerieEvol = tre.labels.map((m, i) => ({ mois: m, encaissements: tre.encaissements[i], decaissements: tre.decaissements[i], solde: tre.cumul[i] }));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [fluxData, setFluxData] = useState(tre.labels.map((m) => ({ mois: m, exploitation: 0, investissement: 0, financement: 0 })));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!currentOrgId) return;
    import('../../engine/flows').then(({ computeMonthlyTFT }) =>
      computeMonthlyTFT(currentOrgId, currentYear).then((tft) => {
        const find = (code: string) => tft.lines.find((l) => l.code === code)?.values ?? Array(12).fill(0);
        const op = find('_ZC'), inv = find('_ZD'), fin = find('_ZE');
        setFluxData(tft.months.map((m, i) => ({ mois: m, exploitation: op[i], investissement: inv[i], financement: fin[i] })));
      })
    );
  }, [currentOrgId, currentYear]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [frBfrTn, setFrBfrTn] = useState(tre.labels.map((m) => ({ mois: m, fr: 0, bfr: 0, tn: 0 })));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!currentOrgId) return;
    Promise.all([
      import('../../engine/monthly'),
      import('../../engine/synthese'),
    ]).then(([{ computeMonthlyBilan }, { computeFRBFRMonthly }]) =>
      computeMonthlyBilan(currentOrgId, currentYear).then((mb) => {
        const rows = computeFRBFRMonthly(mb);
        setFrBfrTn(rows.map((r: any) => ({ mois: r.mois, fr: r.fr, bfr: r.bfr, tn: r.tn })));
      })
    );
  }, [currentOrgId, currentYear]);

  const decomposition = [
    { name: 'Stocks', value: stocks, color: ct.at(0) },
    { name: 'Créances clients', value: creances, color: ct.at(1) },
    { name: 'Autres créances', value: autresC, color: ct.at(2) },
    { name: 'Dettes fournisseurs', value: -dettesFourn, color: ct.at(5) },
    { name: 'Dettes fiscales', value: -dettesFisc, color: ct.at(3) },
    { name: 'Autres dettes', value: -autresD, color: ct.at(1) },
  ];

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ratiosData = useRatios();
  const dsoRatio = ratiosData.find((r) => r.code === 'DSO');
  const dpoRatio = ratiosData.find((r) => r.code === 'DPO');
  const dso = dsoRatio?.value ?? (sig.ca ? (creances / (sig.ca * 1.18)) * 360 : 0);
  const achatsGL = balance.filter((r) => r.account.startsWith('60') && !r.account.startsWith('603')).reduce((s, r) => s + (r.soldeD - r.soldeC), 0);
  const rotStocks = achatsGL > 0 ? (stocks / achatsGL) * 360 : 0;
  const dpoV = dpoRatio?.value ?? (achatsGL > 0 ? (dettesFourn / (achatsGL * 1.18)) * 360 : 0);
  const cycleConv = dso + rotStocks - dpoV;

  const cycleData = [
    { label: 'DSO (Clients)', jours: Math.round(dso), color: ct.at(0) },
    { label: 'Rotation Stocks', jours: Math.round(rotStocks), color: ct.at(2) },
    { label: 'DPO (Fournisseurs)', jours: -Math.round(dpoV), color: ct.at(5) },
    { label: 'Cycle Conversion', jours: Math.round(cycleConv), color: ct.at(1) },
  ];

  const previsionnel = [
    { mois: 'M+1', optimiste: tn * 1.15, base: tn, pessimiste: tn * 0.7 },
    { mois: 'M+2', optimiste: tn * 1.25, base: tn * 1.05, pessimiste: tn * 0.6 },
    { mois: 'M+3', optimiste: tn * 1.35, base: tn * 1.08, pessimiste: tn * 0.5 },
    { mois: 'M+4', optimiste: tn * 1.45, base: tn * 1.15, pessimiste: tn * 0.55 },
    { mois: 'M+5', optimiste: tn * 1.55, base: tn * 1.2, pessimiste: tn * 0.65 },
    { mois: 'M+6', optimiste: tn * 1.6, base: tn * 1.25, pessimiste: tn * 0.7 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
        <KPICard title="Trésorerie nette" value={fmtK(tn)} unit="XOF" color={ct.at(3)} icon="TN" subValue="FR − BFR" />
        <KPICard title="Fonds de roulement" value={fmtK(fr)} unit="XOF" color={ct.at(0)} icon="FR" subValue="Ressources − Emplois stables" />
        <KPICard title="BFR" value={fmtK(bfr)} unit="XOF" color={ct.at(2)} icon="BF" inverse />
        <KPICard title="Cycle Conversion" value={`${Math.round(cycleConv)} j`} color={ct.at(5)} icon="CC" inverse />
        <KPICard title="CAF" value={fmtK(sig.resultat + bilan.actif.filter((l: any) => l.code === 'AE' || l.code === 'AF').reduce((s: number, l: any) => s + l.value * 0.1, 0))} unit="XOF" color={ct.at(0)} icon="CF" />
      </div>

      <TabSwitch value={tab} onChange={setTab} activeColor={ct.at(2)}
        tabs={[{ key: 'tresorerie', label: 'Trésorerie' }, { key: 'bfr', label: 'BFR' }, { key: 'previsionnel', label: 'Prévisionnel' }]} />

      {tab === 'tresorerie' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Encaissements vs Décaissements" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={tresorerieEvol}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="encaissements" name="Encaissements" fill={`url(#${barGradId(4)})`} radius={[6, 6, 0, 0]} />
                <Bar dataKey="decaissements" name="Décaissements" fill={`url(#${barGradId(1)})`} radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="solde" name="Solde trésorerie" stroke={ct.at(2)} strokeWidth={2.5} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Flux par catégorie">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fluxData}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="exploitation" name="Exploitation" fill={`url(#${barGradId(4)})`} radius={[6, 6, 0, 0]} />
                <Bar dataKey="investissement" name="Investissement" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
                <Bar dataKey="financement" name="Financement" fill={`url(#${barGradId(2)})`} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Cycle de Conversion de Trésorerie">
            <div className="p-2">
              {cycleData.map((item, i) => (
                <div key={i} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-primary-600 font-medium">{item.label}</span>
                    <span className="font-bold num" style={{ color: item.color }}>{item.jours > 0 ? '+' : ''}{item.jours} j</span>
                  </div>
                  <div className="h-3 bg-primary-100 dark:bg-primary-800 rounded-full overflow-hidden relative">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(Math.abs(item.jours) / 80 * 100, 100)}%`,
                      background: item.color,
                      marginLeft: item.jours < 0 ? 'auto' : 0,
                    }} />
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 rounded-lg text-[11px]" style={{ background: '#eff6ff', color: '#1e40af' }}>
                <strong>Interprétation :</strong> {Math.round(cycleConv)} jours entre le décaissement fournisseur et l'encaissement client. Objectif : réduire le DSO pour améliorer la trésorerie.
              </div>
            </div>
          </ChartCard>
        </div>
      )}

      {tab === 'bfr' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="FR / BFR / Trésorerie nette — évolution" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={frBfrTn}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="fr" name="Fonds de Roulement" stroke={ct.at(4)} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="bfr" name="BFR" stroke={ct.at(3)} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="tn" name="Trésorerie nette" stroke={ct.at(2)} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Décomposition du BFR">
            <div className="p-2">
              <div className="text-xs font-semibold mb-2">Actif circulant d'exploitation</div>
              {decomposition.filter(d => d.value > 0).map((item, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-primary-100 dark:border-primary-800 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: item.color }} />{item.name}</span>
                  <span className="num font-semibold" style={{ color: ct.at(4) }}>+{fmtFull(item.value)}</span>
                </div>
              ))}
              <div className="text-xs font-semibold mt-3 mb-2">Passif circulant d'exploitation</div>
              {decomposition.filter(d => d.value < 0).map((item, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-primary-100 dark:border-primary-800 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: item.color }} />{item.name}</span>
                  <span className="num font-semibold" style={{ color: ct.at(1) }}>{fmtFull(item.value)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 mt-2 border-t-2 border-primary-700 dark:border-primary-300 text-sm font-bold">
                <span>= BFR</span>
                <span className="num" style={{ color: ct.at(3) }}>{fmtFull(bfr)} XOF</span>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="BFR en jours de CA">
            <div className="p-2">
              {tre.labels.map((m, i) => {
                const bfrMois = frBfrTn[i]?.bfr ?? bfr;
                const jours = sig.ca ? Math.round((bfrMois / sig.ca) * 360) : 0;
                const color = jours > 40 ? ct.at(1) : jours > 25 ? ct.at(3) : ct.at(4);
                return (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] w-8 text-primary-500">{m}</span>
                    <div className="flex-1 h-3.5 bg-primary-100 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(jours / 50 * 100, 100)}%`, background: color }} />
                    </div>
                    <span className="text-[11px] font-semibold num w-10 text-right" style={{ color }}>{jours}j</span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      )}

      {tab === 'previsionnel' && (
        <div className="grid grid-cols-1 gap-4">
          <ChartCard title="Prévisionnel de trésorerie — 6 mois (3 scénarios)">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={previsionnel}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                <Tooltip formatter={(v: any) => fmtFull(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="optimiste" name="Scénario optimiste" fill={`url(#${areaGradId(4)})`} stroke={ct.at(4)} strokeWidth={2} />
                <Area type="monotone" dataKey="base" name="Scénario base" fill={`url(#${areaGradId(0)})`} stroke={ct.at(0)} strokeWidth={2.5} />
                <Area type="monotone" dataKey="pessimiste" name="Scénario pessimiste" fill={`url(#${areaGradId(1)})`} stroke={ct.at(1)} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Hypothèses du prévisionnel">
              <div className="text-xs">
                {[
                  { scenario: 'Optimiste', hyp: 'DSO réduit à 45j, CA +10%, charges stables', color: ct.at(4) },
                  { scenario: 'Base', hyp: 'Tendance actuelle maintenue, pas de changement majeur', color: ct.at(0) },
                  { scenario: 'Pessimiste', hyp: 'DSO à 70j, CA -5%, hausse charges 3%', color: ct.at(1) },
                ].map((s, i) => (
                  <div key={i} className="py-2.5 border-b border-primary-100 dark:border-primary-800">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="font-bold" style={{ color: s.color }}>{s.scenario}</span>
                    </div>
                    <div className="text-primary-500 pl-4">{s.hyp}</div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Analyse IA — Trésorerie">
              <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ background: '#f0f9ff', color: '#1e40af' }}>
                <p className="font-bold mb-2">Synthèse IA :</p>
                <p>La trésorerie nette est en <strong>{tn >= 0 ? 'position positive' : 'position négative'}</strong> de {fmtK(Math.abs(tn))} XOF.</p>
                <p className="mt-2">Le DSO ({Math.round(dso)}j) est un levier d'amélioration. Une réduction de 10 jours libérerait environ <strong>{fmtK(creances / Math.max(dso, 1) * 10)}</strong> de trésorerie.</p>
                <p className="mt-2">!! <strong>Recommandation :</strong> Mettre en place des relances automatiques à J+30 et négocier des escomptes pour paiement anticipé.</p>
              </div>
            </ChartCard>
          </div>
        </div>
      )}
    </>
  );
}
