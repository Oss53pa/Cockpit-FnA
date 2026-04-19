/**
 * SQLite database handler for Electron (better-sqlite3).
 * Mirrors the Supabase schema locally for offline support.
 */
import { app } from 'electron';
import path from 'path';
import Database from 'better-sqlite3';
import type { IpcMain } from 'electron';

let db: Database.Database;

function getDB(): Database.Database {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'cockpit.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const version = db.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").get() as any;
  const currentVersion = version ? parseInt(version.value) : 0;

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'XOF',
        sector TEXT NOT NULL DEFAULT '',
        accounting_system TEXT NOT NULL DEFAULT 'Normal',
        rccm TEXT, ifu TEXT, address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS fiscal_years (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        start_date TEXT NOT NULL, end_date TEXT NOT NULL,
        closed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS periods (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        fiscal_year_id TEXT NOT NULL,
        year INTEGER NOT NULL, month INTEGER NOT NULL,
        label TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );
      CREATE INDEX IF NOT EXISTS idx_periods_org ON periods(org_id, year, month);

      CREATE TABLE IF NOT EXISTS accounts (
        org_id TEXT NOT NULL, code TEXT NOT NULL,
        label TEXT NOT NULL,
        sysco_code TEXT, class TEXT NOT NULL, type TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced',
        PRIMARY KEY (org_id, code)
      );

      CREATE TABLE IF NOT EXISTS gl_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL, period_id TEXT NOT NULL,
        date TEXT NOT NULL, journal TEXT NOT NULL, piece TEXT DEFAULT '',
        account TEXT NOT NULL, label TEXT DEFAULT '',
        debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
        tiers TEXT, analytical_axis TEXT, analytical_section TEXT,
        lettrage TEXT, import_id INTEGER,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );
      CREATE INDEX IF NOT EXISTS idx_gl_org_period ON gl_entries(org_id, period_id);
      CREATE INDEX IF NOT EXISTS idx_gl_org_account ON gl_entries(org_id, account);

      CREATE TABLE IF NOT EXISTS imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL, date INTEGER NOT NULL,
        user_name TEXT DEFAULT '', file_name TEXT NOT NULL,
        file_hash TEXT, source TEXT DEFAULT '',
        kind TEXT NOT NULL, year INTEGER, version TEXT,
        count INTEGER DEFAULT 0, rejected INTEGER DEFAULT 0,
        status TEXT DEFAULT 'success', report TEXT, storage_path TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL, year INTEGER NOT NULL,
        version TEXT DEFAULT 'V1', account TEXT NOT NULL,
        month INTEGER NOT NULL, amount REAL DEFAULT 0,
        analytical_axis TEXT, analytical_section TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL, title TEXT NOT NULL,
        type TEXT DEFAULT '', author TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        created_at INTEGER NOT NULL, updated_at_ts INTEGER NOT NULL,
        content TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS attention_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT, severity TEXT DEFAULT 'medium',
        probability TEXT DEFAULT 'medium', category TEXT DEFAULT '',
        source TEXT, owner TEXT,
        detected_at INTEGER NOT NULL, detected_by TEXT,
        target_resolution_date TEXT,
        estimated_financial_impact REAL,
        impact_description TEXT, root_cause TEXT,
        recommendation TEXT, tags TEXT,
        status TEXT DEFAULT 'open',
        resolved_at INTEGER, resolved_note TEXT,
        last_reviewed_at INTEGER, journal TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS action_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL, attention_point_id INTEGER,
        title TEXT NOT NULL, description TEXT,
        owner TEXT DEFAULT '', team TEXT, sponsor TEXT,
        start_date TEXT, due_date TEXT, review_date TEXT,
        priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'todo',
        progress INTEGER DEFAULT 0,
        budget_allocated REAL, resources_needed TEXT,
        deliverables TEXT, success_criteria TEXT,
        estimated_impact TEXT, dependencies TEXT,
        blockers TEXT, journal TEXT, tags TEXT,
        created_at INTEGER NOT NULL, updated_at_ts INTEGER NOT NULL,
        completed_at INTEGER,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', '1');
    `);
  }
}

export function setupDBHandlers(ipcMain: IpcMain) {
  ipcMain.handle('db:query', (_event, sql: string, params?: any[]) => {
    return getDB().prepare(sql).all(...(params ?? []));
  });

  ipcMain.handle('db:run', (_event, sql: string, params?: any[]) => {
    const result = getDB().prepare(sql).run(...(params ?? []));
    return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
  });

  ipcMain.handle('db:bulkInsert', (_event, table: string, columns: string[], rows: any[][]) => {
    const d = getDB();
    const placeholders = columns.map(() => '?').join(',');
    const stmt = d.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
    const insertMany = d.transaction((rows: any[][]) => {
      for (const row of rows) stmt.run(...row);
    });
    insertMany(rows);
  });

  ipcMain.handle('db:getAll', (_event, table: string, where?: Record<string, any>) => {
    const d = getDB();
    if (!where || Object.keys(where).length === 0) {
      return d.prepare(`SELECT * FROM ${table}`).all();
    }
    const conditions = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
    return d.prepare(`SELECT * FROM ${table} WHERE ${conditions}`).all(...Object.values(where));
  });

  ipcMain.handle('db:getOne', (_event, table: string, where: Record<string, any>) => {
    const d = getDB();
    const conditions = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
    return d.prepare(`SELECT * FROM ${table} WHERE ${conditions}`).get(...Object.values(where)) ?? null;
  });

  ipcMain.handle('db:upsert', (_event, table: string, data: Record<string, any>, keys: string[]) => {
    const d = getDB();
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(',');
    const updates = columns.filter(c => !keys.includes(c)).map(c => `${c} = excluded.${c}`).join(',');
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})
      ON CONFLICT (${keys.join(',')}) DO UPDATE SET ${updates}, updated_at = datetime('now'), sync_status = 'pending'`;
    d.prepare(sql).run(...Object.values(data));
  });

  ipcMain.handle('db:delete', (_event, table: string, where: Record<string, any>) => {
    const d = getDB();
    const conditions = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
    return d.prepare(`DELETE FROM ${table} WHERE ${conditions}`).run(...Object.values(where));
  });
}
