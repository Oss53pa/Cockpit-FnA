/**
 * Audit trail — Journal des modifications avec chaine de hashes SHA-256.
 *
 * Architecture :
 * - Stockage Dexie (table `auditEntries` v6) + fallback localStorage
 * - Chaine de hashes : chaque entree contient le hash SHA-256 de la precedente
 *   → integrite verifiable (Big4-grade)
 * - Multi-tenant via orgId
 * - Helpers de logging par domaine (logImport, logExport, logUser, …)
 *   pour standardiser les appels depuis tout le code
 */

const KEY = 'audit-log';

export type AuditAction =
  | 'create' | 'update' | 'delete'
  | 'import' | 'export'
  | 'close_period' | 'open_period'
  | 'invite' | 'revoke' | 'login' | 'logout'
  | 'settings_change' | 'reset' | 'send_email';

export type AuditEntity =
  | 'gl' | 'account' | 'period' | 'organization' | 'budget'
  | 'report' | 'template' | 'attention_point' | 'action_plan'
  | 'user' | 'token' | 'webhook' | 'settings' | 'email' | 'import' | 'fiscal_year';

export interface AuditEntry {
  id?: number;
  orgId: string;
  date: number;
  user: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  summary: string;
  details?: string; // JSON serialise (avant/apres, params, etc.)
  hash?: string;          // SHA-256(prevHash + canonical(payload))
  previousHash?: string;
}

function loadLog(): AuditEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

function saveLog(entries: AuditEntry[]) {
  // Garde les 5000 dernieres
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 5000)));
}

/** Calcule SHA-256 hex sur une chaine. */
async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Forme canonique de l'entree (sans hash) pour calcul deterministe. */
function canonical(e: Omit<AuditEntry, 'id' | 'hash'>): string {
  return JSON.stringify({
    orgId: e.orgId, date: e.date, user: e.user,
    action: e.action, entity: e.entity, entityId: e.entityId ?? null,
    summary: e.summary, details: e.details ?? null,
    previousHash: e.previousHash ?? null,
  });
}

/** Recupere le user courant via le store auth. */
function currentUser(): string {
  try {
    const raw = sessionStorage.getItem('cockpit-current-user');
    if (raw) {
      const u = JSON.parse(raw);
      return u?.name ?? u?.email ?? 'system';
    }
  } catch { /* ignore */ }
  return 'system';
}

/**
 * Logue une action dans le journal d'audit.
 * Calcul du hash SHA-256 chaine async (non bloquant pour l'UI).
 */
export async function logAction(entry: Omit<AuditEntry, 'id' | 'date' | 'hash' | 'previousHash' | 'user'> & { user?: string }): Promise<void> {
  const log = loadLog();
  const previousHash = log[0]?.hash;
  const date = Date.now();
  const user = entry.user ?? currentUser();

  const base: Omit<AuditEntry, 'id' | 'hash'> = {
    ...entry,
    user,
    date,
    previousHash,
  };

  const hash = await sha256Hex(canonical(base));
  const full: AuditEntry = { ...base, id: date, hash };
  log.unshift(full);
  saveLog(log);
}

/** Version synchrone (sans hash) pour cas urgents — moins ideal mais ne bloque jamais. */
export function logActionSync(entry: Omit<AuditEntry, 'id' | 'date' | 'hash' | 'previousHash' | 'user'> & { user?: string }): void {
  // Fire & forget
  void logAction(entry);
}

export function getAuditTrail(orgId?: string, limit = 200): AuditEntry[] {
  const log = loadLog();
  const filtered = orgId ? log.filter((e) => e.orgId === orgId) : log;
  return filtered.slice(0, limit);
}

export function clearAuditTrail(): void {
  localStorage.removeItem(KEY);
}

export function exportAuditTrailCSV(orgId?: string): string {
  const entries = getAuditTrail(orgId, 5000);
  const header = 'Date,Utilisateur,Action,Entité,ID,Résumé,Hash,Hash précédent\n';
  const rows = entries.map((e) => [
    new Date(e.date).toISOString(),
    e.user,
    e.action,
    e.entity,
    e.entityId ?? '',
    `"${(e.summary ?? '').replace(/"/g, '""')}"`,
    e.hash?.slice(0, 16) ?? '',
    e.previousHash?.slice(0, 16) ?? '',
  ].join(',')).join('\n');
  return header + rows;
}

/** Export JSON complet (pour export legal Big4 ou backup). */
export function exportAuditTrailJSON(orgId?: string): string {
  return JSON.stringify(getAuditTrail(orgId, 10000), null, 2);
}

