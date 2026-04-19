/**
 * Sync handler: SQLite ↔ Supabase bidirectional synchronization.
 * Push pending local changes, pull remote updates.
 */
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { IpcMain } from 'electron';

interface SyncConfig {
  supabaseUrl: string;
  supabaseKey: string;
  lastSyncAt: string | null;
}

const SYNC_TABLES = [
  'organizations', 'fiscal_years', 'periods', 'accounts',
  'gl_entries', 'imports', 'budgets', 'reports',
  'attention_points', 'action_plans',
];

function getConfigPath() {
  return path.join(app.getPath('userData'), 'sync-config.json');
}

function loadConfig(): SyncConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { supabaseUrl: '', supabaseKey: '', lastSyncAt: null };
  }
}

function saveConfig(config: SyncConfig) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

export function setupSyncHandlers(ipcMain: IpcMain) {
  ipcMain.handle('sync:config', (_event, url: string, key: string) => {
    const config = loadConfig();
    config.supabaseUrl = url;
    config.supabaseKey = key;
    saveConfig(config);
  });

  ipcMain.handle('sync:status', async () => {
    const config = loadConfig();
    const online = !!config.supabaseUrl;

    // Count pending changes via DB
    let pendingChanges = 0;
    try {
      const Database = require('better-sqlite3');
      const dbPath = path.join(app.getPath('userData'), 'cockpit.db');
      if (fs.existsSync(dbPath)) {
        const db = new Database(dbPath, { readonly: true });
        for (const table of SYNC_TABLES) {
          try {
            const row = db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE sync_status = 'pending'`).get() as any;
            pendingChanges += row?.c ?? 0;
          } catch { /* table might not exist yet */ }
        }
        db.close();
      }
    } catch { /* ignore */ }

    return {
      online,
      lastSync: config.lastSyncAt,
      pendingChanges,
    };
  });

  ipcMain.handle('sync:push', async (event) => {
    const config = loadConfig();
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error('Supabase non configuré');
    }

    const Database = require('better-sqlite3');
    const dbPath = path.join(app.getPath('userData'), 'cockpit.db');
    const db = new Database(dbPath);

    let totalPushed = 0;

    for (const table of SYNC_TABLES) {
      try {
        const pending = db.prepare(`SELECT * FROM ${table} WHERE sync_status = 'pending'`).all();
        if (!pending.length) continue;

        // Push to Supabase via REST API
        const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`,
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(pending.map((row: any) => {
            const { sync_status, ...rest } = row;
            return rest;
          })),
        });

        if (response.ok) {
          // Mark as synced
          const ids = pending.map((r: any) => r.id ?? r.code).filter(Boolean);
          if (ids.length) {
            const pkCol = table === 'accounts' ? 'code' : 'id';
            db.prepare(
              `UPDATE ${table} SET sync_status = 'synced' WHERE ${pkCol} IN (${ids.map(() => '?').join(',')})`
            ).run(...ids);
          }
          totalPushed += pending.length;
        }

        // Report progress
        event.sender.send('sync:progress', { table, pushed: pending.length, total: totalPushed });
      } catch { /* skip table on error */ }
    }

    db.close();
    config.lastSyncAt = new Date().toISOString();
    saveConfig(config);

    return { pushed: totalPushed };
  });

  ipcMain.handle('sync:pull', async (event) => {
    const config = loadConfig();
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error('Supabase non configuré');
    }

    const Database = require('better-sqlite3');
    const dbPath = path.join(app.getPath('userData'), 'cockpit.db');
    const db = new Database(dbPath);

    let totalPulled = 0;

    for (const table of SYNC_TABLES) {
      try {
        let url = `${config.supabaseUrl}/rest/v1/${table}?select=*`;
        if (config.lastSyncAt) {
          url += `&updated_at=gte.${config.lastSyncAt}`;
        }

        const response = await fetch(url, {
          headers: {
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`,
          },
        });

        if (!response.ok) continue;
        const rows = await response.json();
        if (!rows.length) continue;

        // Upsert into local SQLite
        for (const row of rows) {
          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(',');
          const pkCol = table === 'accounts' ? 'org_id, code' : 'id';
          const updates = columns.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(',');

          db.prepare(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})
             ON CONFLICT (${pkCol}) DO UPDATE SET ${updates}, sync_status = 'synced'`
          ).run(...Object.values(row));
        }

        totalPulled += rows.length;
        event.sender.send('sync:progress', { table, pulled: rows.length, total: totalPulled });
      } catch { /* skip table */ }
    }

    db.close();
    config.lastSyncAt = new Date().toISOString();
    saveConfig(config);

    return { pulled: totalPulled };
  });
}
