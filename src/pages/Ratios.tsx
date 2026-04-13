import { useState } from 'react';
import { LayoutGrid, Table as TableIcon, Download } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { TabSwitch } from '../components/ui/TabSwitch';
import { useRatios } from '../hooks/useFinancials';
import { fmtMoney } from '../lib/format';

type View = 'cards' | 'table';

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
  const [view, setView] = useState<View>('cards');
  const [family, setFamily] = useState<Family>('Toutes');

  if (!ratios.length) {
    return <div className="py-20 text-center text-primary-500">Chargement…</div>;
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
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Conformes</p>
          <p className="num text-2xl font-bold mt-1 text-success">{counts.good}</p>
        </div></Card>
        <Card><div className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Vigilance</p>
          <p className="num text-2xl font-bold mt-1 text-warning">{counts.warn}</p>
        </div></Card>
        <Card><div className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Alertes</p>
          <p className="num text-2xl font-bold mt-1 text-error">{counts.alert}</p>
        </div></Card>
      </div>

      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <TabSwitch value={family} onChange={setFamily} tabs={[
          { key: 'Toutes', label: 'Toutes' },
          ...families.map((f) => ({ key: f, label: f })),
        ]} />
        <div className="flex gap-1 p-1 bg-primary-200 dark:bg-primary-800 rounded-lg">
          <button onClick={() => setView('cards')}
            className={clsx('px-3 py-1.5 text-xs rounded-md font-medium transition flex items-center gap-1.5',
              view === 'cards' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600 dark:text-primary-400')}>
            <LayoutGrid className="w-3.5 h-3.5" /> Cartes
          </button>
          <button onClick={() => setView('table')}
            className={clsx('px-3 py-1.5 text-xs rounded-md font-medium transition flex items-center gap-1.5',
              view === 'table' ? 'bg-primary-50 dark:bg-primary-900' : 'text-primary-600 dark:text-primary-400')}>
            <TableIcon className="w-3.5 h-3.5" /> Table
          </button>
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
                    const dot = r.status === 'good' ? 'OK' : r.status === 'warn' ? '--' : '!!';
                    return (
                      <Card key={r.code}>
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-xs text-primary-500 font-medium">{r.label}</p>
                            <Badge variant={r.status === 'good' ? 'success' : r.status === 'warn' ? 'warning' : 'error'}>
                              {dot}
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
                        <Badge variant={r.status === 'good' ? 'success' : r.status === 'warn' ? 'warning' : 'error'}>
                          {r.status === 'good' ? 'OK' : r.status === 'warn' ? 'Vigilance' : 'Alerte'}
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

      {/* Guide de lecture */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="p-4">
          <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-2">Légende statuts</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-success" /> <span><strong>OK</strong> — ratio conforme ou supérieur à la cible</span></div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-warning" /> <span><strong>Vigilance</strong> — entre 80 % et 100 % de la cible</span></div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-error" /> <span><strong>Alerte</strong> — en-dessous de 80 % de la cible</span></div>
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