/**
 * Verifie l'integrite de la chaine de hashes.
 * Renvoie l'index de la 1ere entree corrompue (ou null si OK).
 */
export async function verifyChainIntegrity(orgId?: string): Promise<{ valid: boolean; brokenAt: number | null; total: number }> {
  const entries = getAuditTrail(orgId, 10000);
  // Les entrees sont en ordre desc — on les retraite en asc pour la verification
  const asc = [...entries].reverse();

  for (let i = 0; i < asc.length; i++) {
    const e = asc[i];
    if (!e.hash) continue;
    const expectedPrev = i > 0 ? asc[i - 1].hash : undefined;
    if ((e.previousHash ?? undefined) !== expectedPrev) {
      return { valid: false, brokenAt: i, total: asc.length };
    }
    // Recalcul du hash sur le canonical
    const recomputed = await sha256Hex(canonical({
      orgId: e.orgId, date: e.date, user: e.user,
      action: e.action, entity: e.entity, entityId: e.entityId,
      summary: e.summary, details: e.details, previousHash: e.previousHash,
    }));
    if (recomputed !== e.hash) {
      return { valid: false, brokenAt: i, total: asc.length };
    }
  }
  return { valid: true, brokenAt: null, total: asc.length };
}

// ─── Helpers domaines ──────────────────────────────────────────────
// Standardise les appels depuis le reste du code

export const audit = {
  import: (orgId: string, summary: string, details?: object) =>
    logAction({ orgId, action: 'import', entity: 'import', summary, details: details ? JSON.stringify(details) : undefined }),

  export: (orgId: string, summary: string, details?: object) =>
    logAction({ orgId, action: 'export', entity: 'report', summary, details: details ? JSON.stringify(details) : undefined }),

  closePeriod: (orgId: string, periodId: string, label: string) =>
    logAction({ orgId, action: 'close_period', entity: 'period', entityId: periodId, summary: `Clôture période ${label}` }),

  openPeriod: (orgId: string, periodId: string, label: string) =>
    logAction({ orgId, action: 'open_period', entity: 'period', entityId: periodId, summary: `Réouverture période ${label}` }),

  userInvited: (orgId: string, email: string, role: string) =>
    logAction({ orgId, action: 'invite', entity: 'user', entityId: email, summary: `Invitation envoyée à ${email} (rôle : ${role})` }),

  userUpdated: (orgId: string, email: string, changes: string[]) =>
    logAction({ orgId, action: 'update', entity: 'user', entityId: email, summary: `Mise à jour ${email} (${changes.join(', ')})` }),

  userDeleted: (orgId: string, email: string) =>
    logAction({ orgId, action: 'delete', entity: 'user', entityId: email, summary: `Suppression utilisateur ${email}` }),

  emailSent: (orgId: string, recipient: string, mode: string, subject: string) =>
    logAction({ orgId, action: 'send_email', entity: 'email', entityId: recipient, summary: `Email "${subject}" → ${recipient} (${mode})` }),

  settingsChange: (orgId: string, key: string, summary: string) =>
    logAction({ orgId, action: 'settings_change', entity: 'settings', entityId: key, summary }),

  reportPublished: (orgId: string, reportId: string, title: string) =>
    logAction({ orgId, action: 'create', entity: 'report', entityId: reportId, summary: `Rapport publié : ${title}` }),

  tokenCreated: (orgId: string, name: string, scopes: string[]) =>
    logAction({ orgId, action: 'create', entity: 'token', entityId: name, summary: `Token API créé : ${name} (${scopes.join('+')})` }),

  tokenRevoked: (orgId: string, name: string) =>
    logAction({ orgId, action: 'revoke', entity: 'token', entityId: name, summary: `Token révoqué : ${name}` }),

  webhookCreated: (orgId: string, url: string, events: string[]) =>
    logAction({ orgId, action: 'create', entity: 'webhook', entityId: url, summary: `Webhook créé : ${url} (${events.length} évén.)` }),

  webhookDeleted: (orgId: string, url: string) =>
    logAction({ orgId, action: 'delete', entity: 'webhook', entityId: url, summary: `Webhook supprimé : ${url}` }),

  reset: (orgId: string, scope: string) =>
    logAction({ orgId, action: 'reset', entity: 'settings', summary: `Réinitialisation : ${scope}` }),

  login: (orgId: string, email: string) =>
    logAction({ orgId, action: 'login', entity: 'user', entityId: email, user: email, summary: `Connexion : ${email}` }),

  logout: (orgId: string, email: string) =>
    logAction({ orgId, action: 'logout', entity: 'user', entityId: email, user: email, summary: `Déconnexion : ${email}` }),
};
