import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Garde anti-régression : interdit de MASQUER la règle react-hooks/rules-of-hooks
// par un `eslint-disable`. Un hook appelé après un `return` conditionnel (le
// pattern que ce disable permettait) provoque React #310 (« Rendered more hooks
// than during the previous render ») et crashe la page via l'ErrorBoundary.
// Deux dashboards (Trésorerie/BFR, Income Statement B-vs-A) en ont souffert.
// Si tu dois court-circuiter un chargement, place TOUS les hooks AVANT le return.

const SRC = resolve(__dirname, '..');
const FORBIDDEN = /eslint-disable(-next-line|-line)?\s+.*react-hooks\/rules-of-hooks/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe('garde — react-hooks/rules-of-hooks jamais désactivée', () => {
  it("aucun fichier src/ ne masque la règle rules-of-hooks par un eslint-disable", () => {
    const offenders = walk(SRC)
      .filter((f) => !f.endsWith('rulesOfHooks.test.ts')) // ce fichier contient le motif dans un commentaire
      .filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(offenders, `Hooks masqués (déplace-les avant le return) :\n${offenders.join('\n')}`).toEqual([]);
  });
});
