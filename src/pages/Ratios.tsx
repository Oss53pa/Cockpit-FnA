import { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Table as TableIcon, LayoutDashboard, Download, CheckCircle2, AlertTriangle, XCircle, Calculator, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { TabSwitch } from '../components/ui/TabSwitch';
import { EmptyState } from '../components/ui/EmptyState';
import { useRatios } from '../hooks/useFinancials';
import { fmtMoney } from '../lib/format';

type View = 'cards' | 'table' | 'kanban';
const VIEW_KEY = 'ratios-view-mode';

function formatValue(v: number, unit: string) {
  if (unit === '%') return `${v.toFixed(1)} %`;
  if (unit === 'x') return `${v.toFixed(2)} ×`;
  if (unit === 'j') return `${Math.round(v)} j`;
  if (Math.abs(v) > 1_000_000) return fmtMoney(v);
  return v.toFixed(2);
}

const families = ['Rentabilité', 'Liquidité', 'Structure', 'Activité'] as const;
type Family = typeof families[number] | 'Toutes';

export default function Ratios() {
  const ratios = useRatios();
  const [view, setView] = useState<View>(() => {
    const v = localStorage.getItem(VIEW_KEY);
    return (v === 'table' || v === 'kanban' || v === 'cards') ? v : 'cards';
  });
  const setViewMode = (v: View) => { setView(v); localStorage.setItem(VIEW_KEY, v); };
  const [family, setFamily] = useState<Family>('Toutes');
  const navigate = useNavigate();

  if (!ratios.length) {
    return (
      <EmptyState
        icon={Calculator}
        title="Aucun ratio à analyser"
        description="Importez votre Grand Livre pour calculer automatiquement les ratios de rentabilité, liquidité, structure et activité."
        action={
          <button className="btn-primary" onClick={() => navigate('/imports')}>
            Importer un Grand Livre
          </button>
        }
      />
    );
  }

  const filtered = family === 'Toutes' ? ratios : ratios.filter((r) => r.family === family);
  const counts = {
    good: ratios.filter((r) => r.status === 'good').length,
    warn: ratios.filter((r) => r.status === 'warn').length,
    alert: ratios.filter((r) => r.status === 'alert').length,
  };

  const exportCSV = () => {
    const csv = [
      'Famille;Code;Ratio;Valeur;Unité;Cible;Statut;Formule',
      ...ratios.map((r) => `${r.family};${r.code};"${r.label}";${r.value.toFixed(2)};${r.unit};${r.target};${r.status};"${r.formula}"`),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ratios.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Ratios & analyse financière"
        subtitle="Rentabilité · Liquidité · Structure · Activité"
        action={
          <div className="flex gap-2">
            <button className="btn-outline" onClick={exportCSV}><Download className="w-4 h-4" /> Exporter CSV</button>
          </div>
        }
      />

      {/* Synthèse */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><div className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Total ratios</p>
          <p className="num text-2xl font-bold mt-1">{ratios.length}</p>
        </div></Card>
        <Card><div className="p-4">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Conformes</p>
          </div>
          <p className="num text-2xl font-bold mt-1 text-success">{counts.good}</p>
        </div></Card>
        <Card><div className="p-4">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Vigilance</p>
          </div>
          <p className="num text-2xl font-bold mt-1 text-warning">{counts.warn}</p>
        </div></Card>
        <Card><div className="p-4">
          <div className="flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-error" />
            <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Alertes</p>
          </div>
          <p className="num text-2xl font-bold mt-1 text-error">{counts.alert}</p>
        </div></Card>
      </div>

      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <TabSwitch value={family} onChange={setFamily} tabs={[
          { key: 'Toutes', label: 'Toutes' },
          ...families.map((f) => ({ key: f, label: f })),
        ]} />
        <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-primary-200/40 dark:bg-primary-800/40">
          {([
            { v: 'cards' as View, icon: LayoutGrid, label: 'Cartes' },
            { v: 'table' as View, icon: TableIcon, label: 'Table' },
            { v: 'kanban' as View, icon: LayoutDashboard, label: 'Kanban' },
          ]).map(({ v, icon: Icon, label }) => (
            <button key={v} onClick={() => setViewMode(v)}
              className={clsx('px-3 py-1.5 text-xs rounded-full font-medium transition flex items-center gap-1.5',
                view === v ? 'bg-primary-50 dark:bg-primary-900 shadow-sm' : 'text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-100')}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'cards' && (
        <>
          {families.filter((f) => family === 'Toutes' || f === family).map((fam) => {
            const list = filtered.filter((r) => r.family === fam);
            if (!list.length) return null;
            return (
              <div key={fam} className="mb-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-primary-500 mb-3">{fam}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {list.map((r) => {
                    return (
                      <Card key={r.code}>
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-xs text-primary-500 font-medium">{r.label}</p>
                            <Badge variant={r.status === 'good' ? 'success' : r.status === 'warn' ? 'warning' : 'error'} showIcon>
                              {r.status === 'good' ? 'Conforme' : r.status === 'warn' ? 'Vigilance' : 'Alerte'}
                            </Badge>
                          </div>
                          <p className="num text-2xl font-bold">{formatValue(r.value, r.unit)}</p>
                          <p className="text-xs text-primary-500 mt-2">
                            Cible : <span className="num font-medium">{r.unit === '%' ? `${r.target} %` : r.unit === 'j' ? `${r.target} j` : r.target}</span>
                          </p>
                          <p className="text-[10px] text-primary-400 mt-2 font-mono leading-tight">{r.formula}</p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      {view === 'table' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700">
                <tr>
                  <th className="text-left py-3 px-3 font-semibold">Famille</th>
                  <th className="text-left py-3 px-3 font-semibold">Code</th>
                  <th className="text-left py-3 px-3 font-semibold">Ratio</th>
                  <th className="text-right py-3 px-3 font-semibold">Valeur</th>
                  <th className="text-right py-3 px-3 font-semibold">Cible</th>
                  <th className="text-right py-3 px-3 font-semibold">Écart</th>
                  <th className="text-center py-3 px-3 font-semibold">Statut</th>
                  <th className="text-left py-3 px-3 font-semibold">Formule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                {filtered.map((r) => {
                  const ecart = r.value - r.target;
                  const ecartPct = r.target ? (ecart / Math.abs(r.target)) * 100 : 0;
                  return (
                    <tr key={r.code} className="hover:bg-primary-200/30 dark:hover:bg-primary-800/30">
                      <td className="py-2.5 px-3">
                        <Badge>{r.family}</Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-primary-500">{r.code}</td>
                      <td className="py-2.5 px-3 font-medium">{r.label}</td>
                      <td className="py-2.5 px-3 text-right num font-bold">{formatValue(r.value, r.unit)}</td>
                      <td className="py-2.5 px-3 text-right num text-primary-500">
                        {r.unit === '%' ? `${r.target} %` : r.unit === 'j' ? `${r.target} j` : r.target}
                      </td>
                      <td className="py-2.5 px-3 text-right num text-xs">
                        {r.unit === '%' ? `${ecart >= 0 ? '+' : ''}${ecart.toFixed(1)} pts` :
                         r.unit === 'j' ? `${ecart >= 0 ? '+' : ''}${Math.round(ecart)} j` :
                         `${ecart >= 0 ? '+' : ''}${ecartPct.toFixed(1)} %`}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={r.status === 'good' ? 'success' : r.status === 'warn' ? 'warning' : 'error'} showIcon>
                          {r.status === 'good' ? 'Conforme' : r.status === 'warn' ? 'Vigilance' : 'Alerte'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-xs font-mono text-primary-500">{r.formula}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Vue Kanban — colonnes par statut */}
      {view === 'kanban' && <KanbanView ratios={filtered} family={family} />}

      {/* Guide de lecture */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="p-4">
          <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-2">Légende statuts</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" /> <span><strong>Conforme</strong> — ratio conforme ou supérieur à la cible</span></div>
            <div className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" /> <span><strong>Vigilance</strong> — entre 80 % et 100 % de la cible</span></div>
            <div className="flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-error shrink-0" /> <span><strong>Alerte</strong> — en-dessous de 80 % de la cible</span></div>
          </div>
        </div></Card>
        <Card><div className="p-4">
          <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-2">Référentiel</p>
          <p className="text-xs text-primary-600 dark:text-primary-400 leading-relaxed">
            Ratios calculés selon SYSCOHADA révisé 2017 depuis le bilan et le compte de résultat générés par le moteur à partir du Grand Livre.
          </p>
        </div></Card>
        <Card><div className="p-4">
          <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-2">Personnalisation</p>
          <p className="text-xs text-primary-600 dark:text-primary-400 leading-relaxed">
            Les cibles par défaut correspondent aux standards sectoriels OHADA. Personnalisables par société dans Paramètres → Seuils.
          </p>
        </div></Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Vue Kanban — colonnes par statut (Conforme / Vigilance / Alerte)
// ─────────────────────────────────────────────────────────────────────
const STATUS_COLS = [
  { key: 'good' as const, label: 'Conforme', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  { key: 'warn' as const, label: 'Vigilance', icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  { key: 'alert' as const, label: 'Alerte', icon: XCircle, color: 'text-error', bg: 'bg-error/10' },
];

function KanbanView({ ratios, family }: { ratios: ReturnType<typeof useRatios>; family: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [ratios.length, family]);

  const scrollBy = (dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {canScrollLeft && (
        <button type="button" onClick={() => scrollBy(-360)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-surface shadow-lg border border-primary-200 dark:border-primary-700 flex items-center justify-center hover:bg-accent hover:text-white hover:border-accent transition-all"
          aria-label="Défiler vers la gauche">
          <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
        </button>
      )}
      {canScrollRight && (
        <button type="button" onClick={() => scrollBy(360)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-surface shadow-lg border border-primary-200 dark:border-primary-700 flex items-center justify-center hover:bg-accent hover:text-white hover:border-accent transition-all"
          aria-label="Défiler vers la droite">
          <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
        </button>
      )}
      {canScrollLeft && (
        <div aria-hidden className="pointer-events-none absolute left-0 top-0 bottom-4 w-12 bg-gradient-to-r from-bg-page to-transparent z-[5]" />
      )}
      {canScrollRight && (
        <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-bg-page to-transparent z-[5]" />
      )}

      <div ref={scrollerRef} className="kanban-scroller flex gap-4 overflow-x-auto pb-4 -mx-3 px-3 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'auto' }}>
        {STATUS_COLS.map(({ key, label, icon: Icon, color, bg }) => {
          const items = ratios.filter((r) => r.status === key);
          return (
            <div key={key} className="shrink-0 w-[320px] flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-1.5">
                  <Icon className={clsx('w-4 h-4', color)} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-200">{label}</h3>
                </div>
                <span className={clsx('text-[10px] tabular-nums px-2 py-0.5 rounded-full shrink-0', bg, color.replace('text-', 'text-'))}>
                  {items.length}
                </span>
              </div>

              <div className={clsx('flex flex-col gap-2 p-2 rounded-2xl min-h-[200px] flex-1 border', bg, 'border-primary-200/40 dark:border-primary-800/40')}>
                {items.map((r) => {
                  const ecart = r.value - r.target;
                  return (
                    <div key={r.code} className="card p-3 hover:shadow-md hover:-translate-y-px transition-all duration-200">
                      <div className="flex items-start justify-between mb-1.5">
                        <p className="font-semibold text-[12px] text-primary-900 dark:text-primary-100 leading-snug tracking-tight flex-1">{r.label}</p>
                        <Badge variant={r.status === 'good' ? 'success' : r.status === 'warn' ? 'warning' : 'error'} showIcon>
                          {r.family}
                        </Badge>
                      </div>
                      <div className="flex items-baseline gap-2 mb-1.5">
                        <p className="num text-xl font-bold">{formatValue(r.value, r.unit)}</p>
                        <p className="text-[10px] text-primary-500">
                          cible {r.unit === '%' ? `${r.target} %` : r.unit === 'j' ? `${r.target} j` : r.target}
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-mono text-primary-400 leading-tight truncate max-w-[200px]" title={r.formula}>{r.formula}</p>
                        <p className={clsx('text-[10px] num font-semibold',
                          ecart >= 0 ? 'text-success' : 'text-error')}>
                          {r.unit === '%' ? `${ecart >= 0 ? '+' : ''}${ecart.toFixed(1)} pts` :
                           r.unit === 'j' ? `${ecart >= 0 ? '+' : ''}${Math.round(ecart)} j` :
                           `${ecart >= 0 ? '+' : ''}${(r.target ? (ecart / Math.abs(r.target)) * 100 : 0).toFixed(1)} %`}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <p className="text-[10px] text-primary-400 italic text-center py-8">Aucun ratio</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
