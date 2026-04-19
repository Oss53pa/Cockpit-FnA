import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { useBudgetActual, useCapitalVariation, useCurrentOrg, useMonthlyBilan, useMonthlyCR, useMonthlyTFT, useRatios, useStatements, useTAFIRE, useTFT } from '../hooks/useFinancials';
import { bySection, computeIntermediates, CR_FLOW, CRSection, CustomSection, INTERMEDIATE_LABELS, loadCustomSections, loadLabels, loadOrder, saveCustomSections, saveLabels, saveOrder } from '../engine/budgetActual';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import { useApp } from '../store/app';
import { useChartTheme } from '../lib/chartTheme';
// Line type utilisé via CollapsibleTable
import type { BalanceRow } from '../engine/balance';
import { fmtFull, fmtK } from '../lib/format';
import { CollapsibleTable } from '../components/ui/CollapsibleTable';
import { exportStatementsPDF, exportStatementsXLSX } from '../engine/exporter';
import { availableTabs, resolveSystem, simplifyBilanActif, simplifyBilanPassif, simplifyCR, SYSTEM_META, type StatementTab } from '../syscohada/systems';

const ALL_TABS: Record<StatementTab, string> = {
  bilan: 'Bilan',
  cr: 'Compte de résultat',
  tft: 'TFT',
  tafire: 'TAFIRE',
  cp: 'Variation capitaux propres',
  smt: 'Recettes / Dépenses',
};

type ViewMode = 'synthetic' | 'monthly';

