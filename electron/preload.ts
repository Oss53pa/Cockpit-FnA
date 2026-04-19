import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ── App ──────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('app:version'),
  getUserDataPath: () => ipcRenderer.invoke('app:userData'),

  // ── File dialogs ────────────────────────────────────
  openFileDialog: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options?: any) => ipcRenderer.invoke('dialog:saveFile', options),

  // ── File system ─────────────────────────────────────
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, data: ArrayBuffer) => ipcRenderer.invoke('fs:writeFile', filePath, data),

  // ── Notifications ───────────────────────────────────
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('notification:show', { title, body }),

  // ── SQLite database ─────────────────────────────────
  db: {
    query: (sql: string, params?: any[]) => ipcRenderer.invoke('db:query', sql, params),
    run: (sql: string, params?: any[]) => ipcRenderer.invoke('db:run', sql, params),
    bulkInsert: (table: string, columns: string[], rows: any[][]) =>
      ipcRenderer.invoke('db:bulkInsert', table, columns, rows),
    getAll: (table: string, where?: Record<string, any>) =>
      ipcRenderer.invoke('db:getAll', table, where),
    getOne: (table: string, where: Record<string, any>) =>
      ipcRenderer.invoke('db:getOne', table, where),
    upsert: (table: string, data: Record<string, any>, keys: string[]) =>
      ipcRenderer.invoke('db:upsert', table, data, keys),
    deleteRows: (table: string, where: Record<string, any>) =>
      ipcRenderer.invoke('db:delete', table, where),
  },

  // ── Sync ────────────────────────────────────────────
  sync: {
    push: () => ipcRenderer.invoke('sync:push'),
    pull: () => ipcRenderer.invoke('sync:pull'),
    getStatus: () => ipcRenderer.invoke('sync:status'),
    setSupabaseConfig: (url: string, key: string) =>
      ipcRenderer.invoke('sync:config', url, key),
  },

  // ── Events from main process ────────────────────────
  onSyncProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('sync:progress', listener);
    return () => ipcRenderer.removeListener('sync:progress', listener);
  },
});

// TypeScript type for renderer
export interface ElectronAPI {
  getVersion(): Promise<string>;
  getUserDataPath(): Promise<string>;
  openFileDialog(options?: any): Promise<string | null>;
  saveFileDialog(options?: any): Promise<string | null>;
  readFile(filePath: string): Promise<ArrayBuffer>;
  writeFile(filePath: string, data: ArrayBuffer): Promise<void>;
  showNotification(title: string, body: string): Promise<void>;
  db: {
    query(sql: string, params?: any[]): Promise<any[]>;
    run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number }>;
    bulkInsert(table: string, columns: string[], rows: any[][]): Promise<void>;
    getAll(table: string, where?: Record<string, any>): Promise<any[]>;
    getOne(table: string, where: Record<string, any>): Promise<any | null>;
    upsert(table: string, data: Record<string, any>, keys: string[]): Promise<void>;
    deleteRows(table: string, where: Record<string, any>): Promise<void>;
  };
  sync: {
    push(): Promise<{ pushed: number }>;
    pull(): Promise<{ pulled: number }>;
    getStatus(): Promise<{ online: boolean; lastSync: string | null; pendingChanges: number }>;
    setSupabaseConfig(url: string, key: string): Promise<void>;
  };
  onSyncProgress(callback: (progress: any) => void): () => void;
}
