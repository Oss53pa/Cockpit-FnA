// Espace Collaboratif — helpers UI et opérations partagées (Portefeuille + Espace)
import { dataProvider } from '../../db/provider';
import { invalidateCloudData } from '../../hooks/useCloudData';
import { safeLocalStorage } from '../../lib/safeStorage';
import { GUEST_USER } from '../../lib/appConfig';
import type { Space, SpaceAction, SpaceCriterion, SpaceDecision, SpaceEvent, SpaceEventType, SpaceSnapshot, SpaceSolution } from '../../db/schema';
import { STATUS_META, hashSnapshot, runVigie, buildClosureReport, type ClosureReport } from '../../engine/spaces';

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

/**
 * Fige un snapshot (§9) : données structurées + hash SHA-256, immuable, tracé
 * dans le fil (`snapshot_created`). Deux captures identiques -> même hash.
 */
export async function createSpaceSnapshot(
  space: Pick<Space, 'id' | 'orgId'>,
  sourceView: string,
  label: string,
  data: Record<string, unknown>,
  takenBy: string,
  filters?: Record<string, unknown>,
): Promise<string> {
  const hashSha256 = await hashSnapshot(data);
  await dataProvider.addSpaceSnapshot({
    orgId: space.orgId, spaceId: space.id, sourceApp: 'fna', sourceView, label,
    filters: filters ?? {}, data, hashSha256, takenBy, takenAt: Date.now(),
  });
  await logSpaceEvent(space, 'snapshot_created', takenBy, { label, sourceView, hash: hashSha256.slice(0, 12) });
  return hashSha256;
}

/**
 * Vigie : matérialise les relances DUES (retard, escalade, chemin critique) en
 * événements `proph3t_alert`, en évitant les doublons (clés déjà émises). Pure
 * idempotence : si tout est déjà relancé, aucun événement n'est écrit.
 */
export async function materializeVigie(
  space: Pick<Space, 'id' | 'orgId' | 'status' | 'ownerId'>,
  actions: SpaceAction[],
  events: SpaceEvent[],
): Promise<number> {
  const existingKeys = new Set(
    events.filter((e) => e.eventType === 'proph3t_alert' && e.payload?.key).map((e) => String(e.payload!.key)),
  );
  const alerts = runVigie(space, actions, existingKeys);
  for (const a of alerts) {
    await logSpaceEvent(space, 'proph3t_alert', 'Proph3t',
      { key: a.key, kind: a.kind, target: a.target, message: a.message, actionId: a.actionId },
      { actorKind: 'proph3t' });
  }
  return alerts.length;
}

/**
 * Génère le rapport de clôture (§10), le trace dans le fil (`proph3t_report`,
 * append-only → rétention) et le retourne. Assemblage déterministe (moteur).
 */
export async function generateClosureReport(
  space: Space,
  parts: { solutions: SpaceSolution[]; actions: SpaceAction[]; decisions: SpaceDecision[]; events: SpaceEvent[]; snapshots: SpaceSnapshot[]; criteria: SpaceCriterion[] },
): Promise<ClosureReport> {
  const report = buildClosureReport(space, parts);
  await logSpaceEvent(space, 'proph3t_report', 'Proph3t',
    { title: report.title, report: report as unknown as Record<string, unknown> },
    { actorKind: 'proph3t' });
  return report;
}

/** Exporte le rapport de clôture en PDF (jsPDF + autoTable). */
export async function exportClosureReportPdf(report: ClosureReport, orgName: string): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFontSize(16); doc.text('Rapport de clôture — Espace Collaboratif', 40, 48);
  doc.setFontSize(11); doc.setTextColor(90); doc.text(report.title.replace('Rapport de clôture — ', ''), 40, 68);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`${orgName} · Ancrage : ${report.meta.anchor}`, 40, 84);
  doc.text(`Responsable : ${report.meta.owner} · Durée : ${report.meta.durationDays} j · Convergence : ${report.meta.convergencePct} % · Généré le ${new Date(report.generatedAt).toLocaleString('fr-FR')}`, 40, 98);
  let startY = 116;
  for (const s of report.sections) {
    autoTable(doc, {
      startY,
      head: [[s.heading]],
      body: s.rows.map((r) => [r]),
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [31, 30, 27], fontSize: 9.5 },
      margin: { left: 40, right: 40 },
    });
    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text('Conservation OHADA ≥ 10 ans · Chiffres issus des données (aucun calcul par LLM) · Cockpit FnA', 40, doc.internal.pageSize.getHeight() - 24);
  doc.save(`Cloture_${report.title.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40)}.pdf`);
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
        <span className="num text-[12px] font-bold" style={{ color: 'rgb(var(--accent))' }}>{pct} %</span>
        {showBadge && (
          <span className="text-[9px] uppercase tracking-wider text-primary-400" title={formula}>
            calculé · jamais saisie
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-primary-200 dark:bg-primary-800 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'rgb(var(--accent))' }} />
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
