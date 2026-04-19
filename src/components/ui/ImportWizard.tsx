// Wizard d'import réutilisable — pattern identique à la page Imports (Grand Livre)
// Utilisé par Budget et Plan comptable (COA) pour avoir la même UX.
//
// Étapes : idle (dépôt du fichier) → mapping (détection colonnes + champs extra) → result
import { ReactNode, useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { CheckCircle2, Download, UploadCloud } from 'lucide-react';
import { Card } from './Card';

export type WizardField = {
  key: string;
  label: string;
  required?: boolean;
  // Regex testées contre les en-têtes pour auto-détection
  patterns?: RegExp[];
};

export type WizardResult = {
  imported: number;
  updated?: number;
  rejected: number;
  errors: { row: number; reason: string }[];
  extras?: Record<string, string | number>;
};

export type WizardExtraField =
  | { key: string; type: 'text'; label: string; placeholder?: string; defaultValue?: string; required?: boolean }
  | { key: string; type: 'number'; label: string; placeholder?: string; defaultValue?: number; required?: boolean }
  | { key: string; type: 'select'; label: string; options: { v: string; l: string }[]; defaultValue?: string; required?: boolean };

type Props = {
  /** Titre affiché dans le Card */
  title: string;
  /** Sous-titre (ex : "CSV · XLSX · détection automatique") */
  subtitle: string;
  /** Champs à mapper entre colonnes du fichier et champs métier */
  fields: WizardField[];
  /** Champs supplémentaires à saisir (année, version, etc.) */
  extraFields?: WizardExtraField[];
  /** Appelé quand l'utilisateur clique sur "Lancer l'import" */
  onImport: (
    file: File,
    mapping: Record<string, string>,
    extras: Record<string, string | number>,
  ) => Promise<WizardResult>;
  /** Bouton "Télécharger le modèle" (optionnel) */
  onDownloadTemplate?: () => void;
  /** Contrôles automatiques appliqués (informatif) */
  controls?: string[];
  /** Rendu personnalisé du résultat (sinon rendu par défaut avec stats) */
  renderResult?: (result: WizardResult) => ReactNode;
};

type Step = 'idle' | 'mapping' | 'result';

export function ImportWizard(props: Props) {
  const { title, subtitle, fields, extraFields = [], onImport, onDownloadTemplate, controls = [], renderResult } = props;

  const [step, setStep] = useState<Step>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, string | number>>(() => {
    const init: Record<string, string | number> = {};
    for (const f of extraFields) if (f.defaultValue !== undefined) init[f.key] = f.defaultValue;
    return init;
  });
  const [result, setResult] = useState<WizardResult | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep('idle'); setFile(null); setHeaders([]); setMapping({}); setResult(null);
    const init: Record<string, string | number> = {};
    for (const f of extraFields) if (f.defaultValue !== undefined) init[f.key] = f.defaultValue;
    setExtras(init);
  };

  const parseHeaders = async (f: File): Promise<string[]> => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      return new Promise<string[]>((resolve, reject) => {
        Papa.parse<Record<string, string>>(f, {
          header: true, skipEmptyLines: true, preview: 1,
          delimitersToGuess: [';', ',', '\t', '|'],
          complete: (res) => resolve(res.meta.fields ?? []),
          error: reject,
        });
      });
    }
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
    return rows.length > 0 ? Object.keys(rows[0]) : [];
  };

  const autoDetect = (hs: string[]): Record<string, string> => {
    const m: Record<string, string> = {};
    for (const f of fields) {
      if (!f.patterns) continue;
      const found = hs.find((h) => f.patterns!.some((p) => p.test(h)));
      if (found) m[f.key] = found;
    }
    return m;
  };

  const onFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    try {
      const hs = await parseHeaders(f);
      setHeaders(hs);
      setMapping(autoDetect(hs));
      setStep('mapping');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    for (const f of fields) {
      if (f.required && !mapping[f.key]) { alert(`Colonne manquante : ${f.label}`); return; }
    }
    for (const f of extraFields) {
      if (f.required && (extras[f.key] === undefined || extras[f.key] === '')) {
        alert(`Champ manquant : ${f.label}`); return;
      }
    }
    setLoading(true);
    try {
      const res = await onImport(file, mapping, extras);
      setResult(res);
      setStep('result');
    } catch (e) {
      alert(`Erreur import : ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'idle') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title={title} subtitle={subtitle} className="lg:col-span-2"
          action={onDownloadTemplate ? (
            <button className="btn-outline" onClick={onDownloadTemplate}>
              <Download className="w-4 h-4" /> Modèle Excel
            </button>
          ) : undefined}>
          <label className="border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl p-10 text-center block hover:border-primary-400 dark:hover:border-primary-600 transition cursor-pointer">
            <UploadCloud className="w-10 h-10 mx-auto text-primary-400 mb-3" />
            <p className="text-sm font-medium">Déposez ou cliquez pour choisir un fichier</p>
            <p className="text-xs text-primary-500 mt-1">Formats acceptés : CSV · TXT · XLSX · XLS</p>
            <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {loading && <p className="mt-3 text-xs text-primary-500 italic text-center">Lecture du fichier…</p>}
        </Card>
        {controls.length > 0 && (
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
        )}
      </div>
    );
  }

  if (step === 'mapping') {
    return (
      <Card title="Mapping des colonnes" subtitle={`Fichier : ${file?.name} — ${headers.length} colonnes détectées`}>
        {extraFields.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {extraFields.map((ef) => (
              <div key={ef.key}>
                <label className="text-xs text-primary-500 font-medium block mb-1">
                  {ef.label} {ef.required && <span className="text-error">*</span>}
                </label>
                {ef.type === 'select' ? (
                  <select className="input" value={String(extras[ef.key] ?? '')}
                    onChange={(e) => setExtras({ ...extras, [ef.key]: e.target.value })}>
                    {ef.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                ) : (
                  <input
                    type={ef.type}
                    className="input"
                    value={String(extras[ef.key] ?? '')}
                    placeholder={ef.placeholder}
                    onChange={(e) => {
                      const v = ef.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
                      setExtras({ ...extras, [ef.key]: v });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <h4 className="text-xs uppercase tracking-wider text-primary-500 font-semibold mb-3">Correspondance des colonnes</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-primary-500 font-medium block mb-1">
                {f.label} {f.required && <span className="text-error">*</span>}
              </label>
              <select className="input" value={mapping[f.key] ?? ''}
                onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                <option value="">— Non mappée —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-6 pt-4 border-t border-primary-200 dark:border-primary-800">
          <button className="btn-outline" onClick={reset}>Annuler</button>
          <button className="btn-primary" onClick={runImport} disabled={loading}>
            {loading ? 'Import en cours…' : 'Lancer l\'import'}
          </button>
        </div>
      </Card>
    );
  }

  // step === 'result'
  return (
    <Card title="Résultat de l'import">
      {renderResult ? renderResult(result!) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Stat label="Importées" value={result?.imported ?? 0} good />
            {result?.updated !== undefined && <Stat label="Mises à jour" value={result.updated} />}
            <Stat label="Rejetées" value={result?.rejected ?? 0} bad={!!(result && result.rejected > 0)} />
            <Stat label="Erreurs" value={result?.errors.length ?? 0} bad={!!(result && result.errors.length > 0)} />
          </div>
          {result && result.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs uppercase tracking-wider font-semibold mb-2 text-error">{result.errors.length} erreur(s)</h4>
              <div className="max-h-40 overflow-y-auto text-xs font-mono">
                {result.errors.slice(0, 30).map((e, i) => <div key={i}>Ligne {e.row} : {e.reason}</div>)}
              </div>
            </div>
          )}
        </>
      )}
      <button className="btn-primary" onClick={reset}>Nouvel import</button>
    </Card>
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
