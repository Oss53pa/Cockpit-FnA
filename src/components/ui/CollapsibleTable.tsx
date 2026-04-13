// Table financière avec sections pliables (Bilan, CR, TFT, TAFIRE…)
import { useState } from 'react';
import clsx from 'clsx';
import { Line } from '../../engine/statements';
import { fmtFull } from '../../lib/format';
import { usePalette } from '../../store/theme';

type Props = {
  title?: string;
  lines: Line[];
  detailsByCode?: Record<string, Line[]>;
  hideCodes?: boolean;
};

// Regroupement automatique : les lignes qui ne sont pas "total"/"grand" deviennent le détail des prochaines lignes total
type Group = { total: Line; details: Line[] };

function autoGroup(lines: Line[]): Group[] {
  const groups: Group[] = [];
  let buffer: Line[] = [];
  for (const l of lines) {
    if (l.total || l.grand) {
      groups.push({ total: l, details: buffer });
      buffer = [];
    } else {
      buffer.push(l);
    }
  }
  // Orphelins à la fin (pas de total)
  if (buffer.length > 0) {
    // On crée une "fausse" section non totale = regroupe les orphelins sans parent
    groups.push({ total: { code: '_orphan', label: '—', value: 0 } as Line, details: buffer });
  }
  return groups;
}

export function CollapsibleTable({ title, lines, detailsByCode, hideCodes }: Props) {
  const useAutoGroup = !detailsByCode;
  const groups = useAutoGroup ? autoGroup(lines) : [];

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Tout déplié par défaut
    const init: Record<string, boolean> = {};
    (useAutoGroup ? groups.map((g) => g.total.code) : Object.keys(detailsByCode ?? {})).forEach((k) => { init[k] = true; });
    return init;
  });

  const expandAll = () => setExpanded(Object.fromEntries((useAutoGroup ? groups.map((g) => g.total.code) : Object.keys(detailsByCode ?? {})).map((k) => [k, true])));
  const collapseAll = () => setExpanded({});

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {title && <h4 className="text-xs uppercase tracking-wider font-semibold text-primary-500">{title}</h4>}
        <div className="flex gap-1 ml-auto">
          <button onClick={expandAll} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2 py-0.5">Tout déplier</button>
          <span className="text-primary-300">·</span>
          <button onClick={collapseAll} className="text-[10px] text-primary-500 hover:text-primary-900 dark:hover:text-primary-100 px-2 py-0.5">Tout replier</button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-300 dark:border-primary-700">
          <tr>
            <th className="text-left py-2 w-8"></th>
            {!hideCodes && <th className="text-left py-2 px-3 w-32">Comptes</th>}
            <th className="text-left py-2 px-3">Poste</th>
            <th className="text-right py-2 px-3 w-40">Montant</th>
          </tr>
        </thead>
        <tbody>
          {useAutoGroup ? (
            groups.map((g, gi) => {
              const open = expanded[g.total.code];
              const hasDetails = g.details.length > 0;
              return (
                <GroupRows key={gi} group={g} open={open} hasDetails={hasDetails} hideCodes={hideCodes}
                  onToggle={() => setExpanded((e) => ({ ...e, [g.total.code]: !e[g.total.code] }))} />
              );
            })
          ) : (
            lines.map((l, i) => {
              const details = detailsByCode?.[l.code];
              const open = expanded[l.code];
              return (
                <ManualRows key={i} line={l} details={details} open={open} hideCodes={hideCodes}
                  onToggle={() => setExpanded((e) => ({ ...e, [l.code]: !e[l.code] }))} />
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, open, hasDetails, onToggle, hideCodes }: { group: Group; open: boolean; hasDetails: boolean; onToggle: () => void; hideCodes?: boolean }) {
  const { total, details } = group;
  if (total.code === '_orphan') {
    return <>{details.map((d, i) => <DetailRow key={i} line={d} hideCodes={hideCodes} />)}</>;
  }
  return (
    <>
      {open && details.map((d, i) => <DetailRow key={i} line={d} hideCodes={hideCodes} />)}
      <TotalRow line={total} hasDetails={hasDetails} open={open} onToggle={onToggle} hideCodes={hideCodes} />
    </>
  );
}

function ManualRows({ line, details, open, onToggle, hideCodes }: { line: Line; details?: Line[]; open: boolean; onToggle: () => void; hideCodes?: boolean }) {
  if (details && details.length > 0) {
    return (
      <>
        <TotalRow line={line} hasDetails open={open} onToggle={onToggle} hideCodes={hideCodes} />
        {open && details.map((d, i) => <DetailRow key={i} line={d} indent hideCodes={hideCodes} />)}
      </>
    );
  }
  return line.total || line.grand ? <TotalRow line={line} hideCodes={hideCodes} /> : <DetailRow line={line} hideCodes={hideCodes} />;
}

function TotalRow({ line, hasDetails, open, onToggle, hideCodes }: { line: Line; hasDetails?: boolean; open?: boolean; onToggle?: () => void; hideCodes?: boolean }) {
  const palette = usePalette();
  const grandStyle = line.grand ? { background: palette.tableHeader, color: palette.tableHeaderText } : undefined;
  return (
    <tr className={clsx(
      'border-b border-primary-200 dark:border-primary-800',
      line.total && !line.grand && 'bg-primary-200/50 dark:bg-primary-800/30 font-semibold',
      line.grand && 'font-bold',
    )} style={grandStyle}>
      <td className="py-2 pl-2 w-8 text-center">
        {hasDetails && onToggle && (
          <button onClick={onToggle} className="w-5 h-5 rounded hover:bg-primary-100 dark:hover:bg-primary-800 text-xs font-bold"
            title={open ? 'Replier' : 'Déplier'}>
            {open ? '−' : '+'}
          </button>
        )}
      </td>
      {!hideCodes && <td className="py-2 px-3 text-xs num font-mono text-primary-500 w-32">{line.accountCodes ?? ''}</td>}
      <td className="py-2 px-3" style={{ paddingLeft: `${12 + (line.indent ?? 0) * 12}px` }}>{line.label}</td>
      <td className="py-2 px-3 text-right num tabular-nums w-40">{fmtFull(line.value)}</td>
    </tr>
  );
}

function DetailRow({ line, indent, hideCodes }: { line: Line; indent?: boolean; hideCodes?: boolean }) {
  return (
    <tr className="border-b border-primary-100 dark:border-primary-800/50 bg-primary-50/50 dark:bg-primary-950/30">
      <td className="py-1.5"></td>
      {!hideCodes && <td className="py-1.5 px-3 text-xs num font-mono text-primary-500 w-32">{line.accountCodes ?? ''}</td>}
      <td className="py-1.5 px-3 text-xs" style={{ paddingLeft: `${indent ? 24 : 12 + (line.indent ?? 0) * 12}px` }}>{line.label}</td>
      <td className="py-1.5 px-3 text-right num tabular-nums w-40 text-xs">{fmtFull(line.value)}</td>
    </tr>
  );
}
