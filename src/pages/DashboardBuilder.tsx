/**
 * Sprint 4 — Dashboard Builder personnalisé.
 * MVP : composition de widgets (KPI, charts, tables) via drag & drop natif HTML5,
 * persistance localStorage, mode édition / preview, partage par URL.
 *
 * Limitations volontaires de cette V1 :
 *   - Drag & drop HTML5 natif (pas de @dnd-kit pour ne pas alourdir le bundle)
 *   - Pas de redimensionnement (chaque widget = 1 unit fixe)
 *   - Persistance localStorage uniquement (synchro Supabase = V2)
 *
 * Architecture :
 *   - WIDGET_CATALOG : 12 widgets prédéfinis (chacun avec data fetcher inline)
 *   - User compose son layout en glissant des widgets depuis la palette
 *   - Layout sauvegardé en localStorage par dashboard custom
 *   - Mode preview : layout final + impression PDF
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Save, Eye, Edit, Trash2, GripVertical,
  TrendingUp, TrendingDown, Wallet, Activity, BadgeDollarSign,
  Banknote, AlertTriangle, BarChart3, PieChart as PieIcon, ListChecks, Hash, Target,
  Building2, Users, Truck, Receipt, Award, Clock, PiggyBank, GitMerge,
  ShieldCheck, Sparkles, Layers3, LayoutDashboard, Percent, Timer, Coins, FileBarChart,
  Briefcase,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { toast } from '../components/ui/Toast';
import { useStatements, useRatios, useMonthlyCA, useCurrentOrg } from '../hooks/useFinancials';
import { fmtFull, fmtK } from '../lib/format';
import { useChartTheme } from '../lib/chartTheme';
import { useApp } from '../store/app';
import clsx from 'clsx';

// ── Catalogue des widgets disponibles ────────────────────────────────

type WidgetType =
  // KPIs Performance (CR)
  | 'kpi-ca' | 'kpi-rn' | 'kpi-ebe' | 'kpi-va' | 'kpi-mb' | 'kpi-marge' | 'kpi-tauxebe' | 'kpi-caf'
  // KPIs Bilan
  | 'kpi-treso' | 'kpi-bfr' | 'kpi-fr' | 'kpi-actif' | 'kpi-cp' | 'kpi-autonomie'
  // KPIs Cycle d'exploitation
  | 'kpi-dso' | 'kpi-dpo' | 'kpi-dio' | 'kpi-ccc'
  // KPIs Audit / Score
  | 'kpi-zscore' | 'kpi-alertes' | 'kpi-conformite'
  // Charts standards
  | 'chart-ca-monthly' | 'chart-charges-pie' | 'chart-treso-area' | 'chart-sig-waterfall'
  | 'chart-budget-vs-realise' | 'chart-actif-passif' | 'chart-monthly-rn'
  // Tables
  | 'table-top-charges' | 'table-top-produits' | 'table-ratios' | 'table-tafire' | 'table-recent-entries'
  | 'table-clients' | 'table-fournisseurs'
  // Listes
  | 'list-alerts' | 'list-narrative';

interface WidgetDef {
  type: WidgetType;
  label: string;
  desc: string;
  icon: typeof Plus;
  category: 'KPI Performance' | 'KPI Bilan' | 'KPI Cycle' | 'KPI Audit' | 'Charts' | 'Tables' | 'Listes';
  size: 1 | 2; // unités de largeur (1 = 1/4, 2 = 1/2)
}

const WIDGET_CATALOG: WidgetDef[] = [
  // ── KPIs Performance (Compte de Résultat) ──
  { type: 'kpi-ca',       label: "Chiffre d'Affaires",  desc: 'CA HT total exercice',          icon: TrendingUp,     category: 'KPI Performance', size: 1 },
  { type: 'kpi-rn',       label: 'Résultat Net',        desc: 'Bénéfice / Perte',              icon: BadgeDollarSign, category: 'KPI Performance', size: 1 },
  { type: 'kpi-ebe',      label: 'EBE',                 desc: 'Excédent brut exploitation',    icon: Activity,       category: 'KPI Performance', size: 1 },
  { type: 'kpi-va',       label: 'Valeur ajoutée',      desc: 'VA (production - consom.)',     icon: Sparkles,       category: 'KPI Performance', size: 1 },
  { type: 'kpi-mb',       label: 'Marge brute',         desc: 'CA - Coût des ventes',          icon: Layers3,        category: 'KPI Performance', size: 1 },
  { type: 'kpi-marge',    label: 'Marge nette',         desc: '% RN / CA',                     icon: Target,         category: 'KPI Performance', size: 1 },
  { type: 'kpi-tauxebe',  label: "Taux d'EBE",          desc: '% EBE / CA',                    icon: Percent,        category: 'KPI Performance', size: 1 },
  { type: 'kpi-caf',      label: "Capacité d'autofinanc.", desc: 'CAF = RN + dot. - reprises',   icon: PiggyBank,     category: 'KPI Performance', size: 1 },
  // ── KPIs Bilan ──
  { type: 'kpi-treso',    label: 'Trésorerie nette',    desc: 'TN = Trés. active - passive',   icon: Wallet,         category: 'KPI Bilan', size: 1 },
  { type: 'kpi-bfr',      label: 'BFR',                 desc: 'Besoin en Fonds de Roulement',  icon: TrendingDown,   category: 'KPI Bilan', size: 1 },
  { type: 'kpi-fr',       label: 'Fonds de roulement',  desc: 'FR = Ress. stables - Immo',     icon: Banknote,       category: 'KPI Bilan', size: 1 },
  { type: 'kpi-actif',    label: 'Total Actif',         desc: 'Actif total bilan',             icon: Building2,      category: 'KPI Bilan', size: 1 },
  { type: 'kpi-cp',       label: 'Capitaux propres',    desc: 'Total CP',                      icon: Coins,          category: 'KPI Bilan', size: 1 },
  { type: 'kpi-autonomie', label: 'Autonomie financière', desc: '% CP / Total Passif',         icon: ShieldCheck,    category: 'KPI Bilan', size: 1 },
  // ── KPIs Cycle d'exploitation ──
  { type: 'kpi-dso',      label: 'DSO',                 desc: 'Délai paiement clients (j)',    icon: Users,          category: 'KPI Cycle', size: 1 },
  { type: 'kpi-dpo',      label: 'DPO',                 desc: 'Délai paiement fournisseurs (j)', icon: Truck,        category: 'KPI Cycle', size: 1 },
  { type: 'kpi-dio',      label: 'DIO',                 desc: 'Délai stocks (j)',              icon: Timer,          category: 'KPI Cycle', size: 1 },
  { type: 'kpi-ccc',      label: 'Cash Conversion Cycle', desc: 'CCC = DSO + DIO - DPO',       icon: Clock,          category: 'KPI Cycle', size: 1 },
  // ── KPIs Audit / Conformité ──
  { type: 'kpi-zscore',   label: 'Score Cockpit',       desc: 'Score santé financière 0-100', icon: Award,          category: 'KPI Audit', size: 1 },
  { type: 'kpi-alertes',  label: "Nombre d'alertes",    desc: 'Ratios en alerte',              icon: AlertTriangle,  category: 'KPI Audit', size: 1 },
  { type: 'kpi-conformite', label: 'Taux de conformité', desc: '% ratios conformes',            icon: ShieldCheck,    category: 'KPI Audit', size: 1 },
  // ── Charts ──
  { type: 'chart-ca-monthly',     label: 'Évolution CA mensuel',  desc: 'Bar chart 12 mois',                icon: BarChart3,    category: 'Charts', size: 2 },
  { type: 'chart-charges-pie',    label: 'Répartition charges',   desc: 'Donut par nature',                 icon: PieIcon,      category: 'Charts', size: 2 },
  { type: 'chart-treso-area',     label: 'Évolution trésorerie',  desc: 'Area chart 12 mois',               icon: TrendingUp,   category: 'Charts', size: 2 },
  { type: 'chart-sig-waterfall',  label: 'Cascade SIG',           desc: 'CA → RN décomposition',            icon: Layers3,      category: 'Charts', size: 2 },
  { type: 'chart-budget-vs-realise', label: 'Budget vs Réalisé',  desc: 'Composed bar + ligne 12 mois',     icon: FileBarChart, category: 'Charts', size: 2 },
  { type: 'chart-actif-passif',   label: 'Structure Actif/Passif', desc: 'Donut comparé',                  icon: PieIcon,      category: 'Charts', size: 2 },
  { type: 'chart-monthly-rn',     label: 'Résultat mensuel',      desc: 'Évolution RN par mois',            icon: LayoutDashboard, category: 'Charts', size: 2 },
  // ── Tables ──
  { type: 'table-top-charges',    label: 'Top 10 charges',        desc: 'Comptes 6 les plus mouvementés',  icon: ListChecks,   category: 'Tables', size: 2 },
  { type: 'table-top-produits',   label: 'Top 10 produits',       desc: 'Comptes 7 les plus mouvementés',  icon: ListChecks,   category: 'Tables', size: 2 },
  { type: 'table-ratios',         label: 'Ratios financiers',     desc: 'Tous ratios + statut',            icon: Hash,         category: 'Tables', size: 2 },
  { type: 'table-tafire',         label: 'TAFIRE résumé',         desc: 'Emplois / Ressources stables',    icon: GitMerge,     category: 'Tables', size: 2 },
  { type: 'table-recent-entries', label: 'Dernières écritures',   desc: '20 dernières écritures GL',       icon: Receipt,      category: 'Tables', size: 2 },
  { type: 'table-clients',        label: 'Top clients (411)',     desc: 'Encours par tiers client',        icon: Users,        category: 'Tables', size: 2 },
  { type: 'table-fournisseurs',   label: 'Top fournisseurs (40)', desc: 'Encours par tiers fournisseur',   icon: Briefcase,    category: 'Tables', size: 2 },
  // ── Listes ──
  { type: 'list-alerts',          label: 'Alertes prioritaires',  desc: 'Ratios hors seuil + sévérité',    icon: AlertTriangle, category: 'Listes', size: 2 },
  { type: 'list-narrative',       label: 'Synthèse narrative',    desc: 'MD&A auto-généré (Proph3t)',      icon: Sparkles,     category: 'Listes', size: 2 },
];

// ── Persistance localStorage ─────────────────────────────────────────

interface CustomDashboard {
  id: string;
  name: string;
  layout: WidgetType[];
  createdAt: number;
}

const STORAGE_KEY = 'cockpit-custom-dashboards';

function loadDashboards(): CustomDashboard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveDashboards(dashboards: CustomDashboard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
}

// ── Widget renderer (alimenté par les hooks data) ────────────────────

function WidgetRenderer({ type, onRemove, editing }: { type: WidgetType; onRemove?: () => void; editing?: boolean }) {
  const { sig, bilan, balance } = useStatements();
  const ratios = useRatios();
  const monthly = useMonthlyCA();
  const ct = useChartTheme();

  const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
  const ca = sig?.ca ?? 0;
  const rn = sig?.resultat ?? 0;
  const ebe = sig?.ebe ?? 0;
  const va = sig?.valeurAjoutee ?? 0;
  const mb = sig?.margeBrute ?? 0;
  const marge = ca ? (rn / ca) * 100 : 0;
  const tauxEbe = ca ? (ebe / ca) * 100 : 0;
  const tn = bilan ? get(bilan.actif, '_BT') - get(bilan.passif, 'DV') : 0;
  const bfr = bilan ? get(bilan.actif, '_BK') - get(bilan.passif, '_DP') : 0;
  const fr = bilan ? get(bilan.passif, 'CP') - get(bilan.actif, '_AZ') : 0;
  const totActif = bilan ? get(bilan.actif, '_BZ') : 0;
  const cp = bilan ? get(bilan.passif, '_CP') || get(bilan.passif, 'CP') : 0;
  const autonomie = totActif > 0 ? (cp / totActif) * 100 : 0;

  // Calculs cycle d'exploitation
  const periodDays = 360;
  const sumD = (...prefixes: string[]) => balance?.filter((r: any) => prefixes.some((p) => r.account?.startsWith(p))).reduce((s: number, r: any) => s + r.debit - r.credit, 0) ?? 0;
  const sumC = (...prefixes: string[]) => balance?.filter((r: any) => prefixes.some((p) => r.account?.startsWith(p))).reduce((s: number, r: any) => s + r.credit - r.debit, 0) ?? 0;
  const creances = bilan ? get(bilan.actif, 'BH') : 0;
  const stocks = bilan ? get(bilan.actif, 'BB') : 0;
  const dettesFour = sumC('40');
  const achatsHT = (sumD('60') - sumD('603')) + sumD('61') + sumD('62') + sumD('63');
  const dso = ca > 0 ? Math.round((creances / (ca * 1.18)) * periodDays) : 0;
  const dio = ca > 0 ? Math.round((stocks / ca) * periodDays) : 0;
  const dpo = achatsHT > 0 ? Math.round((dettesFour / (achatsHT * 1.18)) * periodDays) : 0;
  const ccc = dso + dio - dpo;

  // CAF
  const dotations = sumD('68');
  const reprises = sumC('78');
  const caf = rn + dotations - reprises;

  // Score / alertes
  const alertCount = ratios.filter((r) => r.status === 'alert').length;
  const conformes = ratios.filter((r) => r.status === 'good').length;
  const tauxConformite = ratios.length > 0 ? (conformes / ratios.length) * 100 : 0;
  // Score Cockpit simplifié 0-100
  const score = Math.max(0, Math.min(100, Math.round(
    (ca > 0 ? Math.min(marge / 10, 1) * 25 : 0) +
    (autonomie / 100) * 25 +
    (ratios.length > 0 ? (conformes / ratios.length) * 25 : 0) +
    (tn > 0 ? 25 : 0)
  )));

  const def = WIDGET_CATALOG.find((w) => w.type === type);
  if (!def) return <Card><p className="text-xs text-error">Widget inconnu : {type}</p></Card>;

  const removeBtn = editing && onRemove ? (
    <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 print:hidden">
      <span className="w-7 h-7 rounded-lg bg-primary-200/80 dark:bg-primary-700/80 backdrop-blur flex items-center justify-center text-primary-600 dark:text-primary-200 cursor-move" title="Glisser pour réorganiser">
        <GripVertical className="w-3.5 h-3.5" strokeWidth={2.5} />
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="w-7 h-7 rounded-lg bg-error hover:bg-error/90 text-white flex items-center justify-center shadow-sm hover:shadow-md transition-all hover:scale-105"
        title="Supprimer ce widget"
        aria-label="Supprimer"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
    </div>
  ) : null;

  // ── KPIs Performance ──
  if (type === 'kpi-ca')       return <div className="relative">{removeBtn}<KPICard title="Chiffre d'Affaires" value={fmtK(ca)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-rn')       return <div className="relative">{removeBtn}<KPICard title="Résultat Net" value={fmtK(rn)} unit="XOF" icon={<BadgeDollarSign className="w-4 h-4" strokeWidth={2} />} subValue={`${marge.toFixed(1)}% marge`} /></div>;
  if (type === 'kpi-ebe')      return <div className="relative">{removeBtn}<KPICard title="EBE" value={fmtK(ebe)} unit="XOF" icon={<Activity className="w-4 h-4" strokeWidth={2} />} subValue={`${tauxEbe.toFixed(1)}% du CA`} /></div>;
  if (type === 'kpi-va')       return <div className="relative">{removeBtn}<KPICard title="Valeur ajoutée" value={fmtK(va)} unit="XOF" icon={<Sparkles className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-mb')       return <div className="relative">{removeBtn}<KPICard title="Marge brute" value={fmtK(mb)} unit="XOF" icon={<Layers3 className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-marge')    return <div className="relative">{removeBtn}<KPICard title="Marge nette" value={`${marge.toFixed(1)}`} unit="%" icon={<Target className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-tauxebe')  return <div className="relative">{removeBtn}<KPICard title="Taux d'EBE" value={`${tauxEbe.toFixed(1)}`} unit="%" icon={<Percent className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-caf')      return <div className="relative">{removeBtn}<KPICard title="CAF" value={fmtK(caf)} unit="XOF" icon={<PiggyBank className="w-4 h-4" strokeWidth={2} />} subValue="Capacité d'autofinancement" /></div>;
  // ── KPIs Bilan ──
  if (type === 'kpi-treso')    return <div className="relative">{removeBtn}<KPICard title="Trésorerie Nette" value={fmtK(tn)} unit="XOF" icon={<Wallet className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-bfr')      return <div className="relative">{removeBtn}<KPICard title="BFR" value={fmtK(bfr)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} inverse /></div>;
  if (type === 'kpi-fr')       return <div className="relative">{removeBtn}<KPICard title="Fonds de roulement" value={fmtK(fr)} unit="XOF" icon={<Banknote className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-actif')    return <div className="relative">{removeBtn}<KPICard title="Total Actif" value={fmtK(totActif)} unit="XOF" icon={<Building2 className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-cp')       return <div className="relative">{removeBtn}<KPICard title="Capitaux propres" value={fmtK(cp)} unit="XOF" icon={<Coins className="w-4 h-4" strokeWidth={2} />} /></div>;
  if (type === 'kpi-autonomie') return <div className="relative">{removeBtn}<KPICard title="Autonomie financière" value={`${autonomie.toFixed(1)}`} unit="%" icon={<ShieldCheck className="w-4 h-4" strokeWidth={2} />} subValue="Cible ≥ 50%" /></div>;
  // ── KPIs Cycle ──
  if (type === 'kpi-dso')      return <div className="relative">{removeBtn}<KPICard title="DSO" value={String(dso)} unit="j" icon={<Users className="w-4 h-4" strokeWidth={2} />} subValue="Délai paiement clients" /></div>;
  if (type === 'kpi-dpo')      return <div className="relative">{removeBtn}<KPICard title="DPO" value={String(dpo)} unit="j" icon={<Truck className="w-4 h-4" strokeWidth={2} />} subValue="Délai paiement fournisseurs" /></div>;
  if (type === 'kpi-dio')      return <div className="relative">{removeBtn}<KPICard title="DIO" value={String(dio)} unit="j" icon={<Timer className="w-4 h-4" strokeWidth={2} />} subValue="Délai stocks" /></div>;
  if (type === 'kpi-ccc')      return <div className="relative">{removeBtn}<KPICard title="Cash Conv. Cycle" value={String(ccc)} unit="j" icon={<Clock className="w-4 h-4" strokeWidth={2} />} subValue="DSO + DIO - DPO" inverse /></div>;
  // ── KPIs Audit ──
  if (type === 'kpi-zscore')   return <div className="relative">{removeBtn}<KPICard title="Score Cockpit" value={String(score)} unit="/100" icon={<Award className="w-4 h-4" strokeWidth={2} />} subValue={score >= 70 ? 'Bonne santé' : score >= 50 ? 'À surveiller' : 'Critique'} /></div>;
  if (type === 'kpi-alertes')  return <div className="relative">{removeBtn}<KPICard title="Alertes" value={String(alertCount)} icon={<AlertTriangle className="w-4 h-4" strokeWidth={2} />} subValue={`/ ${ratios.length} ratios`} inverse /></div>;
  if (type === 'kpi-conformite') return <div className="relative">{removeBtn}<KPICard title="Conformité" value={`${tauxConformite.toFixed(0)}`} unit="%" icon={<ShieldCheck className="w-4 h-4" strokeWidth={2} />} subValue={`${conformes} ratio(s) conformes`} /></div>;

  // ── Charts ──
  if (type === 'chart-ca-monthly') return (
    <div className="relative">{removeBtn}
      <ChartCard title="Évolution CA mensuel" accent={ct.accent}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthly.map((m) => ({ mois: m.mois, ca: m.realise }))}>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
            <Bar dataKey="ca" fill={ct.accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );

  if (type === 'chart-charges-pie') {
    const cats = [
      { name: 'Achats',   prefix: ['60'] },
      { name: 'Personnel', prefix: ['66'] },
      { name: 'Services', prefix: ['61','62','63'] },
      { name: 'Amorts',    prefix: ['68','69'] },
      { name: 'Impôts',    prefix: ['64'] },
      { name: 'Autres',    prefix: ['65','67'] },
    ].map((c) => ({
      name: c.name,
      value: balance?.filter((r: any) => c.prefix.some((p) => r.account.startsWith(p))).reduce((s: number, r: any) => s + r.debit - r.credit, 0) ?? 0,
    })).filter((c) => c.value > 0);
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Répartition charges" accent={ct.at(1)}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={cats} innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value" stroke="rgb(var(--bg-surface))" strokeWidth={2}>
                {cats.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    );
  }

  if (type === 'chart-treso-area') return (
    <div className="relative">{removeBtn}
      <ChartCard title="Évolution trésorerie" accent={ct.at(2)}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={monthly.map((m) => ({ mois: m.mois, ca: m.realise }))}>
            <defs>
              <linearGradient id="treso-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ct.accent} stopOpacity={0.4} />
                <stop offset="100%" stopColor={ct.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="mois" {...ct.axisProps} />
            <YAxis {...ct.axisProps} tickFormatter={fmtK} />
            <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
            <Area type="monotone" dataKey="ca" stroke={ct.accent} strokeWidth={2} fill="url(#treso-grad)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );

  if (type === 'chart-sig-waterfall') {
    const data = [
      { name: 'CA', value: ca, fill: ct.accent },
      { name: 'Marge brute', value: mb, fill: ct.at(1) },
      { name: 'VA', value: va, fill: ct.at(2) },
      { name: 'EBE', value: ebe, fill: ct.at(3) },
      { name: 'Résultat net', value: rn, fill: rn >= 0 ? '#22c55e' : '#ef4444' },
    ];
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Cascade SIG" accent={ct.accent}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data}>
              <CartesianGrid {...ct.gridProps} />
              <XAxis dataKey="name" {...ct.axisProps} />
              <YAxis {...ct.axisProps} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    );
  }

  if (type === 'chart-budget-vs-realise') {
    const data = monthly.map((m) => ({ mois: m.mois, realise: m.realise ?? 0, budget: (m as any).budget ?? 0 }));
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Budget vs Réalisé" accent={ct.accent}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data}>
              <CartesianGrid {...ct.gridProps} />
              <XAxis dataKey="mois" {...ct.axisProps} />
              <YAxis {...ct.axisProps} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
              <Bar dataKey="realise" fill={ct.accent} radius={[4, 4, 0, 0]} name="Réalisé" />
              <Line type="monotone" dataKey="budget" stroke={ct.at(2)} strokeWidth={2} name="Budget" dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    );
  }

  if (type === 'chart-actif-passif') {
    const actifData = [
      { name: 'Immobilisé', value: bilan ? get(bilan.actif, '_AZ') : 0, fill: ct.at(0) },
      { name: 'Stocks', value: stocks, fill: ct.at(1) },
      { name: 'Créances', value: creances, fill: ct.at(2) },
      { name: 'Trésorerie', value: tn > 0 ? tn : 0, fill: ct.at(3) },
    ].filter((d) => d.value > 0);
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Structure de l'Actif" accent={ct.accent}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={actifData} innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value" stroke="rgb(var(--bg-surface))" strokeWidth={2}>
                {actifData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    );
  }

  if (type === 'chart-monthly-rn') {
    // Estimation simplifiée RN mensuel (CA × marge moyenne)
    const data = monthly.map((m) => ({ mois: m.mois, rn: (m.realise ?? 0) * (marge / 100) }));
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Résultat net mensuel" accent={ct.accent}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid {...ct.gridProps} />
              <XAxis dataKey="mois" {...ct.axisProps} />
              <YAxis {...ct.axisProps} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} />
              <Bar dataKey="rn" radius={[4, 4, 0, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.rn >= 0 ? '#22c55e' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    );
  }

  // ── Tables ──
  if (type === 'table-top-charges') {
    const top = balance?.filter((r: any) => r.account.startsWith('6'))
      .map((r: any) => ({ ...r, value: r.debit - r.credit }))
      .filter((r: any) => r.value > 0)
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10) ?? [];
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Top 10 charges" accent={ct.at(1)}>
          <table className="w-full text-xs">
            <tbody>
              {top.map((r: any) => (
                <tr key={r.account} className="border-b border-primary-100/60 dark:border-primary-800/40">
                  <td className="py-1.5 text-primary-500 num">{r.account}</td>
                  <td className="py-1.5 truncate max-w-[200px]">{r.label}</td>
                  <td className="py-1.5 text-right num font-semibold">{fmtFull(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    );
  }

  if (type === 'table-ratios') return (
    <div className="relative">{removeBtn}
      <ChartCard title="Ratios financiers" accent={ct.at(2)}>
        <table className="w-full text-xs">
          <tbody>
            {ratios.slice(0, 10).map((r) => (
              <tr key={r.code} className="border-b border-primary-100/60 dark:border-primary-800/40">
                <td className="py-1.5 truncate max-w-[200px]">{r.label}</td>
                <td className="py-1.5 text-right num font-semibold">{r.value.toFixed(2)} {r.unit}</td>
                <td className="py-1.5 text-right">
                  <span className={`inline-block w-2 h-2 rounded-full ${r.status === 'good' ? 'bg-success' : r.status === 'warn' ? 'bg-warning' : 'bg-error'}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );

  if (type === 'list-alerts') {
    const alerts = ratios.filter((r) => r.status !== 'good');
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Alertes" accent={ct.at(1)}>
          {alerts.length === 0 ? (
            <p className="text-xs text-success">✓ Tous les ratios sont conformes</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {alerts.map((a) => (
                <li key={a.code} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.status === 'alert' ? 'bg-error' : 'bg-warning'}`} />
                  <span className="flex-1 truncate">{a.label}</span>
                  <span className="num font-semibold">{a.value.toFixed(2)} {a.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    );
  }

  if (type === 'table-top-produits') {
    const top = balance?.filter((r: any) => r.account.startsWith('7'))
      .map((r: any) => ({ ...r, value: r.credit - r.debit }))
      .filter((r: any) => r.value > 0)
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10) ?? [];
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Top 10 produits" accent={ct.at(2)}>
          <table className="w-full text-xs">
            <tbody>
              {top.map((r: any) => (
                <tr key={r.account} className="border-b border-primary-100/60 dark:border-primary-800/40">
                  <td className="py-1.5 text-primary-500 num">{r.account}</td>
                  <td className="py-1.5 truncate max-w-[200px]">{r.label}</td>
                  <td className="py-1.5 text-right num font-semibold">{fmtFull(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    );
  }

  if (type === 'table-tafire') {
    const ressources = [
      { label: 'CAF', value: caf },
      { label: 'Cessions immo (775)', value: sumC('775') },
      { label: 'Apports capital (101-104)', value: sumC('101', '102', '103', '104') },
      { label: 'Nouveaux emprunts (16)', value: sumC('16') },
    ].filter((r) => Math.abs(r.value) > 0);
    const emplois = [
      { label: 'Acquisitions immo (2)', value: sumD('20', '21', '22', '23', '24') },
      { label: 'Distributions (457)', value: sumD('457') },
      { label: 'Remboursements emprunts', value: sumD('16') },
    ].filter((e) => Math.abs(e.value) > 0);
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="TAFIRE résumé" accent={ct.accent}>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-1">Ressources stables</p>
              {ressources.map((r) => (
                <div key={r.label} className="flex justify-between py-1 border-b border-primary-100/60 dark:border-primary-800/40">
                  <span className="truncate">{r.label}</span>
                  <span className="num font-semibold text-success">{fmtK(r.value)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-1">Emplois stables</p>
              {emplois.map((e) => (
                <div key={e.label} className="flex justify-between py-1 border-b border-primary-100/60 dark:border-primary-800/40">
                  <span className="truncate">{e.label}</span>
                  <span className="num font-semibold text-error">{fmtK(e.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>
    );
  }

  if (type === 'table-recent-entries') {
    // Note : sans accès direct à db.gl, on utilise la balance comme proxy.
    // Pour de vraies dernières écritures, il faudrait un hook useRecentEntries().
    const recent = balance?.slice(0, 20) ?? [];
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Comptes mouvementés" accent={ct.at(3)}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-primary-200 dark:border-primary-700 text-[10px] uppercase tracking-wider text-primary-500">
                <th className="text-left py-1">Compte</th>
                <th className="text-left py-1">Libellé</th>
                <th className="text-right py-1">Solde</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r: any) => (
                <tr key={r.account} className="border-b border-primary-100/60 dark:border-primary-800/40">
                  <td className="py-1 num text-primary-500">{r.account}</td>
                  <td className="py-1 truncate max-w-[150px]">{r.label}</td>
                  <td className="py-1 text-right num font-semibold">{fmtK(r.debit - r.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    );
  }

  if (type === 'table-clients') {
    const clients = balance?.filter((r: any) => r.account?.startsWith('411'))
      .map((r: any) => ({ ...r, value: r.debit - r.credit }))
      .filter((r: any) => r.value > 0)
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10) ?? [];
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Top créances clients (411)" accent={ct.at(1)}>
          <table className="w-full text-xs">
            <tbody>
              {clients.length === 0 ? (
                <tr><td className="py-2 text-primary-400">Aucune créance client</td></tr>
              ) : clients.map((r: any) => (
                <tr key={r.account} className="border-b border-primary-100/60 dark:border-primary-800/40">
                  <td className="py-1.5 text-primary-500 num">{r.account}</td>
                  <td className="py-1.5 truncate max-w-[200px]">{r.label}</td>
                  <td className="py-1.5 text-right num font-semibold">{fmtFull(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    );
  }

  if (type === 'table-fournisseurs') {
    const fours = balance?.filter((r: any) => r.account?.startsWith('40'))
      .map((r: any) => ({ ...r, value: r.credit - r.debit }))
      .filter((r: any) => r.value > 0)
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10) ?? [];
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Top dettes fournisseurs (40)" accent={ct.at(2)}>
          <table className="w-full text-xs">
            <tbody>
              {fours.length === 0 ? (
                <tr><td className="py-2 text-primary-400">Aucune dette fournisseur</td></tr>
              ) : fours.map((r: any) => (
                <tr key={r.account} className="border-b border-primary-100/60 dark:border-primary-800/40">
                  <td className="py-1.5 text-primary-500 num">{r.account}</td>
                  <td className="py-1.5 truncate max-w-[200px]">{r.label}</td>
                  <td className="py-1.5 text-right num font-semibold">{fmtFull(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    );
  }

  if (type === 'list-narrative') {
    const lines: string[] = [];
    if (ca > 0) lines.push(`CA de ${fmtK(ca)} XOF, RN ${fmtK(rn)} (marge ${marge.toFixed(1)}%).`);
    if (tauxEbe > 20) lines.push(`Performance opérationnelle solide (EBE ${tauxEbe.toFixed(1)}% du CA).`);
    else if (tauxEbe > 0) lines.push(`EBE à ${tauxEbe.toFixed(1)}% du CA — marge à optimiser.`);
    else lines.push(`EBE négatif — l'activité ne couvre pas ses charges d'exploitation.`);
    if (tn > 0) lines.push(`Trésorerie positive (${fmtK(tn)} XOF).`);
    else lines.push(`Trésorerie négative (${fmtK(tn)} XOF) — tension de financement.`);
    if (alertCount > 0) lines.push(`${alertCount} ratio(s) en alerte critique.`);
    else lines.push(`Tous les ratios sont conformes aux seuils SYSCOHADA.`);
    return (
      <div className="relative">{removeBtn}
        <ChartCard title="Synthèse narrative" accent={ct.accent}>
          <div className="space-y-2 text-xs leading-relaxed text-primary-700 dark:text-primary-300">
            {lines.map((l, i) => <p key={i} className={i === 0 ? 'font-medium text-primary-900 dark:text-primary-100' : ''}>{l}</p>)}
          </div>
        </ChartCard>
      </div>
    );
  }

  return null;
}

// ── Page principale ──────────────────────────────────────────────────

export default function DashboardBuilder() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const org = useCurrentOrg();
  const { currentYear } = useApp();

  const [dashboards, setDashboards] = useState<CustomDashboard[]>(() => loadDashboards());
  const [editing, setEditing] = useState(!id);
  const [name, setName] = useState('Mon dashboard');
  const [layout, setLayout] = useState<WidgetType[]>([]);
  const [draggedWidget, setDraggedWidget] = useState<WidgetType | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Charge le dashboard si id présent
  useEffect(() => {
    if (id) {
      const d = dashboards.find((x) => x.id === id);
      if (d) {
        setName(d.name);
        setLayout(d.layout);
        setEditing(false);
      }
    }
  }, [id, dashboards]);

  const onDragStartFromCatalog = (type: WidgetType) => (e: React.DragEvent) => {
    setDraggedWidget(type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDragOverDropZone = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };

  const onDropZone = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedWidget) {
      setLayout((prev) => [...prev, draggedWidget]);
      setDraggedWidget(null);
    }
  };

  const onDragStartReorder = (idx: number) => (e: React.DragEvent) => {
    setDraggedIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDropReorder = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === idx) return;
    setLayout((prev) => {
      const next = [...prev];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDraggedIndex(null);
  };

  const removeWidget = (idx: number) => setLayout((prev) => prev.filter((_, i) => i !== idx));

  const save = () => {
    if (!name.trim()) { toast.warning('Nom requis', 'Donnez un nom à ce dashboard'); return; }
    if (layout.length === 0) { toast.warning('Vide', 'Ajoutez au moins un widget'); return; }
    const dashId = id ?? Math.random().toString(36).slice(2, 9);
    const next = id
      ? dashboards.map((d) => d.id === id ? { ...d, name, layout } : d)
      : [...dashboards, { id: dashId, name, layout, createdAt: Date.now() }];
    setDashboards(next);
    saveDashboards(next);
    toast.success('Dashboard enregistré', `"${name}" sauvegardé localement`);
    if (!id) navigate(`/builder/${dashId}`);
  };

  const remove = () => {
    if (!id) return;
    if (!confirm(`Supprimer le dashboard "${name}" ?`)) return;
    const next = dashboards.filter((d) => d.id !== id);
    setDashboards(next);
    saveDashboards(next);
    toast.success('Dashboard supprimé');
    navigate('/builder');
  };

  const widgetsByCategory = useMemo(() => {
    const map: Record<string, WidgetDef[]> = {};
    for (const w of WIDGET_CATALOG) {
      if (!map[w.category]) map[w.category] = [];
      map[w.category].push(w);
    }
    return map;
  }, []);

  // Vue d'index : liste de tous les dashboards persos
  if (!id && !editing) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Dashboards personnalisés"
          subtitle={`${dashboards.length} dashboard(s) custom · drag & drop builder`}
          action={<button className="btn-primary" onClick={() => setEditing(true)}><Plus className="w-4 h-4" /> Nouveau dashboard</button>}
        />
        {dashboards.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-primary-500">Aucun dashboard personnalisé pour l'instant.</p>
            <button className="btn-primary mt-4" onClick={() => setEditing(true)}>
              <Plus className="w-4 h-4" /> Créer mon premier dashboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/builder/${d.id}`)}
                className="card-hover p-5 text-left"
              >
                <p className="text-xs uppercase tracking-wider text-primary-500 font-semibold">Custom</p>
                <p className="text-base font-semibold mt-1">{d.name}</p>
                <p className="text-xs text-primary-500 mt-2">{d.layout.length} widget(s) · {new Date(d.createdAt).toLocaleDateString('fr-FR')}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title={editing ? 'Éditeur de dashboard' : name}
        subtitle={`${org?.name ?? '—'} · Exercice ${currentYear} · ${editing ? 'Mode édition' : 'Mode lecture'}`}
        back="/dashboards"
        action={
          <div className="flex items-center gap-2">
            <button className="btn-outline" onClick={() => setEditing(!editing)}>
              {editing ? <><Eye className="w-4 h-4" /> Aperçu</> : <><Edit className="w-4 h-4" /> Éditer</>}
            </button>
            {editing && <button className="btn-primary" onClick={save}><Save className="w-4 h-4" /> Sauvegarder</button>}
            {id && !editing && <button className="btn-outline text-error" onClick={remove}><Trash2 className="w-4 h-4" /> Supprimer</button>}
          </div>
        }
      />

      {editing && (
        <Card title="Informations">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du dashboard (ex: Reporting Direction Mensuel)" />
        </Card>
      )}

      <div className={clsx('grid gap-5', editing && 'lg:grid-cols-[280px_1fr]')}>
        {/* Palette de widgets — en mode édition uniquement */}
        {editing && (
          <Card title="Catalogue de widgets" subtitle="Glissez-déposez vers la zone droite">
            <div className="space-y-4">
              {Object.entries(widgetsByCategory).map(([cat, widgets]) => (
                <div key={cat}>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-primary-500 font-semibold mb-2">{cat}</p>
                  <div className="space-y-1.5">
                    {widgets.map((w) => (
                      <div
                        key={w.type}
                        draggable
                        onDragStart={onDragStartFromCatalog(w.type)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary-200/60 dark:border-primary-700 bg-surface dark:bg-primary-900 cursor-grab hover:bg-primary-100/60 dark:hover:bg-primary-800/60 active:cursor-grabbing transition-colors"
                      >
                        <GripVertical className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                        <w.icon className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{w.label}</p>
                          <p className="text-[10px] text-primary-400 truncate">{w.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Zone de composition */}
        <div
          onDragOver={onDragOverDropZone}
          onDrop={onDropZone}
          className={clsx(
            'min-h-[400px]',
            editing && layout.length === 0 && 'border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-2xl flex items-center justify-center bg-primary-50/50 dark:bg-primary-950/30',
          )}
        >
          {editing && layout.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Plus className="w-8 h-8 text-primary-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">Glissez un widget ici</p>
              <p className="text-xs text-primary-500 mt-1">Composez votre dashboard en glissant les blocs depuis la palette</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {layout.map((w, i) => {
                const def = WIDGET_CATALOG.find((x) => x.type === w);
                const colSpan = def?.size === 2 ? 'md:col-span-2' : '';
                return (
                  <div
                    key={`${w}-${i}`}
                    draggable={editing}
                    onDragStart={editing ? onDragStartReorder(i) : undefined}
                    onDragOver={editing ? onDragOverDropZone : undefined}
                    onDrop={editing ? onDropReorder(i) : undefined}
                    className={clsx(colSpan, editing && 'cursor-move ring-1 ring-transparent hover:ring-primary-300 transition-all rounded-2xl')}
                  >
                    <WidgetRenderer type={w} editing={editing} onRemove={() => removeWidget(i)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
