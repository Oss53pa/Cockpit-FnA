import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
import path from 'path';
import { setupDBHandlers } from './ipc/db';
import { setupFSHandlers } from './ipc/fs';
import { setupSyncHandlers } from './ipc/sync';
import { buildMenu } from './menu';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Cockpit FnA',
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  // Menu
  buildMenu(mainWindow);
}

// ── IPC Handlers ──────────────────────────────────────────────────────
setupDBHandlers(ipcMain);
setupFSHandlers(ipcMain, () => mainWindow);
setupSyncHandlers(ipcMain);

// Dialog handlers
ipcMain.handle('dialog:openFile', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: options?.filters ?? [
      { name: 'Fichiers Excel/CSV', extensions: ['xlsx', 'xls', 'csv'] },
      { name: 'Tous', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, options) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: options?.defaultPath,
    filters: options?.filters ?? [
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Excel', extensions: ['xlsx'] },
      { name: 'Tous', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePath;
});

// Notifications
ipcMain.handle('notification:show', (_event, { title, body }: { title: string; body: string }) => {
  new Notification({ title, body }).show();
});

// App info
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:userData', () => app.getPath('userData'));

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
