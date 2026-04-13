// Hook React Proph3 — Analyse financière réactive
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../store/app';
import { analyzeFinancials, askProph3, checkOllamaStatus } from '../engine/proph3/index';
import type { Proph3Analysis, OllamaStatus } from '../engine/proph3/index';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';

export function useProph3() {
  const { currentOrgId, currentYear } = useApp();
  const [analysis, setAnalysis] = useState<Proph3Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ available: false, model: null, models: [] });

  useEffect(() => { checkOllamaStatus().then(setOllamaStatus); const i = setInterval(() => checkOllamaStatus().then(setOllamaStatus), 30_000); return () => clearInterval(i); }, []);

  const glCount = useLiveQuery(() => db.gl.where('orgId').equals(currentOrgId).count(), [currentOrgId], 0);

  const analyze = useCallback(async () => {
    if (!currentOrgId) return; setLoading(true);
    try { setAnalysis(await analyzeFinancials(currentOrgId, currentYear)); } catch (e) { console.error('[Proph3]', e); } finally { setLoading(false); }
  }, [currentOrgId, currentYear]);

  useEffect(() => { if (glCount > 0) analyze(); }, [glCount, analyze]);

  const ask = useCallback(async (q: string) => {
    const org = await db.organizations.get(currentOrgId);
    return askProph3(q, analysis, org?.name, undefined, org?.currency);
  }, [currentOrgId, analysis]);

  return { analysis, loading, ollamaStatus, analyze, ask };
}
