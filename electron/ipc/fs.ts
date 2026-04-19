/**
 * File system handlers for Electron.
 * Native file read/write for imports and exports.
 */
import fs from 'fs/promises';
import type { IpcMain, BrowserWindow } from 'electron';

export function setupFSHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const buffer = await fs.readFile(filePath);
    return buffer.buffer;
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, data: ArrayBuffer) => {
    await fs.writeFile(filePath, Buffer.from(data));
  });
}
