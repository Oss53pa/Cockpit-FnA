// Consolidation groupe (multi-entités)
// Agrège les entités auxquelles l'utilisateur a accès (fna_user_orgs) en une vue
// groupe : CA / résultat / bilan consolidés (intégration globale), contribution
// par entité, et signalement des comptes courants intra-groupe à éliminer.
//
// Périmètre honnête : agrégation simple (100 %). Les éliminations intra-groupe
// (ventes réciproques, comptes courants) ne sont PAS retraitées automatiquement
// faute de mapping inter-entités — les soldes 46 sont signalés pour retraitement.
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { Network, Building2, TrendingUp, Scale, GitMerge, AlertTriangle } from 'lucide-react';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { useApp } from '../store/app';
import { useChartTheme } from '../lib/chartTheme';
import { dataProvider } from '../db/provider';
import { computeBalance, type BalanceRow } from '../engine/balance';
import { computeSIG, computeBilan } from '../engine/statements';
import type { Organization } from '../db/schema';
import { fmtFull, fmtK } from '../lib/format';

const n = (v: number) => (Number.isFinite(v) ? v : 0);

type EntityFig = { ca: number; rn: number; actif: number; cp: number; dette: number; treso: number; intra: number };

// Réutilise le moteur canonique (computeSIG / computeBilan) pour que le CA et le
// résultat consolidés soient EXACTEMENT la somme des états officiels de chaque
// entité (et non une approximation).
function deriveFig(bal: BalanceRow[]): EntityFig {
  const { sig } = computeSIG(bal);
  const { passif, totalActif } = computeBilan(bal);
  const g = (lines: { code: string; value: number }[], code: string) => lines.find((l) => l.code === code)?.value ?? 0;
  return {
    ca: n(sig.ca),
    rn: n(sig.resultat),
    actif: n(totalActif),
    cp: n(g(passif, '_CP')),
    dette: Math.max(0, n(g(passif, 'DA'))),
    treso: n(bal.filter((r) => /^5/.test(r.account)).reduce((s, r) => s + (r.soldeD - r.soldeC), 0)),
    intra: n(bal.filter((r) => /^46/.test(r.account)).reduce((s, r) => s + (r.soldeD - r.soldeC), 0)),
  };
}

