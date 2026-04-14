// Audit trail — Journal des modifications
import { db } from '../db/schema';

export interface AuditEntry {
  id?: number;
  orgId: string;
  date: number;
  user: string;
  action: 'create' | 'update' | 'delete' | 'import' | 'export' | 'close_period' | 'open_period';
  entity: 'gl' | 'account' | 'period' | 'organization' | 'budget' | 'report' | 'template' | 'attention_point' | 'action_plan';
  entityId?: string;
  summary: string;
  details?: string; // JSON
}

const KEY = 'audit-log';

function loadLog(): AuditEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

function saveLog(entries: AuditEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 5000)));
}

export function logAction(entry: Omit<AuditEntry, 'id' | 'date'>): void {
  const log = loadLog();
  log.unshift({ ...entry, id: Date.now(), date: Date.now() });
  saveLog(log);
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
  const header = 'Date,Utilisateur,Action,Entité,ID Entité,Résumé\n';
  const rows = entries.map((e) =>
    `${new Date(e.date).toISOString()},${e.user},${e.action},${e.entity},${e.entityId ?? ''},${e.summary.replace(/,/g, ';')}`
  ).join('\n');
  return header + rows;
}