function MonthlyTable({ months, lines, hideCodes }: { months: string[]; lines: any[]; hideCodes?: boolean }) {
  // Grouper les lignes : chaque ligne total/grand termine un groupe dont les lignes précédentes sont les détails
  const groups: Array<{ total: any; details: any[] }> = [];
  let buffer: any[] = [];
  for (const l of lines) {
    if (l.total || l.grand) { groups.push({ total: l, details: buffer }); buffer = []; }
    else buffer.push(l);
  }
  if (buffer.length > 0) groups.push({ total: null, details: buffer });

  const keyOf = (g: typeof groups[number], idx: number) => g.total ? `t-${g.total.code}-${idx}` : `orph-${idx}`;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g, i) => [keyOf(g, i), true]))
  );
  const expandAll = () => setExpanded(Object.fromEntries(groups.map((g, i) => [keyOf(g, i), true])));
  const collapseAll = () => setExpanded({});

  const renderRow = (l: any, i: string | number, isDetail = false) => (
    <tr key={i} className={clsx(
      'border-b border-primary-200 dark:border-primary-800',
      l.total && !l.grand && 'bg-primary-200/40 dark:bg-primary-800/30 font-semibold',
      l.grand && 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-bold',
      isDetail && 'bg-primary-50/50 dark:bg-primary-950/30',
    )}>
      <td className="py-1.5 w-8 text-center"></td>
      {!hideCodes && (
        <td className="py-1.5 px-2 text-[10px] num font-mono text-primary-500">{l.accountCodes ?? ''}</td>
      )}
      <td className="py-1.5 px-2 sticky left-0 bg-inherit" style={{ paddingLeft: `${8 + (l.indent ?? 0) * 10}px` }}>
        {l.label}
      </td>
      {l.values.map((v: number, idx: number) => (
        <td key={idx} className={clsx('py-1.5 px-2 text-right num', isDetail && 'text-[10px]')}>
          {v !== 0 ? fmtFull(v) : <span className="text-primary-400">—</span>}
        </td>
      ))}
      <td className={clsx('py-1.5 px-2 text-right num font-bold', isDetail && 'text-[10px]')}>{fmtFull(l.ytd)}</td>
    </tr>
  );

  const renderTotal = (l: any, k: string, hasDetails: boolean) => (
    <tr key={k} className={clsx(
      'border-b border-primary-200 dark:border-primary-800',
      l.total && !l.grand && 'bg-primary-200/40 dark:bg-primary-800/30 font-semibold',
      l.grand && 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-bold',
    )}>
      <td className="py-1.5 pl-2 w-8 text-center">
        {hasDetails && (
          <button onClick={() => setExpanded((e) => ({ ...e, [k]: !e[k] }))}
            className="w-5 h-5 rounded hover:bg-primary-100 dark:hover:bg-primary-800 text-xs font-bold">
            {expanded[k] ? '−' : '+'}
          </button>
        )}
      </td>
      {!hideCodes && (
        <td className="py-1.5 px-2 text-[10px] num font-mono text-primary-500">{l.accountCodes ?? ''}</td>
      )}
      <td className="py-1.5 px-2 sticky left-0 bg-inherit" style={{ paddingLeft: `${8 + (l.indent ?? 0) * 10}px` }}>
        {l.label}
      </td>
      {l.values.map((v: number, idx: number) => (
        <td key={idx} className="py-1.5 px-2 text-right num whitespace-nowrap">
          {v !== 0 ? fmtFull(v) : <span className="text-primary-400">—</span>}
        </td>
      ))}
      <td className="py-1.5 px-2 text-right num font-bold">{fmtFull(l.ytd)}</td>
    </tr>
  );

  return (
    <div>
      <div className="flex justify-end gap-1 p-2 border-b border-primary-200 dark:border-primary-800">
        <button onClick={expandAll} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout déplier</button>
        <span className="text-primary-300">·</span>
        <button onClick={collapseAll} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout replier</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b-2 border-primary-300 dark:border-primary-700 sticky top-0 bg-primary-100 dark:bg-primary-900">
            <tr>
              <th className="w-8"></th>
              {!hideCodes && <th className="text-left py-2 px-2 w-32 text-primary-500 uppercase tracking-wider text-[10px]">Comptes</th>}
              <th className="text-left py-2 px-2 sticky left-0 bg-primary-100 dark:bg-primary-900 z-10 min-w-[220px] text-primary-500 uppercase tracking-wider text-[10px]">Poste</th>
              {months.map((m) => (
                <th key={m} className="text-right py-2 px-2 min-w-[90px] text-primary-500 uppercase tracking-wider text-[10px]">{m}</th>
              ))}
              <th className="text-right py-2 px-2 min-w-[110px] font-bold text-primary-900 dark:text-primary-100 uppercase tracking-wider text-[10px]">YTD</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const k = keyOf(g, gi);
              const hasDetails = g.details.length > 0;
              const isOpen = expanded[k];
              if (!g.total) {
                // Orphelins (pas de total de fin)
                return g.details.map((d, di) => renderRow(d, `orph-${gi}-${di}`));
              }
              return [
                isOpen ? g.details.map((d, di) => renderRow(d, `${k}-d-${di}`, true)) : null,
                renderTotal(g.total, k, hasDetails),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function CRTab({ monthlyCR, cr, simplified, hideCodes }: { monthlyCR: any; cr: any[]; simplified?: boolean; hideCodes?: boolean }) {
  void simplified; // consumer may use it to disable sub-tabs if needed
  const [sub, setSub] = useState<'synthese' | 'mensuel' | 'budget' | 'personnaliser'>('personnaliser');
  return (
    <div>
      <div className="flex gap-1 p-1 bg-primary-200 dark:bg-primary-800 rounded-lg mb-4 w-fit">
        {[
          { k: 'personnaliser', label: 'Personnaliser' },
          { k: 'synthese', label: 'Synthèse' },
          { k: 'mensuel', label: 'Mensuel (Jan→Déc)' },
          { k: 'budget', label: 'Budget vs Réalisé' },
        ].map((t) => (
          <button key={t.k} onClick={() => setSub(t.k as any)}
            className={clsx('px-4 py-1.5 text-xs rounded-md font-medium transition',
              sub === t.k ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600 dark:text-primary-400')}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'synthese' && <CRSynthese cr={cr} hideCodes={hideCodes} />}
      {sub === 'mensuel' && (
        <Card title="Compte de résultat mensuel" subtitle="Valeurs du mois — non cumulées" padded={false}>
          <MonthlyTable months={monthlyCR.months} lines={monthlyCR.lines} hideCodes={hideCodes} />
        </Card>
      )}
      {sub === 'budget' && <BudgetActualView />}
      {sub === 'personnaliser' && <CRCustomize cr={cr} hideCodes={hideCodes} />}
    </div>
  );
}

// ─── CR SYNTHÈSE — LECTURE SEULE (custom ordre + libellés appliqués) ─────
function CRSynthese({ cr, hideCodes }: { cr: any[]; hideCodes?: boolean }) {
  const { currentOrgId } = useApp();
  const rows = useBudgetActual();
  const [labels, setLabels] = useState<Record<CRSection, string>>(() => loadLabels(currentOrgId));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => { setLabels(loadLabels(currentOrgId)); }, [currentOrgId]);

  const sectionsAll = bySection(rows, currentOrgId);
  const secMap = new Map(sectionsAll.map((s) => [s.section, s]));
  const inters = computeIntermediates(sectionsAll);

  const customs = loadCustomSections(currentOrgId);
  const customIds = new Set(customs.map((c) => c.id));
  const flow: Array<{ kind: 'section'; key: string; sec: ReturnType<typeof bySection>[number] | undefined } | { kind: 'inter'; key: string; data: { realise: number; budget: number } }> = CR_FLOW.map((item) =>
    item.kind === 'section'
      ? { kind: 'section' as const, key: item.key, sec: secMap.get(item.key) }
      : { kind: 'inter' as const, key: item.key, data: inters[item.key] }
  );
  // Append custom sections after standard CR
  for (const s of sectionsAll) {
    if (customIds.has(s.section)) flow.push({ kind: 'section', key: s.section, sec: s });
  }

  const toggle = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));
  const expandAll = () => setExpanded(Object.fromEntries(sectionsAll.map((s) => [s.section, true])));
  const collapseAll = () => setExpanded({});

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <button className="btn-outline !py-1.5 text-xs" onClick={expandAll}>Tout déplier</button>
          <button className="btn-outline !py-1.5 text-xs" onClick={collapseAll}>Tout replier</button>
        </div>
        <p className="text-[11px] text-primary-500">Vue de synthèse — utilisez l'onglet <strong>Personnaliser</strong> pour réordonner ou renommer les sections.</p>
      </div>

      <Card padded={false}>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700">
            <tr>
              <th className="text-left py-2 px-3 w-8"></th>
              <th className="text-left py-2 px-3">Section / compte</th>
              <th className="text-right py-2 px-3 w-44 whitespace-nowrap">Réalisé</th>
              <th className="text-right py-2 px-3 w-44 whitespace-nowrap">Budget</th>
              <th className="text-right py-2 px-3 w-40 whitespace-nowrap">Écart</th>
              <th className="text-right py-2 px-3 w-24">% activité</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {flow.map((item, idx) => {
              if (item.kind === 'inter') {
                const isFinal = item.key === 'res_net';
                const ecart = item.data.realise - item.data.budget;
                return (
                  <tr key={`i-${item.key}`}
                    className={clsx('font-bold',
                      isFinal ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'bg-primary-300/40 dark:bg-primary-700/40')}>
                    <td colSpan={2} className="py-2.5 px-3 uppercase text-xs tracking-wider">
                      = {INTERMEDIATE_LABELS[item.key as keyof typeof INTERMEDIATE_LABELS]}
                    </td>
                    <td className="py-2.5 px-3 text-right num whitespace-nowrap">{fmtFull(item.data.realise)}</td>
                    <td className="py-2.5 px-3 text-right num whitespace-nowrap">{fmtFull(item.data.budget)}</td>
                    <td className="py-2.5 px-3 text-right num whitespace-nowrap">{ecart >= 0 ? '+' : ''}{fmtFull(ecart)}</td>
                    <td></td>
                  </tr>
                );
              }
              const s = item.sec;
              if (!s) return null;
              const open = expanded[s.section];
              const operator = s.isCharge ? '−' : '+';
              return (
                <React.Fragment key={`s-${s.section}-${idx}`}>
                  <tr className={clsx('font-semibold',
                    s.isCharge ? 'bg-primary-100 dark:bg-primary-900' : 'bg-primary-200/60 dark:bg-primary-800/60')}>
                    <td className="py-2 px-2">
                      <button onClick={() => toggle(s.section)} className="btn-ghost !p-1 text-sm font-bold">
                        {open ? '−' : '+'}
                      </button>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className={clsx('font-bold w-3 text-center', s.isCharge ? 'text-error' : 'text-success')}>{operator}</span>
                        <span>{labels[s.section]}</span>
                        <span className="text-[10px] text-primary-400 font-normal">({s.rows.length} comptes)</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right num whitespace-nowrap">{fmtFull(s.totalRealise)}</td>
                    <td className="py-2 px-3 text-right num text-primary-500 font-normal">{fmtFull(s.totalBudget)}</td>
                    <td className={clsx('py-2 px-3 text-right num',
                      s.totalEcart > 0 ? (s.isCharge ? 'text-error' : 'text-success') : (s.isCharge ? 'text-success' : 'text-error'))}>
                      {s.totalEcart >= 0 ? '+' : ''}{fmtFull(s.totalEcart)}
                    </td>
                    <td className="py-2 px-3 text-right num text-xs text-primary-500 font-normal">—</td>
                  </tr>
                  {open && s.rows.map((r) => (
                    <tr key={r.code} className="bg-primary-50 dark:bg-primary-950">
                      <td></td>
                      <td className="py-1.5 px-3 pl-12 text-xs">
                        {!hideCodes && <span className="font-mono text-primary-500 mr-2">{r.code}</span>}
                        {r.label}
                      </td>
                      <td className="py-1.5 px-3 text-right num text-xs">{fmtFull(r.realise)}</td>
                      <td className="py-1.5 px-3 text-right num text-xs text-primary-500">{fmtFull(r.budget)}</td>
                      <td className={clsx('py-1.5 px-3 text-right num text-xs',
                        r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                        {r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}
                      </td>
                      <td className="py-1.5 px-3 text-right num text-[10px] text-primary-400">
                        {s.totalRealise ? ((r.realise / s.totalRealise) * 100).toFixed(1) : 0} %
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-primary-700 dark:text-primary-300">
          Voir le compte de résultat officiel SYSCOHADA (référence)
        </summary>
        <div className="mt-4">
          <CollapsibleTable lines={cr} />
        </div>
      </details>
    </div>
  );
}

// ─── CR PERSONNALISER — DRAG & DROP + LABELS ÉDITABLES ─────
function CRCustomize({ cr, hideCodes }: { cr: any[]; hideCodes?: boolean }) {
  const { currentOrgId } = useApp();
  const rows = useBudgetActual();
  const [order, setOrder] = useState<CRSection[]>(() => loadOrder(currentOrgId));
  const [labels, setLabels] = useState<Record<CRSection, string>>(() => loadLabels(currentOrgId));
  const [customs, setCustoms] = useState<CustomSection[]>(() => loadCustomSections(currentOrgId));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<CRSection | null>(null);
  const [drag, setDrag] = useState<CRSection | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newSec, setNewSec] = useState<{ label: string; prefixes: string; isCharge: boolean }>({ label: '', prefixes: '', isCharge: false });

  useEffect(() => {
    setOrder(loadOrder(currentOrgId));
    setLabels(loadLabels(currentOrgId));
    setCustoms(loadCustomSections(currentOrgId));
  }, [currentOrgId]);

  const sectionsAll = bySection(rows, currentOrgId);
  const secMap = new Map(sectionsAll.map((s) => [s.section, s]));
  const inters = computeIntermediates(sectionsAll);
  const customIds = new Set(customs.map((c) => c.id));

  const toggle = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));
  const expandAll = () => setExpanded(Object.fromEntries(sectionsAll.map((s) => [s.section, true])));
  const collapseAll = () => setExpanded({});

  const updateLabel = (key: CRSection, v: string) => {
    const next = { ...labels, [key]: v };
    setLabels(next); saveLabels(currentOrgId, next);
  };
  const reset = () => {
    if (!confirm('Restaurer les libellés, l\'ordre et supprimer les sections personnalisées ?')) return;
    localStorage.removeItem(`cr-section-labels:${currentOrgId}`);
    localStorage.removeItem(`cr-section-order:${currentOrgId}`);
    localStorage.removeItem(`cr-section-custom:${currentOrgId}`);
    setCustoms([]);
    setOrder(loadOrder(currentOrgId));
    setLabels(loadLabels(currentOrgId));
  };

  const addSection = () => {
    const label = newSec.label.trim();
    const prefixes = newSec.prefixes.split(',').map((s) => s.trim()).filter(Boolean);
    if (!label || !prefixes.length) { alert('Libellé et préfixes requis (ex : 605, 611)'); return; }
    const id = `custom_${Date.now()}`;
    const next = [...customs, { id, label, prefixes, isCharge: newSec.isCharge }];
    setCustoms(next); saveCustomSections(currentOrgId, next);
    const nextOrder = [...order, id];
    setOrder(nextOrder); saveOrder(currentOrgId, nextOrder);
    const nextLabels = { ...labels, [id]: label };
    setLabels(nextLabels); saveLabels(currentOrgId, nextLabels);
    setNewSec({ label: '', prefixes: '', isCharge: false });
    setShowAdd(false);
  };
  const removeSection = (id: string) => {
    if (!confirm('Supprimer cette section personnalisée ?')) return;
    const next = customs.filter((c) => c.id !== id);
    setCustoms(next); saveCustomSections(currentOrgId, next);
    const nextOrder = order.filter((o) => o !== id);
    setOrder(nextOrder); saveOrder(currentOrgId, nextOrder);
  };

  const onDragStart = (k: CRSection) => setDrag(k);
  const onDragOver = (e: React.DragEvent, _target: CRSection) => { e.preventDefault(); };
  const onDrop = (target: CRSection) => {
    if (!drag || drag === target) return;
    const newOrder = [...order];
    const from = newOrder.indexOf(drag);
    const to = newOrder.indexOf(target);
    if (from < 0 || to < 0) return;
    newOrder.splice(from, 1);
    newOrder.splice(to, 0, drag);
    setOrder(newOrder); saveOrder(currentOrgId, newOrder);
    setDrag(null);
  };

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary !py-1.5 text-xs" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Annuler' : '+ Nouvelle section'}
          </button>
          <button className="btn-outline !py-1.5 text-xs" onClick={expandAll}>Tout déplier</button>
          <button className="btn-outline !py-1.5 text-xs" onClick={collapseAll}>Tout replier</button>
          <button className="btn-outline !py-1.5 text-xs" onClick={reset}>Réinitialiser</button>
        </div>
        <p className="text-[11px] text-primary-500">Glissez-déposez · crayon pour renommer · +/− pour déplier · enregistrement automatique</p>
      </div>

      {showAdd && (
        <Card padded>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-primary-500 mb-1 block">Libellé</label>
              <input className="input !py-1.5 text-sm w-full" placeholder="Ex : Loyers et charges locatives"
                value={newSec.label} onChange={(e) => setNewSec((s) => ({ ...s, label: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] uppercase tracking-wider text-primary-500 mb-1 block">Préfixes de comptes (séparés par ,)</label>
              <input className="input !py-1.5 text-sm w-full font-mono" placeholder="Ex : 613, 614"
                value={newSec.prefixes} onChange={(e) => setNewSec((s) => ({ ...s, prefixes: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-primary-500 mb-1 block">Nature</label>
              <select className="input !py-1.5 text-sm w-full" value={newSec.isCharge ? '1' : '0'}
                onChange={(e) => setNewSec((s) => ({ ...s, isCharge: e.target.value === '1' }))}>
                <option value="0">Produit (+)</option>
                <option value="1">Charge (−)</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary !py-1.5 text-xs" onClick={addSection}>Ajouter la section</button>
          </div>
        </Card>
      )}

      <Card padded={false}>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700">
            <tr>
              <th className="text-left py-2 px-3 w-8"></th>
              <th className="text-left py-2 px-3 w-8"></th>
              <th className="text-left py-2 px-3">Section / compte</th>
              <th className="text-right py-2 px-3 w-32">Réalisé</th>
              <th className="text-right py-2 px-3 w-32">Budget</th>
              <th className="text-right py-2 px-3 w-28">Écart</th>
              <th className="text-right py-2 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {order.map((id, idx) => {
              const s = secMap.get(id);
              if (!s) return null;
              const open = expanded[s.section];
              const isOver = drag && drag !== s.section;
              const operator = s.isCharge ? '−' : '+';
              const isCustom = customIds.has(id);
              return (
                <React.Fragment key={`s-${s.section}-${idx}`}>
                  <tr
                    draggable
                    onDragStart={() => onDragStart(s.section)}
                    onDragOver={(e) => onDragOver(e, s.section)}
                    onDrop={() => onDrop(s.section)}
                    className={clsx('cursor-move font-semibold',
                      drag === s.section && 'opacity-50',
                      isOver && 'border-t-2 border-primary-900 dark:border-primary-100',
                      s.isCharge ? 'bg-primary-100 dark:bg-primary-900' : 'bg-primary-200/60 dark:bg-primary-800/60')}
                  >
                    <td className="py-2 px-3 text-center text-primary-400 cursor-grab"><GripIcon /></td>
                    <td className="py-2 px-2">
                      <button onClick={() => toggle(s.section)} className="btn-ghost !p-1 text-sm font-bold">
                        {open ? '−' : '+'}
                      </button>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className={clsx('font-bold w-3 text-center', s.isCharge ? 'text-error' : 'text-success')}>{operator}</span>
                        {editing === s.section ? (
                          <input
                            autoFocus
                            className="input !py-1 text-sm font-semibold flex-1"
                            value={labels[s.section] ?? ''}
                            onChange={(e) => updateLabel(s.section, e.target.value)}
                            onBlur={() => setEditing(null)}
                            onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                          />
                        ) : (
                          <>
                            <span>{labels[s.section] ?? s.label}</span>
                            <button onClick={() => setEditing(s.section)} className="btn-ghost !p-1 text-xs opacity-50 hover:opacity-100" title="Renommer">✎</button>
                          </>
                        )}
                        {isCustom && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-300 dark:bg-primary-700 text-primary-700 dark:text-primary-300">custom</span>}
                        <span className="text-[10px] text-primary-400 font-normal">({s.rows.length} comptes)</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right num whitespace-nowrap">{fmtFull(s.totalRealise)}</td>
                    <td className="py-2 px-3 text-right num text-primary-500 font-normal">{fmtFull(s.totalBudget)}</td>
                    <td className={clsx('py-2 px-3 text-right num',
                      s.totalEcart > 0 ? (s.isCharge ? 'text-error' : 'text-success') : (s.isCharge ? 'text-success' : 'text-error'))}>
                      {s.totalEcart >= 0 ? '+' : ''}{fmtFull(s.totalEcart)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {isCustom && (
                        <button onClick={() => removeSection(id)} className="btn-ghost !p-1 text-xs text-primary-500 hover:text-error" title="Supprimer">✕</button>
                      )}
                    </td>
                  </tr>
                  {open && s.rows.map((r) => (
                    <tr key={r.code} className="bg-primary-50 dark:bg-primary-950">
                      <td colSpan={2}></td>
                      <td className="py-1.5 px-3 pl-12 text-xs">
                        {!hideCodes && <span className="font-mono text-primary-500 mr-2">{r.code}</span>}
                        {r.label}
                      </td>
                      <td className="py-1.5 px-3 text-right num text-xs">{fmtFull(r.realise)}</td>
                      <td className="py-1.5 px-3 text-right num text-xs text-primary-500">{fmtFull(r.budget)}</td>
                      <td className={clsx('py-1.5 px-3 text-right num text-xs',
                        r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                        {r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}
                      </td>
                      <td></td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Résultats intermédiaires (calculés sur les sections standard) */}
      <Card title="Résultats intermédiaires" subtitle="Calculés à partir des sections SYSCOHADA standard" padded={false}>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {CR_FLOW.filter((i) => i.kind === 'inter').map((item: any) => {
              const data = inters[item.key as keyof typeof inters];
              const isFinal = item.key === 'res_net';
              const ecart = data.realise - data.budget;
              return (
                <tr key={item.key}
                  className={clsx('font-bold',
                    isFinal ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'bg-primary-300/40 dark:bg-primary-700/40')}>
                  <td className="py-2.5 px-3 uppercase text-xs tracking-wider">= {INTERMEDIATE_LABELS[item.key as keyof typeof INTERMEDIATE_LABELS]}</td>
                  <td className="py-2.5 px-3 text-right num w-32">{fmtFull(data.realise)}</td>
                  <td className="py-2.5 px-3 text-right num w-32">{fmtFull(data.budget)}</td>
                  <td className="py-2.5 px-3 text-right num w-28">{ecart >= 0 ? '+' : ''}{fmtFull(ecart)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-primary-700 dark:text-primary-300">
          Voir le compte de résultat officiel SYSCOHADA (référence)
        </summary>
        <div className="mt-4">
          <CollapsibleTable lines={cr} />
        </div>
      </details>
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" className="inline-block fill-current">
      <circle cx="2" cy="2" r="1" /><circle cx="8" cy="2" r="1" />
      <circle cx="2" cy="7" r="1" /><circle cx="8" cy="7" r="1" />
      <circle cx="2" cy="12" r="1" /><circle cx="8" cy="12" r="1" />
    </svg>
  );
}

// ─── VARIATION CAPITAUX PROPRES — collapsible ──────────────────────
function CapitalVarCard({ rows, hideCodes }: { rows: any[]; hideCodes?: boolean }) {
  const [open, setOpen] = useState(true);
  const detail = rows.filter((r) => !r.rubrique.startsWith('TOTAL'));
  const total = rows.find((r) => r.rubrique.startsWith('TOTAL'));

  return (
    <Card title="Variation des capitaux propres" subtitle="Évolution par rubrique entre ouverture et clôture" padded={false}
      action={
        <div className="flex gap-1">
          <button onClick={() => setOpen(true)} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout déplier</button>
          <span className="text-primary-300">·</span>
          <button onClick={() => setOpen(false)} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout replier</button>
        </div>
      }>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700">
            <tr>
              <th className="text-left py-2 w-8"></th>
              {!hideCodes && <th className="text-left py-2 px-3 w-28">Comptes</th>}
              <th className="text-left py-2 px-3">Rubrique</th>
              <th className="text-right py-2 px-3">Solde ouverture</th>
              <th className="text-right py-2 px-3">Augmentation</th>
              <th className="text-right py-2 px-3">Diminution</th>
              <th className="text-right py-2 px-3">Affect. résultat N-1</th>
              <th className="text-right py-2 px-3">Résultat exercice</th>
              <th className="text-right py-2 px-3">Solde clôture</th>
            </tr>
          </thead>
          <tbody>
            {open && detail.map((m, i) => (
              <tr key={i} className="border-b border-primary-100 dark:border-primary-800/50 bg-primary-50/50 dark:bg-primary-950/30">
                <td className="py-1.5"></td>
                {!hideCodes && <td className="py-1.5 px-3 text-xs num font-mono text-primary-500">{m.accountCodes ?? ''}</td>}
                <td className="py-1.5 px-3 text-xs">{m.rubrique}</td>
                <td className="py-1.5 px-3 text-right num text-xs">{fmtFull(m.ouverture)}</td>
                <td className="py-1.5 px-3 text-right num text-xs text-success">{m.augmentation ? '+ ' + fmtFull(m.augmentation) : '—'}</td>
                <td className="py-1.5 px-3 text-right num text-xs text-error">{m.diminution ? '− ' + fmtFull(m.diminution) : '—'}</td>
                <td className="py-1.5 px-3 text-right num text-xs">{m.affectationResN1 ? fmtFull(m.affectationResN1) : '—'}</td>
                <td className="py-1.5 px-3 text-right num text-xs">{m.resultatExercice ? fmtFull(m.resultatExercice) : '—'}</td>
                <td className="py-1.5 px-3 text-right num text-xs font-semibold">{fmtFull(m.cloture)}</td>
              </tr>
            ))}
            {total && (
              <tr className="bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-bold">
                <td className="py-2 pl-2 w-8 text-center">
                  <button onClick={() => setOpen(!open)} className="w-5 h-5 rounded hover:bg-primary-700 dark:hover:bg-primary-300 text-xs font-bold" title={open ? 'Replier' : 'Déplier'}>
                    {open ? '−' : '+'}
                  </button>
                </td>
                {!hideCodes && <td className="py-2 px-3 text-xs num font-mono">10-15</td>}
                <td className="py-2 px-3">{total.rubrique}</td>
                <td className="py-2 px-3 text-right num whitespace-nowrap">{fmtFull(total.ouverture)}</td>
                <td className="py-2 px-3 text-right num whitespace-nowrap">+ {fmtFull(total.augmentation)}</td>
                <td className="py-2 px-3 text-right num whitespace-nowrap">− {fmtFull(total.diminution)}</td>
                <td className="py-2 px-3 text-right num whitespace-nowrap">{fmtFull(total.affectationResN1)}</td>
                <td className="py-2 px-3 text-right num whitespace-nowrap">{fmtFull(total.resultatExercice)}</td>
                <td className="py-2 px-3 text-right num whitespace-nowrap">{fmtFull(total.cloture)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── BUDGET vs ACTUAL ──────────────────────────────────────────────
function BudgetActualView() {
  const rows = useBudgetActual();
  const ct = useChartTheme();
  const [view, setView] = useState<'table' | 'dashboard' | 'monthly'>('table');
  const sections = bySection(rows);
  const intermediates = computeIntermediates(sections);
  // Totaux SYSCOHADA cohérents :
  //   Produits = sections produits (70-79, 82, 84, 86, 88)
  //   Charges  = sections charges (60-69, 81, 83, 85) + impôts (87, 89)
  //   Résultat = Produits − Charges
  const totalProduitsR = sections.filter((s) => !s.isCharge).reduce((sum, s) => sum + s.totalRealise, 0);
  const totalChargesR  = sections.filter((s) =>  s.isCharge).reduce((sum, s) => sum + s.totalRealise, 0);
  const totalProduitsB = sections.filter((s) => !s.isCharge).reduce((sum, s) => sum + s.totalBudget, 0);
  const totalChargesB  = sections.filter((s) =>  s.isCharge).reduce((sum, s) => sum + s.totalBudget, 0);
  const resultatR = totalProduitsR - totalChargesR;
  const resultatB = totalProduitsB - totalChargesB;

  // Flux SYSCOHADA : sections entrelacées avec les résultats intermédiaires
  const secMap = new Map(sections.map((s) => [s.section, s]));
  const flow: Array<
    | { kind: 'section'; sec: (typeof sections)[number] }
    | { kind: 'inter'; key: keyof typeof intermediates; label: string }
  > = [];
  for (const item of CR_FLOW) {
    if (item.kind === 'section') {
      const sec = secMap.get(item.key);
      if (sec) flow.push({ kind: 'section', sec });
    } else {
      flow.push({ kind: 'inter', key: item.key, label: INTERMEDIATE_LABELS[item.key] });
    }
  }

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((s) => [s.section, true]))
  );
  const expandAll = () => setExpanded(Object.fromEntries(sections.map((s) => [s.section, true])));
  const collapseAll = () => setExpanded({});

  if (!rows.length) return <div className="py-12 text-center text-primary-500">Chargement…</div>;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 mr-4">
          <StatBox label="Résultat Réalisé" value={resultatR} highlight />
          <StatBox label="Résultat Budget" value={resultatB} />
          <StatBox label="Écart Résultat" value={resultatR - resultatB} highlight />
          <StatBox label="Comptes analysés" value={rows.length} />
        </div>
        <div className="flex gap-1 p-1 bg-primary-200 dark:bg-primary-800 rounded-lg">
          <button onClick={() => setView('table')}
            className={clsx('px-3 py-1.5 text-xs rounded-md font-medium',
              view === 'table' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600 dark:text-primary-400')}>Annuel</button>
          <button onClick={() => setView('monthly')}
            className={clsx('px-3 py-1.5 text-xs rounded-md font-medium',
              view === 'monthly' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600 dark:text-primary-400')}>Mensuel + N-1</button>
          <button onClick={() => setView('dashboard')}
            className={clsx('px-3 py-1.5 text-xs rounded-md font-medium',
              view === 'dashboard' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600 dark:text-primary-400')}>Tableau de bord</button>
        </div>
      </div>

      {view === 'table' && (
        <Card padded={false}>
          <div className="flex justify-end gap-1 p-2 border-b border-primary-200 dark:border-primary-800">
            <button onClick={expandAll} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout déplier</button>
            <span className="text-primary-300">·</span>
            <button onClick={collapseAll} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2">Tout replier</button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700 sticky top-0 bg-primary-100 dark:bg-primary-900">
              <tr>
                <th className="w-8"></th>
                <th className="text-left py-2 px-3">Section</th>
                <th className="text-left py-2 px-3">Compte</th>
                <th className="text-left py-2 px-3">Libellé</th>
                <th className="text-right py-2 px-3">Réalisé</th>
                <th className="text-right py-2 px-3">Budget</th>
                <th className="text-right py-2 px-3">Écart</th>
                <th className="text-right py-2 px-3">Écart %</th>
                <th className="text-center py-2 px-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {flow.map((item, idx) => {
                if (item.kind === 'inter') {
                  const data = intermediates[item.key];
                  const ecart = data.realise - data.budget;
                  const ecartPct = data.budget ? (ecart / Math.abs(data.budget)) * 100 : 0;
                  const isFinal = item.key === 'res_net';
                  return (
                    <tr key={`i-${item.key}`}
                      className={clsx('font-bold',
                        isFinal ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'bg-primary-300/40 dark:bg-primary-700/40')}>
                      <td></td>
                      <td className="py-2.5 px-3 uppercase text-xs tracking-wider" colSpan={3}>= {item.label}</td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{fmtFull(data.realise)}</td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{fmtFull(data.budget)}</td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{ecart >= 0 ? '+' : ''}{fmtFull(ecart)}</td>
                      <td className="py-2.5 px-3 text-right num text-xs">{ecartPct >= 0 ? '+' : ''}{ecartPct.toFixed(1)} %</td>
                      <td></td>
                    </tr>
                  );
                }
                const sec = item.sec;
                return (
                  <React.Fragment key={`s-${sec.section}-${idx}`}>
                    <tr className="bg-primary-200 dark:bg-primary-800 font-semibold">
                      <td className="py-2 pl-2 w-8 text-center">
                        <button onClick={() => setExpanded((e) => ({ ...e, [sec.section]: !e[sec.section] }))}
                          className="w-5 h-5 rounded hover:bg-primary-300 dark:hover:bg-primary-700 text-xs font-bold">
                          {expanded[sec.section] ? '−' : '+'}
                        </button>
                      </td>
                      <td className="py-2 px-3" colSpan={3}>
                        <span className={clsx('mr-2 font-bold text-base', sec.isCharge ? 'text-error' : 'text-success')}>{sec.isCharge ? '−' : '+'}</span>
                        {sec.label} <span className="text-[10px] text-primary-500 font-normal">({sec.rows.length} comptes)</span>
                      </td>
                      <td className="py-2 px-3 text-right num whitespace-nowrap">{fmtFull(sec.totalRealise)}</td>
                      <td className="py-2 px-3 text-right num whitespace-nowrap">{fmtFull(sec.totalBudget)}</td>
                      <td className={clsx('py-2 px-3 text-right num',
                        sec.totalEcart > 0 ? (sec.isCharge ? 'text-error' : 'text-success') : (sec.isCharge ? 'text-success' : 'text-error'))}>
                        {sec.totalEcart >= 0 ? '+' : ''}{fmtFull(sec.totalEcart)}
                      </td>
                      <td className="py-2 px-3 text-right num text-xs">{sec.ecartPct >= 0 ? '+' : ''}{sec.ecartPct.toFixed(1)} %</td>
                      <td></td>
                    </tr>
                    {expanded[sec.section] && sec.rows.map((r) => (
                      <tr key={r.code} className="border-b border-primary-100 dark:border-primary-800/50 bg-primary-50/50 dark:bg-primary-950/30 hover:bg-primary-100 dark:hover:bg-primary-900">
                        <td></td>
                        <td></td>
                        <td className="py-1.5 px-3 num font-mono text-xs">{r.code}</td>
                        <td className="py-1.5 px-3 text-xs">{r.label}</td>
                        <td className="py-1.5 px-3 text-right num whitespace-nowrap">{fmtFull(r.realise)}</td>
                        <td className="py-1.5 px-3 text-right num text-primary-500">{fmtFull(r.budget)}</td>
                        <td className={clsx('py-1.5 px-3 text-right num',
                          r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : '')}>
                          {r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}
                        </td>
                        <td className="py-1.5 px-3 text-right num text-xs">{r.ecartPct >= 0 ? '+' : ''}{r.ecartPct.toFixed(1)} %</td>
                        <td className="py-1.5 px-3 text-center">
                          <span className={clsx('text-xs font-semibold',
                            r.status === 'favorable' ? 'text-success' : r.status === 'defavorable' ? 'text-error' : 'text-primary-400')}>
                            {r.status === 'favorable' ? '✓' : r.status === 'defavorable' ? '⚠' : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {view === 'monthly' && <BudgetMonthlyView />}

      {view === 'dashboard' && (
        <div className="space-y-6">
          <Card title="Réalisé vs Budget par section" padded={false}>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={sections.map((s) => ({ name: s.label, Réalisé: s.totalRealise, Budget: s.totalBudget }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Réalisé" fill={ct.bar} radius={[3,3,0,0]} />
                  <Bar dataKey="Budget" fill={ct.barAlt} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Écarts par section (en valeur absolue)" padded={false}>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sections.map((s) => ({ name: s.label, ecart: s.totalEcart, isCharge: s.isCharge }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${fmtK(v)}`} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Bar dataKey="ecart" radius={[4,4,0,0]}>
                    {sections.map((s, i) => {
                      const fav = s.totalEcart > 0 ? (s.isCharge ? '#a3a3a3' : '#171717') : (s.isCharge ? '#171717' : '#a3a3a3');
                      return <Cell key={i} fill={Math.abs(s.totalEcart) < 1 ? '#a3a3a3' : fav} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-primary-500 mt-3">Favorable : charges &lt; budget ou produits &gt; budget. Defavorable : inverse.</p>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Top 5 dépassements">
              <div className="space-y-2">
                {rows.filter((r) => r.status === 'defavorable').sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart)).slice(0, 5).map((r) => (
                  <div key={r.code} className="flex justify-between border-b border-primary-200 dark:border-primary-800 py-2">
                    <span className="text-xs"><span className="font-mono mr-2 text-primary-500">{r.code}</span>{r.label}</span>
                    <span className="text-xs num text-error font-semibold">{r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Top 5 économies">
              <div className="space-y-2">
                {rows.filter((r) => r.status === 'favorable').sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart)).slice(0, 5).map((r) => (
                  <div key={r.code} className="flex justify-between border-b border-primary-200 dark:border-primary-800 py-2">
                    <span className="text-xs"><span className="font-mono mr-2 text-primary-500">{r.code}</span>{r.label}</span>
                    <span className="text-xs num text-success font-semibold">{r.ecart >= 0 ? '+' : ''}{fmtFull(r.ecart)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={clsx('card p-3', highlight && 'border-primary-400 dark:border-primary-600')}>
      <p className="text-xs text-primary-500">{label}</p>
      <p className={clsx('num text-lg font-bold mt-1', value < 0 ? 'text-error' : value > 0 ? 'text-success' : '')}>
        {fmtFull(value)}
      </p>
    </div>
  );
}


export default function States() {
  const [tab, setTab] = useState<StatementTab>('bilan');
  const [view, setView] = useState<ViewMode>('monthly');
  const [hideCodes, setHideCodes] = useState(false);
  const { bilan, cr, balance } = useStatements();
  const monthlyCR = useMonthlyCR();
  const monthlyBilan = useMonthlyBilan();
  const ratios = useRatios();
  const tft = useTFT();
  const monthlyTFT = useMonthlyTFT();
  const tafire = useTAFIRE();
  const capitalVar = useCapitalVariation();
  const org = useCurrentOrg();
  const { currentPeriodId, currentYear } = useApp();

  if (!bilan) return <div className="py-20 text-center text-primary-500">Chargement…</div>;

  const system = resolveSystem(org?.accountingSystem);
  const tabsForSystem = availableTabs(system);
  void SYSTEM_META;
  if (!tabsForSystem.includes(tab)) setTab(tabsForSystem[0]);

  const periodLabel = currentPeriodId ? 'Période sélectionnée' : `Cumul YTD ${currentYear}`;

  const handleXLSX = () => {
    if (!org) return;
    exportStatementsXLSX({ org: org.name, period: periodLabel, balance, bilanActif: bilan.actif, bilanPassif: bilan.passif, cr, ratios });
  };
  const handlePDF = () => {
    if (!org) return;
    exportStatementsPDF({ org: org.name, period: periodLabel, bilanActif: bilan.actif, bilanPassif: bilan.passif, cr, ratios });
  };

  return (
    <div>
      <PageHeader
        title="États financiers de gestion"
        subtitle={`SYSCOHADA révisé 2017 · ${SYSTEM_META[system].label} · ${org?.name} · Exercice ${currentYear}`}
        action={
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-1.5 text-xs text-primary-500 cursor-pointer mr-2">
              <input type="checkbox" checked={hideCodes} onChange={(e) => setHideCodes(e.target.checked)} />
              Masquer les codes
            </label>
            <button className="btn-outline" onClick={() => window.print()}><Printer className="w-4 h-4" /> Imprimer</button>
            <button className="btn-outline" onClick={handlePDF}><Download className="w-4 h-4" /> PDF</button>
            <button className="btn-primary" onClick={handleXLSX}><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          </div>
        }
      />

      <div className="flex items-center justify-between border-b border-primary-200 dark:border-primary-800 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabsForSystem.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap',
                tab === t
                  ? 'border-primary-900 dark:border-primary-100 text-primary-900 dark:text-primary-100'
                  : 'border-transparent text-primary-500 hover:text-primary-900 dark:hover:text-primary-100',
              )}>
              {ALL_TABS[t]}
            </button>
          ))}
        </div>
        {(tab === 'bilan' || tab === 'tft') && (
          <div className="flex gap-1 p-1 bg-primary-200 dark:bg-primary-800 rounded-lg mb-2">
            <button onClick={() => setView('monthly')}
              className={clsx('px-3 py-1 text-xs rounded-md font-medium transition',
                view === 'monthly' ? 'bg-primary-50 dark:bg-primary-900 shadow' : 'text-primary-600 dark:text-primary-400')}>
              Mensuel (Jan → Déc)
            </button>
            <button onClick={() => setView('synthetic')}
              className={clsx('px-3 py-1 text-xs rounded-md font-medium transition',
                view === 'synthetic' ? 'bg-primary-50 dark:bg-primary-900 shadow' : 'text-primary-600 dark:text-primary-400')}>
              Synthétique
            </button>
          </div>
        )}
      </div>

      {tab === 'bilan' && view === 'monthly' && (
        <>
          <Card title="BILAN — ACTIF" subtitle="Soldes à la fin de chaque mois" padded={false}>
            <MonthlyTable months={monthlyBilan.months} lines={monthlyBilan.actif} hideCodes={hideCodes} />
          </Card>
          <div className="mt-6">
            <Card title="BILAN — PASSIF" subtitle="Soldes à la fin de chaque mois" padded={false}>
              <MonthlyTable months={monthlyBilan.months} lines={monthlyBilan.passif} hideCodes={hideCodes} />
            </Card>
          </div>
        </>
      )}

      {tab === 'bilan' && view === 'synthetic' && (
        <Card>
          {system === 'Allégé' && (
            <p className="mb-3 text-[11px] text-primary-500 italic">Vue Allégée — seuls les grands totaux sont affichés.</p>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <CollapsibleTable title="ACTIF"  lines={system === 'Allégé' ? simplifyBilanActif(bilan.actif)   : bilan.actif}  hideCodes={hideCodes} />
            <CollapsibleTable title="PASSIF" lines={system === 'Allégé' ? simplifyBilanPassif(bilan.passif) : bilan.passif} hideCodes={hideCodes} />
          </div>
          <div className="mt-4 pt-4 border-t border-primary-200 dark:border-primary-800 text-xs text-primary-500 flex justify-between">
            <span>Équilibre Actif / Passif : <span className="num font-semibold">{fmtFull(bilan.totalActif)}</span> / <span className="num font-semibold">{fmtFull(bilan.totalPassif)}</span></span>
            <span className={Math.abs(bilan.totalActif - bilan.totalPassif) < 1 ? 'text-success font-semibold' : 'text-error font-semibold'}>
              Écart : {fmtFull(bilan.totalActif - bilan.totalPassif)} XOF
            </span>
          </div>
        </Card>
      )}

      {tab === 'cr' && <CRTab monthlyCR={monthlyCR} cr={system === 'Allégé' ? simplifyCR(cr) : cr} simplified={system === 'Allégé'} hideCodes={hideCodes} />}

      {tab === 'tft' && view === 'monthly' && (
        <Card title="Tableau des Flux de Trésorerie — mensuel" subtitle="Méthode indirecte SYSCOHADA · Jan → Déc + cumul YTD" padded={false}>
          <MonthlyTable months={monthlyTFT.months} lines={monthlyTFT.lines} hideCodes />
        </Card>
      )}

      {tab === 'tft' && view === 'synthetic' && tft && (
        <Card title="Tableau des Flux de Trésorerie — synthétique" subtitle="Méthode indirecte — SYSCOHADA révisé 2017">
          <CollapsibleTable lines={tft.lines} hideCodes />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-primary-200 dark:border-primary-800">
            <StatBox label="CAFG" value={tft.totals.cafg} />
            <StatBox label="Flux opérationnels" value={tft.totals.fluxOperationnels} highlight />
            <StatBox label="Flux investissement" value={tft.totals.fluxInvestissement} />
            <StatBox label="Flux financement" value={tft.totals.fluxFinancement} />
          </div>
        </Card>
      )}

      {tab === 'tafire' && tafire && (
        <Card title="Tableau Financier des Ressources et Emplois" subtitle="TAFIRE — SYSCOHADA">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <CollapsibleTable title="EMPLOIS STABLES" lines={tafire.emplois} hideCodes={hideCodes} />
            <CollapsibleTable title="RESSOURCES STABLES" lines={tafire.ressources} hideCodes={hideCodes} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-primary-200 dark:border-primary-800">
            <StatBox label="Variation du FR" value={tafire.varFR} highlight />
            <StatBox label="Variation du BFR" value={tafire.varBFR} />
            <StatBox label="Variation trésorerie nette" value={tafire.varTN} highlight />
          </div>
          <div className="mt-4 text-xs text-primary-500">
            <span className="font-medium">Équation de contrôle : </span>
            Var FR ({fmtFull(tafire.varFR)}) − Var BFR ({fmtFull(tafire.varBFR)}) = Var TN ({fmtFull(tafire.varFR - tafire.varBFR)})
            {Math.abs((tafire.varFR - tafire.varBFR) - tafire.varTN) < 1
              ? <span className="text-success ml-2 font-semibold">✓ cohérent</span>
              : <span className="text-warning ml-2 font-semibold">⚠ écart {fmtFull((tafire.varFR - tafire.varBFR) - tafire.varTN)}</span>}
          </div>
        </Card>
      )}

      {tab === 'cp' && capitalVar.length > 0 && (
        <CapitalVarCard rows={capitalVar} hideCodes={hideCodes} />
      )}

      {tab === 'smt' && <SMTView balance={balance} currency={org?.currency ?? 'XOF'} />}
    </div>
  );
}

// ─── SMT — RECETTES / DÉPENSES ──────────────────────────────────────
function SMTView({ balance, currency }: { balance: BalanceRow[]; currency: string }) {
  const recettes = balance.filter((r) => r.account.startsWith('7')).reduce((s, r) => s + r.credit - r.debit, 0);
  const depenses = balance.filter((r) => r.account.startsWith('6')).reduce((s, r) => s + r.debit - r.credit, 0);
  const solde = recettes - depenses;
  const treso = balance.filter((r) => r.account.startsWith('5')).reduce((s, r) => s + r.soldeD - r.soldeC, 0);

  const byAccount = (prefix: string) => balance
    .filter((r) => r.account.startsWith(prefix) && (r.debit || r.credit))
    .map((r) => ({ ...r, mvt: prefix === '7' ? r.credit - r.debit : r.debit - r.credit }))
    .sort((a, b) => b.mvt - a.mvt);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI label="Recettes (classe 7)" value={recettes} currency={currency} color="text-success" />
        <KPI label="Dépenses (classe 6)" value={depenses} currency={currency} color="text-error" />
        <KPI label="Solde net" value={solde} currency={currency} color={solde >= 0 ? 'text-success' : 'text-error'} />
        <KPI label="Trésorerie (classe 5)" value={treso} currency={currency} color="text-primary-900 dark:text-primary-100" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Recettes détaillées" padded={false}>
          <SMTList rows={byAccount('7')} />
        </Card>
        <Card title="Dépenses détaillées" padded={false}>
          <SMTList rows={byAccount('6')} />
        </Card>
      </div>

      <p className="text-xs text-primary-500 italic">
        SMT — Système Minimal de Trésorerie : vue simplifiée des flux encaissés/décaissés.
        Pour un pilotage plus riche, passez en système Allégé ou Normal dans les paramètres de la société.
      </p>
    </div>
  );
}

function KPI({ label, value, currency, color }: { label: string; value: number; currency: string; color: string }) {
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">{label}</p>
      <p className={clsx('mt-1 text-2xl num font-bold', color)}>{fmtFull(value)}</p>
      <p className="text-[10px] text-primary-400 mt-0.5">{currency}</p>
    </Card>
  );
}

function SMTList({ rows }: { rows: (BalanceRow & { mvt: number })[] }) {
  if (rows.length === 0) return <div className="py-8 text-center text-sm text-primary-500">Aucun mouvement</div>;
  return (
    <div className="divide-y divide-primary-200 dark:divide-primary-800">
      {rows.slice(0, 50).map((r) => (
        <div key={r.account} className="flex justify-between items-center py-1.5 px-3 text-sm">
          <div className="flex gap-3 min-w-0">
            <span className="num font-mono text-xs text-primary-500 w-20 shrink-0">{r.account}</span>
            <span className="truncate">{r.label}</span>
          </div>
          <span className="num font-semibold">{fmtFull(r.mvt)}</span>
        </div>
      ))}
    </div>
  );
}

// Budget vs Réalisé mensuel + N-1
function BudgetMonthlyView() {
  const { currentOrgId, currentYear } = useApp();
  const [data, setData] = useState<any>(null);
  const [mode, setMode] = useState<'realise_budget' | 'realise_n1'>('realise_budget');

  useEffect(() => {
    import('../engine/budgetActual').then(({ computeBudgetActualMonthly, monthlySummaryBySection }) => {
      computeBudgetActualMonthly(currentOrgId, currentYear).then((raw) => {
        const sections = monthlySummaryBySection(raw, currentOrgId);
        setData({ months: raw.months, sections, rows: raw.rows });
      });
    });
  }, [currentOrgId, currentYear]);

  if (!data) return <div className="py-12 text-center text-primary-500">Chargement...</div>;
  const { months, sections } = data;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-primary-200 dark:bg-primary-800 rounded-lg w-fit">
        <button onClick={() => setMode('realise_budget')}
          className={clsx('px-3 py-1.5 text-xs rounded-md font-medium', mode === 'realise_budget' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600')}>
          Réalisé vs Budget
        </button>
        <button onClick={() => setMode('realise_n1')}
          className={clsx('px-3 py-1.5 text-xs rounded-md font-medium', mode === 'realise_n1' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600')}>
          Réalisé N vs N-1
        </button>
      </div>
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-primary-100 dark:bg-primary-900 sticky top-0">
              <tr>
                <th className="text-left py-2 px-3 font-semibold min-w-[180px]">Section</th>
                {months.map((m: string) => <th key={m} className="text-right py-2 px-1.5 font-semibold w-[65px]">{m}</th>)}
                <th className="text-right py-2 px-3 font-semibold border-l-2 border-primary-300 dark:border-primary-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec: any) => {
                const cmp = mode === 'realise_budget' ? 'budget' : 'n1';
                const totCmp = mode === 'realise_budget' ? sec.totalBudget : sec.totalN1;
                return (
                  <React.Fragment key={sec.section}>
                    <tr className="border-b border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/30">
                      <td className="py-1.5 px-3 font-semibold" rowSpan={3}>
                        <span className="text-xs">{sec.label}</span>
                        <br/><span className="text-[9px] text-primary-400">{sec.isCharge ? 'Charges' : 'Produits'}</span>
                      </td>
                      {sec.months.map((m: any, i: number) => <td key={i} className="py-1 px-1.5 text-right num whitespace-nowrap">{fmtK(m.realise)}</td>)}
                      <td className="py-1 px-3 text-right num font-semibold border-l-2 border-primary-300 dark:border-primary-700">{fmtK(sec.totalRealise)}</td>
                    </tr>
                    <tr className="border-b border-primary-100 dark:border-primary-800/50 text-primary-500">
                      {sec.months.map((m: any, i: number) => <td key={i} className="py-1 px-1.5 text-right num text-[10px]">{fmtK(m[cmp])}</td>)}
                      <td className="py-1 px-3 text-right num text-[10px] border-l-2 border-primary-300 dark:border-primary-700">{fmtK(totCmp)}</td>
                    </tr>
                    <tr className="border-b-2 border-primary-200 dark:border-primary-700">
                      {sec.months.map((m: any, i: number) => {
                        const e = m.realise - m[cmp];
                        return <td key={i} className={clsx('py-1 px-1.5 text-right num text-[10px] font-medium', e === 0 ? 'text-primary-400' : (sec.isCharge ? (e <= 0 ? '' : 'text-primary-500') : (e >= 0 ? '' : 'text-primary-500')))}>{e >= 0 ? '+' : ''}{fmtK(e)}</td>;
                      })}
                      <td className="py-1 px-3 text-right num text-[10px] font-semibold border-l-2 border-primary-300 dark:border-primary-700">
                        {(sec.totalRealise - totCmp) >= 0 ? '+' : ''}{fmtK(sec.totalRealise - totCmp)}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[10px] text-primary-400 border-t border-primary-200 dark:border-primary-800">
          Ligne 1 : Réalisé {currentYear} | Ligne 2 : {mode === 'realise_budget' ? 'Budget' : `Réalisé ${currentYear - 1}`} | Ligne 3 : Écart
        </div>
      </Card>
    </div>
  );
}
