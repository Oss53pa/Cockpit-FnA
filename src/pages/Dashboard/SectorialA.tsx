// ── Sectoral dispatch + SecIndustrie + SecBTP + SecCommerce + SecMicrofinance
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line,
} from 'recharts';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { useStatements } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId, areaGradId } from '../../components/charts/ChartGradients';
import { useApp } from '../../store/app';
import { fmtFull, fmtK } from '../../lib/format';
import { monthlyByPrefix } from '../../engine/analytics';
import { Diamond, Percent, TrendingUp, TrendingDown, Target } from 'lucide-react';

// ── SecIndustrie ──────────────────────────────────────────────────────
export function SecIndustrie() {
  const { sig, balance } = useStatements();
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [monthly, setMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  useEffect(() => {
    if (currentOrgId) monthlyByPrefix(currentOrgId, currentYear, ['70']).then(setMonthly);
  }, [currentOrgId, currentYear]);
  if (!sig) return null;

  const production = balance.filter(r => r.account.startsWith('702') || r.account.startsWith('703')).reduce((s,r) => s+r.credit-r.debit, 0);
  const matieres = balance.filter(r => r.account.startsWith('602') || r.account.startsWith('604')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const energie = balance.filter(r => r.account.startsWith('605')).reduce((s,r) => s+r.debit-r.credit, 0);
  const amort = balance.filter(r => r.account.startsWith('68')).reduce((s,r) => s+r.debit-r.credit, 0);
  const stockPF = balance.filter(r => r.account.startsWith('36')).reduce((s,r) => s+r.soldeD, 0);
  const stockMP = balance.filter(r => r.account.startsWith('32')).reduce((s,r) => s+r.soldeD, 0);
  const tauxMarge = sig.ca ? (sig.margeBrute / sig.ca) * 100 : 0;
  const productivite = sig.ca && personnel ? sig.ca / personnel : 0;

  const structureCout = [
    { name: 'Matières premières', value: matieres },
    { name: 'Main-d\'œuvre', value: personnel },
    { name: 'Énergie & fluides', value: energie },
    { name: 'Amortissements', value: amort },
  ].filter(c => c.value > 0);

  const monthlyData = monthly.labels.map((m, i) => ({ mois: m, production: monthly.values[i], objectif: monthly.values.reduce((s,v) => s+v, 0) / 12 }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Production vendue" value={fmtK(production)} unit="XOF" icon="FO" />
        <KPICard title="Coût MP consommées" value={fmtK(matieres)} unit="XOF" icon="⚙️" />
        <KPICard title="Marge industrielle" value={fmtK(sig.margeBrute)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Taux de marge" value={`${tauxMarge.toFixed(1)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stock MP" value={fmtK(stockMP)} unit="XOF" icon="▦" />
        <KPICard title="Stock PF" value={fmtK(stockPF)} unit="XOF" icon="▨" />
        <KPICard title="Productivité (CA/MS)" value={productivite.toFixed(2)} icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} subValue={productivite > 3 ? 'Bonne' : 'À améliorer'} />
        <KPICard title="Personnel production" value={fmtK(personnel)} unit="XOF" icon="◐" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Structure des coûts de production">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={structureCout} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.name} ${((p.value/structureCout.reduce((s,d) => s+d.value,0))*100).toFixed(0)}%`}>
                {structureCout.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Production mensuelle vs objectif">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthlyData}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="production" name="Production" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="objectif" name="Objectif moyen" stroke={ct.at(3)} strokeDasharray="5 5" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Ratios industriels clés">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Indicateur</th>
            <th className="text-right py-2 px-3">Valeur</th>
            <th className="text-left py-2 px-3">Formule</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            <tr><td className="py-2 px-3">Taux de marge industrielle</td><td className="text-right num font-semibold">{tauxMarge.toFixed(1)} %</td><td className="text-xs text-primary-500 font-mono">(Production − Matières) / Production</td></tr>
            <tr><td className="py-2 px-3">Productivité salariale</td><td className="text-right num font-semibold">{productivite.toFixed(2)}</td><td className="text-xs text-primary-500 font-mono">CA / Masse salariale</td></tr>
            <tr><td className="py-2 px-3">Ratio matières / CA</td><td className="text-right num font-semibold">{sig.ca ? ((matieres/sig.ca)*100).toFixed(1) : 0} %</td><td className="text-xs text-primary-500 font-mono">Achats MP / Production</td></tr>
            <tr><td className="py-2 px-3">Intensité énergétique</td><td className="text-right num font-semibold">{sig.ca ? ((energie/sig.ca)*100).toFixed(1) : 0} %</td><td className="text-xs text-primary-500 font-mono">Énergie / Production</td></tr>
            <tr><td className="py-2 px-3">Couverture stock PF</td><td className="text-right num font-semibold">{production ? Math.round((stockPF/production)*360) : 0} j</td><td className="text-xs text-primary-500 font-mono">(Stock PF / CA) × 360</td></tr>
            <tr><td className="py-2 px-3">Couverture stock MP</td><td className="text-right num font-semibold">{matieres ? Math.round((stockMP/matieres)*360) : 0} j</td><td className="text-xs text-primary-500 font-mono">(Stock MP / Achats) × 360</td></tr>
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ── SecBTP ────────────────────────────────────────────────────────────
export function SecBTP() {
  const { sig, balance } = useStatements();
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [monthly, setMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  useEffect(() => {
    if (currentOrgId) monthlyByPrefix(currentOrgId, currentYear, ['705']).then(setMonthly);
  }, [currentOrgId, currentYear]);
  if (!sig) return null;

  const travaux = balance.filter(r => r.account.startsWith('705')).reduce((s,r) => s+r.credit-r.debit, 0);
  const achats = balance.filter(r => r.account.startsWith('601') || r.account.startsWith('605')).reduce((s,r) => s+r.debit-r.credit, 0);
  const soustrait = balance.filter(r => r.account.startsWith('637')).reduce((s,r) => s+r.debit-r.credit, 0);
  const locations = balance.filter(r => r.account.startsWith('622')).reduce((s,r) => s+r.debit-r.credit, 0);
  const mainoeuvre = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const encours = balance.filter(r => r.account.startsWith('34') || r.account.startsWith('35')).reduce((s,r) => s+r.soldeD, 0);
  const clients = balance.filter(r => r.account.startsWith('411')).reduce((s,r) => s+r.soldeD, 0);
  const margeBTP = travaux - achats - soustrait;
  const tauxMargeBTP = travaux ? (margeBTP / travaux) * 100 : 0;

  const chantiers = [
    { nom: 'Chantier A — Bureaux Plateau', avancement: 75, marge: 18, budget: travaux * 0.3, realise: travaux * 0.25 },
    { nom: 'Chantier B — Villa Cocody', avancement: 45, marge: 22, budget: travaux * 0.2, realise: travaux * 0.12 },
    { nom: 'Chantier C — Route Yamoussoukro', avancement: 90, marge: 14, budget: travaux * 0.35, realise: travaux * 0.33 },
    { nom: 'Chantier D — Immeuble R+6', avancement: 30, marge: 20, budget: travaux * 0.15, realise: travaux * 0.05 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Travaux facturés" value={fmtK(travaux)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Achats chantier" value={fmtK(achats)} unit="XOF" icon="▦" />
        <KPICard title="Sous-traitance" value={fmtK(soustrait)} unit="XOF" icon="◈" />
        <KPICard title="Marge brute BTP" value={fmtK(margeBTP)} unit="XOF" subValue={`${tauxMargeBTP.toFixed(1)} % des travaux`} icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Encours travaux (34-35)" value={fmtK(encours)} unit="XOF" icon="▣" />
        <KPICard title="Locations matériel" value={fmtK(locations)} unit="XOF" icon="⚙" />
        <KPICard title="Main-d'œuvre" value={fmtK(mainoeuvre)} unit="XOF" icon="●" />
        <KPICard title="Créances clients" value={fmtK(clients)} unit="XOF" icon={<Target className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Évolution des travaux facturés">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly.labels.map((m, i) => ({ mois: m, travaux: monthly.values[i] }))}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Area type="monotone" dataKey="travaux" stroke={ct.bar} fill={`url(#${areaGradId(0)})`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Décomposition des coûts par chantier">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={[
              { cat: 'Achats', montant: achats },
              { cat: 'Sous-traitance', montant: soustrait },
              { cat: 'Main-d\'œuvre', montant: mainoeuvre * 0.7 },
              { cat: 'Locations', montant: locations },
            ]}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="cat" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="montant" fill={`url(#${barGradId(1)})`} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Suivi des chantiers — avancement et marge">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Chantier</th>
            <th className="text-left py-2 px-3">Avancement</th>
            <th className="text-right py-2 px-3">Marge</th>
            <th className="text-right py-2 px-3">Budget</th>
            <th className="text-right py-2 px-3">Réalisé</th>
            <th className="text-right py-2 px-3">Reste à engager</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {chantiers.map((c, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 font-medium">{c.nom}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-primary-200 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-900 dark:bg-primary-100 rounded-full" style={{ width: `${c.avancement}%` }} />
                    </div>
                    <span className="num text-xs">{c.avancement} %</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right num font-semibold">{c.marge} %</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(c.budget)}</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(c.realise)}</td>
                <td className="py-2.5 px-3 text-right num text-primary-500">{fmtFull(c.budget - c.realise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ── SecCommerce ───────────────────────────────────────────────────────
export function SecCommerce() {
  const { sig, balance } = useStatements();
  const { currentOrgId, currentYear } = useApp();
  const ct = useChartTheme();
  const [monthly, setMonthly] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  useEffect(() => {
    if (currentOrgId) monthlyByPrefix(currentOrgId, currentYear, ['701']).then(setMonthly);
  }, [currentOrgId, currentYear]);
  if (!sig) return null;

  const ventes = balance.filter(r => r.account.startsWith('701')).reduce((s,r) => s+r.credit-r.debit, 0);
  const coutAchat = balance.filter(r => r.account.startsWith('601')).reduce((s,r) => s+r.debit-r.credit, 0);
  const stockMarch = balance.filter(r => r.account.startsWith('31')).reduce((s,r) => s+r.soldeD, 0);
  const transport = balance.filter(r => r.account.startsWith('61')).reduce((s,r) => s+r.debit-r.credit, 0);
  const margeCom = ventes - coutAchat;
  const tauxMarque = ventes ? (margeCom / ventes) * 100 : 0;
  const rotation = coutAchat ? (stockMarch / coutAchat) * 360 : 0;

  const monthlyData = monthly.labels.map((m, i) => ({
    mois: m,
    ventes: monthly.values[i],
    marge: Math.round(monthly.values[i] * (tauxMarque / 100)),
  }));

  const familles = [
    { nom: 'Électroménager', ca: ventes * 0.35, marge: 22 },
    { nom: 'Informatique', ca: ventes * 0.25, marge: 18 },
    { nom: 'Mobilier', ca: ventes * 0.20, marge: 28 },
    { nom: 'Accessoires', ca: ventes * 0.12, marge: 35 },
    { nom: 'Autres', ca: ventes * 0.08, marge: 15 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Ventes marchandises" value={fmtK(ventes)} unit="XOF" icon="▸" />
        <KPICard title="Coût d'achat" value={fmtK(coutAchat)} unit="XOF" icon="▾" />
        <KPICard title="Marge commerciale" value={fmtK(margeCom)} unit="XOF" subValue={`${tauxMarque.toFixed(1)} % de taux de marque`} icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Rotation stocks" value={`${Math.round(rotation)} j`} icon="↻" subValue="Couverture stock" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stock marchandises" value={fmtK(stockMarch)} unit="XOF" icon="▦" />
        <KPICard title="Transports sur ventes" value={fmtK(transport)} unit="XOF" icon="→" />
        <KPICard title="Panier moyen (estimation)" value={fmtK(ventes / 1000)} unit="XOF" icon={<Target className="w-4 h-4" strokeWidth={2} />} subValue="CA / nb transactions" />
        <KPICard title="Taux de marque" value={`${tauxMarque.toFixed(1)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Évolution des ventes et de la marge">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthlyData}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="mois" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="ventes" name="Ventes" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="marge" name="Marge" stroke={ct.at(1)} strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ventilation du CA par famille">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={familles} layout="vertical">
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="nom" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="ca" fill={`url(#${barGradId(0)})`} radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Performance par famille de produits">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Famille</th>
            <th className="text-right py-2 px-3">Chiffre d'affaires</th>
            <th className="text-right py-2 px-3">% du CA</th>
            <th className="text-right py-2 px-3">Taux de marge</th>
            <th className="text-right py-2 px-3">Marge dégagée</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {familles.map((f, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 font-medium">{f.nom}</td>
                <td className="py-2.5 px-3 text-right num font-semibold">{fmtFull(f.ca)}</td>
                <td className="py-2.5 px-3 text-right num text-primary-500">{((f.ca / ventes) * 100).toFixed(1)} %</td>
                <td className="py-2.5 px-3 text-right num">{f.marge} %</td>
                <td className="py-2.5 px-3 text-right num font-semibold">{fmtFull(f.ca * f.marge / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ── SecMicrofinance ───────────────────────────────────────────────────
export function SecMicrofinance() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const prodInt = balance.filter(r => r.account.startsWith('77')).reduce((s,r) => s+r.credit-r.debit, 0);
  const chargeInt = balance.filter(r => r.account.startsWith('67')).reduce((s,r) => s+r.debit-r.credit, 0);
  const commissions = balance.filter(r => r.account.startsWith('707')).reduce((s,r) => s+r.credit-r.debit, 0);
  const encours = balance.filter(r => r.account.startsWith('411')).reduce((s,r) => s+r.soldeD, 0);
  const douteux = balance.filter(r => r.account.startsWith('416')).reduce((s,r) => s+r.soldeD, 0);
  const depots = balance.filter(r => r.account.startsWith('419') || r.account.startsWith('46')).reduce((s,r) => s+r.soldeC, 0);
  const provisions = balance.filter(r => r.account.startsWith('49')).reduce((s,r) => s+r.soldeC, 0);
  const pnb = prodInt + commissions - chargeInt;
  const par30 = encours ? (douteux / encours) * 100 : 0;
  const tauxProv = encours ? (provisions / encours) * 100 : 0;
  const coutRisque = encours ? (provisions / encours) * 100 : 0;

  const portfolio = [
    { tranche: 'Sain (non échu)', encours: encours * 0.75 },
    { tranche: 'PAR 1-30j', encours: encours * 0.12 },
    { tranche: 'PAR 31-90j', encours: encours * 0.08 },
    { tranche: 'PAR > 90j', encours: encours * 0.05 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Produits d'intérêts" value={fmtK(prodInt)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Charges d'intérêts" value={fmtK(chargeInt)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="PNB" value={fmtK(pnb)} unit="XOF" subValue="Produit Net Bancaire" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Commissions" value={fmtK(commissions)} unit="XOF" icon="◈" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Encours crédit" value={fmtK(encours)} unit="XOF" icon="●" />
        <KPICard title="Dépôts collectés" value={fmtK(depots)} unit="XOF" icon="▣" />
        <KPICard title="PAR 30" value={`${par30.toFixed(2)} %`} subValue="Portefeuille à risque" icon="⚠" inverse />
        <KPICard title="Taux de provisionnement" value={`${tauxProv.toFixed(2)} %`} icon={<Target className="w-4 h-4" strokeWidth={2} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Qualité du portefeuille de crédit">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={portfolio}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="encours" radius={[6, 6, 0, 0]}>
                {portfolio.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Composition du PNB">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[
                { name: "Produits d'intérêts", value: prodInt },
                { name: 'Commissions', value: commissions },
              ]} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.name}`}>
                <Cell fill={ct.at(0)} />
                <Cell fill={ct.at(1)} />
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Ratios prudentiels microfinance">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Indicateur</th>
            <th className="text-right py-2 px-3">Valeur</th>
            <th className="text-right py-2 px-3">Norme BCEAO</th>
            <th className="text-center py-2 px-3">Statut</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            <tr><td className="py-2 px-3">PAR 30</td><td className="text-right num font-semibold">{par30.toFixed(2)} %</td><td className="text-right num text-primary-500">≤ 5 %</td>
              <td className="text-center"><span className={`badge ${par30 <= 5 ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>{par30 <= 5 ? 'OK' : 'Alerte'}</span></td></tr>
            <tr><td className="py-2 px-3">Taux de provisionnement</td><td className="text-right num font-semibold">{tauxProv.toFixed(2)} %</td><td className="text-right num text-primary-500">≥ 70 % du PAR</td>
              <td className="text-center"><span className="badge bg-primary-200 dark:bg-primary-800">À vérifier</span></td></tr>
            <tr><td className="py-2 px-3">Coût du risque</td><td className="text-right num font-semibold">{coutRisque.toFixed(2)} %</td><td className="text-right num text-primary-500">≤ 2 %</td>
              <td className="text-center"><span className={`badge ${coutRisque <= 2 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>{coutRisque <= 2 ? 'OK' : 'Vigilance'}</span></td></tr>
            <tr><td className="py-2 px-3">Ratio de transformation</td><td className="text-right num font-semibold">{depots ? ((encours / depots) * 100).toFixed(1) : 0} %</td><td className="text-right num text-primary-500">≤ 200 %</td>
              <td className="text-center"><span className="badge bg-primary-200 dark:bg-primary-800">—</span></td></tr>
            <tr><td className="py-2 px-3">Marge d'intérêt</td><td className="text-right num font-semibold">{encours ? ((pnb / encours) * 100).toFixed(2) : 0} %</td><td className="text-right num text-primary-500">objectif interne</td>
              <td className="text-center">—</td></tr>
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}