export default function Consolidation() {
  const { currentYear } = useApp();
  const ct = useChartTheme();
  const [entities, setEntities] = useState<Organization[]>([]);
  const [figures, setFigures] = useState<Record<string, EntityFig>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      let orgs: Organization[] = [];
      try { orgs = await dataProvider.getOrganizations(); } catch { orgs = []; }
      if (!alive) return;
      setEntities(orgs);
      setSelected(new Set(orgs.map((o) => o.id)));
      const figs: Record<string, EntityFig> = {};
      await Promise.all(orgs.map(async (o) => {
        try {
          // Dernier import GL de l'entité (getImports en ordre desc) → évite de
          // sommer plusieurs versions d'import (double comptage), comme le fait
          // useResolvedImportId('latest') pour l'org courante.
          const imports = await dataProvider.getImports(o.id);
          const glImports = imports.filter((i) => i.kind === 'GL');
          const importId = glImports.length ? String(glImports[0].id) : undefined;
          let bal = await computeBalance({ orgId: o.id, year: currentYear, includeOpening: true, importId });
          // Repli : si le dernier import ne remonte rien (log vide, données legacy),
          // on prend toutes les versions plutôt que d'afficher 0.
          if (bal.length === 0 && importId) bal = await computeBalance({ orgId: o.id, year: currentYear, includeOpening: true });
          figs[o.id] = deriveFig(bal);
        } catch {
          figs[o.id] = { ca: 0, rn: 0, actif: 0, cp: 0, dette: 0, treso: 0, intra: 0 };
        }
      }));
      if (!alive) return;
      setFigures(figs);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [currentYear]);

  const conso = useMemo(() => {
    const rows = entities
      .filter((e) => selected.has(e.id))
      .map((e) => ({ org: e, fig: figures[e.id] ?? { ca: 0, rn: 0, actif: 0, cp: 0, dette: 0, treso: 0, intra: 0 } }));
    const total = rows.reduce((acc, r) => ({
      ca: acc.ca + r.fig.ca, rn: acc.rn + r.fig.rn, actif: acc.actif + r.fig.actif,
      cp: acc.cp + r.fig.cp, dette: acc.dette + r.fig.dette, treso: acc.treso + r.fig.treso, intra: acc.intra + r.fig.intra,
    }), { ca: 0, rn: 0, actif: 0, cp: 0, dette: 0, treso: 0, intra: 0 });
    const contrib = rows
      .map((r) => ({ nom: r.org.name, ca: r.fig.ca, rn: r.fig.rn, pct: total.ca > 0 ? (r.fig.ca / total.ca) * 100 : 0 }))
      .sort((a, b) => b.ca - a.ca);
    // Éliminations intra-groupe : somme des comptes courants (46). Le résiduel net
    // (≠ 0) signale un déséquilibre des réciprocités entre entités.
    const intraAbs = rows.reduce((s, r) => s + Math.abs(r.fig.intra), 0);
    return { rows, total, contrib, intraNet: total.intra, intraAbs };
  }, [entities, figures, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/consolidation" />
      <DashHeader
        icon="CG"
        title="Consolidation groupe"
        subtitle={`Agrégation multi-entités (intégration globale) — Exercice ${currentYear}`}
      />

      {loading ? (
        <div className="card p-12 text-center text-sm text-primary-400">Calcul des états par entité…</div>
      ) : entities.length === 0 ? (
        <div className="card p-12 text-center text-sm text-primary-400">Aucune entité accessible pour la consolidation.</div>
      ) : (
        <>
          {/* Périmètre de consolidation */}
          <div className="card p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <GitMerge className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold">Périmètre de consolidation</h3>
              <span className="text-[11px] text-primary-400">· {conso.rows.length}/{entities.length} entité(s) · intégration globale 100 %</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {entities.map((e) => {
                const on = selected.has(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => toggle(e.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${on ? 'bg-primary-900 text-primary-50 border-primary-900 dark:bg-primary-100 dark:text-primary-900 dark:border-primary-100' : 'bg-transparent text-primary-500 border-primary-200 dark:border-primary-700'}`}
                  >
                    <Building2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    {e.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KPICard title="CA consolidé" value={fmtK(conso.total.ca)} unit="XOF" subValue={`${conso.rows.length} entité(s)`} icon={<TrendingUp className="w-4 h-4" />} color={ct.at(0)} />
            <KPICard title="Résultat net consolidé" value={fmtK(conso.total.rn)} unit="XOF" subValue={conso.total.rn >= 0 ? 'Bénéfice groupe' : 'Perte groupe'} icon={<GitMerge className="w-4 h-4" />} color={conso.total.rn >= 0 ? ct.at(0) : ct.at(1)} />
            <KPICard title="Total bilan consolidé" value={fmtK(conso.total.actif)} unit="XOF" subValue={`Dette fin. ${fmtK(conso.total.dette)}`} icon={<Scale className="w-4 h-4" />} color={ct.at(3)} />
            <KPICard title="Entités consolidées" value={String(conso.rows.length)} subValue={`Trésorerie ${fmtK(conso.total.treso)}`} icon={<Network className="w-4 h-4" />} color={ct.at(2)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <ChartCard title="États agrégés par entité" subtitle="Contribution de chaque société au groupe" accent={ct.at(0)}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
                      <th className="text-left py-2 px-2">Entité</th>
                      <th className="text-right py-2 px-2">CA</th>
                      <th className="text-right py-2 px-2">Résultat</th>
                      <th className="text-right py-2 px-2 hidden md:table-cell">Actif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                    {conso.rows.map((r) => (
                      <tr key={r.org.id} className="hover:bg-primary-50/60 dark:hover:bg-primary-900/40">
                        <td className="py-2 px-2 font-medium truncate max-w-[160px]">{r.org.name}</td>
                        <td className="py-2 px-2 text-right num">{fmtK(r.fig.ca)}</td>
                        <td className={`py-2 px-2 text-right num ${r.fig.rn >= 0 ? 'text-success' : 'text-error'}`}>{fmtK(r.fig.rn)}</td>
                        <td className="py-2 px-2 text-right num hidden md:table-cell">{fmtK(r.fig.actif)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-primary-300 dark:border-primary-600 font-bold bg-primary-50/60 dark:bg-primary-900/40">
                      <td className="py-2 px-2">TOTAL GROUPE</td>
                      <td className="py-2 px-2 text-right num">{fmtK(conso.total.ca)}</td>
                      <td className={`py-2 px-2 text-right num ${conso.total.rn >= 0 ? 'text-success' : 'text-error'}`}>{fmtK(conso.total.rn)}</td>
                      <td className="py-2 px-2 text-right num hidden md:table-cell">{fmtK(conso.total.actif)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </ChartCard>

            <ChartCard title="Contribution au CA groupe" subtitle="Poids de chaque entité dans le chiffre d'affaires consolidé" accent={ct.at(3)}>
              {conso.contrib.length === 0 ? (
                <div className="h-[240px] flex items-center justify-center text-sm text-primary-400">Sélectionnez au moins une entité</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={conso.contrib} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid {...ct.gridProps} horizontal={false} />
                    <XAxis type="number" {...ct.axisProps} tickFormatter={fmtK} />
                    <YAxis type="category" dataKey="nom" {...ct.axisProps} width={130} />
                    <Tooltip formatter={(v: any, _k, p: any) => [`${fmtFull(v)} (${p?.payload?.pct?.toFixed(1)} %)`, 'CA']} contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItemStyle} labelStyle={ct.tooltipLabelStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="ca" radius={[0, 6, 6, 0]}>
                      {conso.contrib.map((_, i) => <Cell key={i} fill={ct.at(i % 6)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Éliminations intra-groupe */}
          <ChartCard title="Éliminations intra-groupe à retraiter" subtitle="Comptes courants associés / groupe (classe 46) — non éliminés automatiquement" accent={ct.at(1)}>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border-l-2 border-warning">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="text-[12px] text-primary-700 dark:text-primary-300 leading-relaxed">
                <p>
                  Encours intra-groupe détecté (comptes courants 46) : <strong className="num">{fmtFull(conso.intraAbs)}</strong> en valeur absolue,
                  résiduel net <strong className="num">{fmtFull(conso.intraNet)}</strong>.
                </p>
                <p className="mt-1 text-primary-500">
                  {Math.abs(conso.intraNet) < conso.intraAbs * 0.05 && conso.intraAbs > 0
                    ? '✓ Les réciprocités semblent équilibrées entre entités (résiduel faible).'
                    : conso.intraAbs > 0
                      ? '⚠ Le résiduel net est significatif : vérifiez les réciprocités des comptes courants entre entités.'
                      : 'Aucun compte courant intra-groupe détecté sur le périmètre.'}
                </p>
                <p className="mt-2 text-[10px] text-primary-400">
                  Consolidation par agrégation (intégration globale 100 %). Les ventes réciproques et comptes courants ne sont pas éliminés automatiquement (mapping inter-entités requis) — ce bloc les signale pour retraitement manuel.
                </p>
              </div>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
