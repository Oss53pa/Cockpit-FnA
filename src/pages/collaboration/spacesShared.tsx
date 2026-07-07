// Espace Collaboratif — helpers UI et opérations partagées (Portefeuille + Espace)
import { dataProvider } from '../../db/provider';
import { invalidateCloudData } from '../../hooks/useCloudData';
import { safeLocalStorage } from '../../lib/safeStorage';
import { GUEST_USER } from '../../lib/appConfig';
import type { Space, SpaceEvent, SpaceEventType } from '../../db/schema';
import { STATUS_META } from '../../engine/spaces';

// ── Utilisateur courant (même convention que Chat.tsx) ─────────────────────
export type AppUser = { id: string; name: string; email: string; role: string };
export function loadUsers(): AppUser[] {
  try { return JSON.parse(safeLocalStorage.getItem('cockpit-users') ?? '[]'); } catch { return []; }
}
export function getCurrentUser(): AppUser {
  try {
    const raw = sessionStorage.getItem('cockpit-current-user');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const users = loadUsers();
  return users[0] ?? { ...GUEST_USER, role: 'admin' };
}

export function spaceUid(): string {
  try { return `sp-${crypto.randomUUID()}`; } catch { return `sp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
}

export const SPACES_TAG = 'spaces';

/** Écrit un événement dans le fil append-only + invalide le cache. */
export async function logSpaceEvent(
  space: Pick<Space, 'id' | 'orgId'>,
  eventType: SpaceEventType,
  actor: string,
  payload?: Record<string, unknown>,
  opts?: { actorKind?: SpaceEvent['actorKind']; originSurface?: SpaceEvent['originSurface'] },
): Promise<void> {
  await dataProvider.addSpaceEvent({
    orgId: space.orgId,
    spaceId: space.id,
    eventType,
    actor,
    actorKind: opts?.actorKind ?? 'user',
    originSurface: opts?.originSurface ?? 'space',
    payload: payload ?? {},
    createdAt: Date.now(),
  });
  invalidateCloudData(SPACES_TAG);
}

// ── Formatage ───────────────────────────────────────────────────────────────
export const fmtXof = (v: number) => `${Math.trunc(v).toLocaleString('fr-FR')} XOF`;
export const fmtPct = (bp: number) => `${Math.trunc(bp / 100)} %`;
export const fmtDay = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');
export const fmtTs = (t: number) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ── Composants ──────────────────────────────────────────────────────────────
/** Barre de convergence — or foncé + police mono, badge « calculé · jamais saisie ». */
export function ConvergenceBar({ bp, showBadge, formula }: { bp: number; showBadge?: boolean; formula?: string }) {
  const pct = Math.max(0, Math.min(100, Math.trunc(bp / 100)));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="num text-[12px] font-bold" style={{ color: '#C97E12' }}>{pct} %</span>
        {showBadge && (
          <span className="text-[9px] uppercase tracking-wider text-primary-400" title={formula}>
            calculé · jamais saisie
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-primary-200 dark:bg-primary-800 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#C97E12' }} />
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: Space['status'] }) {
  const meta = STATUS_META[status];
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
      style={{ background: `${meta.color}20`, color: meta.color }}>
      {meta.label}
    </span>
  );
}

export function ViaBadge({ surface }: { surface: SpaceEvent['originSurface'] }) {
  if (surface === 'space') return null;
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold" title="Événement émis depuis le workspace, sans changer d'écran">
      via workspace
    </span>
  );
}
