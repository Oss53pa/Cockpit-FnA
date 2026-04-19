import { Menu, shell } from 'electron';
import type { BrowserWindow } from 'electron';

export function buildMenu(win: BrowserWindow) {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Importer...',
          accelerator: 'CmdOrCtrl+I',
          click: () => win.webContents.send('menu:import'),
        },
        {
          label: 'Exporter le rapport...',
          accelerator: 'CmdOrCtrl+E',
          click: () => win.webContents.send('menu:export'),
        },
        { type: 'separator' },
        {
          label: 'Synchroniser',
          accelerator: 'CmdOrCtrl+S',
          click: () => win.webContents.send('menu:sync'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Edition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'forceReload', label: 'Recharger (forcé)' },
        { role: 'toggleDevTools', label: 'Outils développeur' },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Zoom +' },
        { role: 'zoomOut', label: 'Zoom -' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://cockpit-fna.com/docs'),
        },
        {
          label: 'Signaler un problème',
          click: () => shell.openExternal('https://github.com/cockpit-fna/issues'),
        },
        { type: 'separator' },
        {
          label: 'A propos de Cockpit FnA',
          click: () => win.webContents.send('menu:about'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
