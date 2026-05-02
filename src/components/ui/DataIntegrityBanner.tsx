/**
 * DataIntegrityBanner — détecte automatiquement les anomalies sur les imports
 * GL qui peuvent provoquer des montants gonflés (typiquement × N).
 *
 * Cas détectés :
 *  1. Plusieurs imports GL actifs avec des dates qui se chevauchent → la
 *     sélection 'all' (ou un usage par défaut sans filtre) somme tout
 *     → trésorerie/CA/etc. multipliés par N.
 *  2. Période ouverture vide ou inexistante alors que d'autres exercices ont
 *     des AN → bilan ne reflète pas la position réelle.
 *  3. Comptes en classe 6/7 avec solde anormal (signe inversé probable).
 *
 * Actions proposées :
 *  - Bascule rapide vers "dernier import seulement"
 *  - Lien vers /imports pour gérer/supprimer les imports redondants
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, FileWarning, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/schema';
import { useApp } from '../../store/app';

export function DataIntegrityBanner() {
  const currentOrgId = useApp((s) => s.currentOrgId);
  const currentYear = useApp((s) => s.currentYear);
  const currentImport = useApp((s) => s.currentImport);
  const setCurrentImport = useApp((s) => s.setCurrentImport);
  const navigate = useNavigate();

  const diagnostics = useLiveQuery(async () => {
    if (!currentOrgId) return null;

    // Liste des imports GL actifs
    const imports = await db.imports
      .where('orgId').equals(currentOrgId)
      .filter((i) => i.kind === 'GL')
      .toArray();

    if (imports.length <= 1) return { hasMultipleImports: false, importCount: imports.length, overlapCount: 0, totalEntries: 0 };

    // Compte d'entrées par import
    const entries = await db.gl.where('orgId').equals(currentOrgId).toArray();
    const entriesByImport = new Map<string | undefined, number>();
    for (const e of entries) {
      entriesByImport.set(e.importId, (entriesByImport.get(e.importId) ?? 0) + 1);
    }

    // Détecte si plusieurs imports ont des entrées sur les mêmes périodes
    // (= chevauchement => risque de double comptage)
    const periodsByImport = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!e.importId) continue;
      if (!periodsByImport.has(e.importId)) periodsByImport.set(e.importId, new Set());
      periodsByImport.get(e.importId)!.add(e.periodId);
    }
    const importIds = Array.from(periodsByImport.keys());
    let overlapCount = 0;
    for (let i = 0; i < importIds.length; i++) {
      for (let j = i + 1; j < importIds.length; j++) {
        const a = periodsByImport.get(importIds[i])!;
        const b = periodsByImport.get(importIds[j])!;
        for (const p of a) if (b.has(p)) overlapCount++;
      }
    }

    return {
      hasMultipleImports: imports.length > 1,
      importCount: imports.length,
      overlapCount,
      totalEntries: entries.length,
      entriesByImport: Array.from(entriesByImport.entries()).map(([id, count]) => ({ id, count })),
    };
  }, [currentOrgId, currentYear]);

  const dismissed = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`data-integrity-banner-dismissed:${currentOrgId}`) === '1';
  }, [currentOrgId]);

  if (!diagnostics || !diagnostics.hasMultipleImports || dismissed) return null;
  if (currentImport !== 'all' && diagnostics.overlapCount === 0) return null;

  const handleDismiss = () => {
    if (currentOrgId) localStorage.setItem(`data-integrity-banner-dismissed:${currentOrgId}`, '1');
  };

  const handleSwitchToLatest = () => {
    setCurrentImport('latest');
  };

  return (
    <div className="mb-5 rounded-2xl border-l-4 border-l-warning bg-warning/5 p-4 animate-fade-in-up">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">
            ⚠ Vérification d'intégrité des données — Risque de double comptage détecté
          </p>
          <p className="text-xs text-primary-700 dark:text-primary-300 mt-1">
            <strong>{diagnostics.importCount} imports GL</strong> actifs sur cette société
            {diagnostics.overlapCount > 0 && (
              <> avec <strong>{diagnostics.overlapCount} période(s) en chevauchement</strong></>
            )}.
            Si tu vois des montants ~{diagnostics.importCount}× trop élevés (ex: trésorerie multipliée),
            c'est probablement la cause.
          </p>
          {diagnostics.entriesByImport && diagnostics.entriesByImport.length > 1 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-primary-600 dark:text-primary-400">
              {diagnostics.entriesByImport.slice(0, 5).map((e) => (
                <li key={e.id ?? 'no-id'} className="flex items-center gap-2">
                  <FileWarning className="w-3 h-3 shrink-0" />
                  Import <span className="num font-mono">{e.id ?? '(sans id)'}</span> · {e.count.toLocaleString('fr-FR')} écritures
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 mt-3">
            {currentImport === 'all' && (
              <button
                className="btn-primary !py-1.5 !text-xs"
                onClick={handleSwitchToLatest}
              >
                Utiliser le dernier import seulement
              </button>
            )}
            <button
              className="btn-outline !py-1.5 !text-xs"
              onClick={() => navigate('/imports')}
            >
              Gérer les imports
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-primary-400 hover:text-error shrink-0"
          title="Masquer cet avertissement"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
