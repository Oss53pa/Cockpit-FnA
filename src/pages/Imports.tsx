import { useState } from 'react';
import { CheckCircle2, Download, FileWarning, UploadCloud, XCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../store/app';
import { useCurrentOrg, useImportsHistory, usePeriods } from '../hooks/useFinancials';
import { detectColumns, importGL, parseFile, ColumnMapping, ImportReport } from '../engine/importer';
import { downloadGLTemplate } from '../engine/templates';
import { fmtFull } from '../lib/format';

const sources = ['SAGE', 'PERFECTO', 'SAARI', 'CEGID', 'ODOO', 'SAP', 'CSV générique', 'Excel'];
const controls = [
  'Équilibre Débit = Crédit',
  'Détection de doublons',
  'Comptes inexistants au plan SYSCOHADA',
  'Continuité des périodes',
  'Validation du format',
  'Comptes à solde anormal',
  'Lettrage automatique des tiers',
];

// Composant réutilisable — uniquement l'IMPORT du Grand Livre.
// Les balances (générale, auxiliaire, âgée) sont DÉRIVÉES automatiquement du GL,
// elles ne s'importent jamais séparément.
export default function Imports() {
  const { currentOrgId, currentYear } = useApp();
  const org = useCurrentOrg();
  const history = useImportsHistory(currentOrgId);
  const periods = usePeriods(currentOrgId).filter((p) => p.year === currentYear && p.month >= 1);

  const [step, setStep] = useState<'idle' | 'mapping' | 'result'>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [periodId, setPeriodId] = useState<string>('');
  const [source, setSource] = useState<string>('CSV générique');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [loading, setLoading] = useState(false);

  const onFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    try {
      const { headers } = await parseFile(f);
      setHeaders(headers);
      setMapping(detectColumns(headers));
      setStep('mapping');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!file || !periodId) return;
    const required: (keyof ColumnMapping)[] = ['date', 'account', 'debit', 'credit'];
    for (const k of required) {
      if (!mapping[k]) { alert(`Colonne manquante : ${k}`); return; }
    }
    setLoading(true);
    try {
      const res = await importGL(file, mapping as ColumnMapping, {
        orgId: currentOrgId, periodId, user: 'Utilisateur local', source,
      });
      setReport(res);
      setStep('result');
    } catch (e: any) {
      alert(`Erreur import : ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setStep('idle'); setFile(null); setHeaders([]); setMapping({}); setReport(null); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-primary-500 italic">
          💡 Importez le <strong>Grand Livre</strong> ; toutes les balances (générale, auxiliaire, âgée) sont calculées automatiquement.
        </p>
        <button className="btn-outline" onClick={() => downloadGLTemplate(org?.name, currentYear)}>
          <Download className="w-4 h-4" /> Télécharger le modèle Excel
        </button>
      </div>

      {step === 'idle' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="Déposer un fichier" subtitle="CSV, TXT, XLSX — détection automatique des colonnes" className="lg:col-span-2">
            <label className="border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl p-10 text-center block hover:border-primary-400 dark:hover:border-primary-600 transition cursor-pointer">
              <UploadCloud className="w-10 h-10 mx-auto text-primary-400 mb-3" />
              <p className="text-sm font-medium">Déposez ou cliquez pour choisir un fichier</p>
              <p className="text-xs text-primary-500 mt-1">Formats acceptés : CSV · TXT · XLSX · XLS</p>
              <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              {sources.map((s) => (
                <button key={s} onClick={() => setSource(s)}
                  className={`btn !py-1.5 text-xs ${source === s ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline'}`}>
                  {s}
                </button>
              ))}
            </div>
          </Card>
          <Card title="Contrôles automatiques" subtitle="Appliqués à chaque import">
            <ul className="space-y-2 text-sm">
              {controls.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary-500" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {step === 'mapping' && (
        <Card title="Mapping des colonnes" subtitle={`Fichier : ${file?.name} — ${headers.length} colonnes détectées`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Select label="Période cible *" value={periodId} onChange={setPeriodId}
              options={[{ v: '', l: '— Choisir —' }, ...periods.map((p) => ({ v: p.id, l: p.label }))]} />
            <Select label="Source" value={source} onChange={setSource}
              options={sources.map((s) => ({ v: s, l: s }))} />
          </div>
          <h4 className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">Correspondance des colonnes</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['date','journal','piece','account','label','debit','credit','tiers','analyticalSection'] as const).map((field) => (
              <Select key={field}
                label={fieldLabels[field]}
                value={mapping[field] ?? ''}
                onChange={(v) => setMapping({ ...mapping, [field]: v || undefined })}
                options={[{ v: '', l: '— Non mappée —' }, ...headers.map((h) => ({ v: h, l: h }))]}
                required={['date','account','debit','credit'].includes(field)} />
            ))}
          </div>
          <div className="flex gap-2 mt-6 pt-4 border-t border-primary-200 dark:border-primary-800">
            <button className="btn-outline" onClick={reset}>Annuler</button>
            <button className="btn-primary" onClick={runImport} disabled={loading || !periodId}>
              {loading ? 'Import en cours…' : 'Lancer l\'import'}
            </button>
          </div>
        </Card>
      )}

      {step === 'result' && report && (
        <Card title="Résultat de l'import">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Lignes lues" value={report.totalRows} />
            <Stat label="Importées" value={report.imported} good />
            <Stat label="Rejetées" value={report.rejected} bad={report.rejected > 0} />
            <Stat label="Comptes inconnus" value={report.unknownAccounts.length} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
            <div className="card p-4">
              <p className="text-xs text-primary-500">Total Débit</p>
              <p className="num text-lg font-semibold">{fmtFull(report.totalDebit)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-primary-500">Total Crédit</p>
              <p className="num text-lg font-semibold">{fmtFull(report.totalCredit)}</p>
            </div>
            <div className={`card p-4 ${report.balanced ? 'border-success' : 'border-error'}`}>
              <p className="text-xs text-primary-500">Équilibre</p>
              <p className={`num text-lg font-semibold ${report.balanced ? 'text-success' : 'text-error'}`}>
                {report.balanced ? '✓ Équilibré' : `Écart : ${fmtFull(report.totalDebit - report.totalCredit)}`}
              </p>
            </div>
          </div>
          {report.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs uppercase tracking-wider font-semibold mb-2 text-error">{report.errors.length} erreur(s)</h4>
              <div className="max-h-40 overflow-y-auto text-xs font-mono">
                {report.errors.slice(0, 20).map((e, i) => <div key={i}>Ligne {e.row} : {e.reason}</div>)}
              </div>
            </div>
          )}
          <button className="btn-primary" onClick={reset}>Nouvel import</button>
        </Card>
      )}

      <Card title="Historique des imports" subtitle="Traçabilité complète">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-200 dark:border-primary-800">
              <tr>
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-left py-2 px-3">Utilisateur</th>
                <th className="text-left py-2 px-3">Fichier</th>
                <th className="text-left py-2 px-3">Source</th>
                <th className="text-right py-2 px-3">Écritures</th>
                <th className="text-right py-2 px-3">Rejetées</th>
                <th className="text-left py-2 px-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              {history.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-primary-500 text-xs">Aucun import</td></tr>
              )}
              {history.map((i) => (
                <tr key={i.id} className="hover:bg-primary-100/50 dark:hover:bg-primary-900/50">
                  <td className="py-2 px-3 num text-xs">{new Date(i.date).toLocaleString('fr-FR')}</td>
                  <td className="py-2 px-3">{i.user}</td>
                  <td className="py-2 px-3 font-mono text-xs">{i.fileName}</td>
                  <td className="py-2 px-3"><Badge>{i.source}</Badge></td>
                  <td className="py-2 px-3 text-right num">{i.count.toLocaleString('fr-FR')}</td>
                  <td className="py-2 px-3 text-right num">{i.rejected}</td>
                  <td className="py-2 px-3">
                    {i.status === 'success' && <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Succès</Badge>}
                    {i.status === 'partial' && <Badge variant="warning"><FileWarning className="w-3 h-3" /> Partiel</Badge>}
                    {i.status === 'error' && <Badge variant="error"><XCircle className="w-3 h-3" /> Échec</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const fieldLabels: Record<string, string> = {
  date: 'Date', journal: 'Journal', piece: 'N° pièce',
  account: 'Compte', label: 'Libellé', debit: 'Débit', credit: 'Crédit',
  tiers: 'Tiers', analyticalSection: 'Section analytique',
};

function Select({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[]; required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">
        {label} {required && <span className="text-error">*</span>}
      </label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-primary-500">{label}</p>
      <p className={`num text-2xl font-bold ${good ? 'text-success' : bad ? 'text-error' : ''}`}>
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  );
}
