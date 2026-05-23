import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// Applique la palette active (twisty par défaut ou choix utilisateur) dès le
// boot, pour TOUTES les routes — y compris /login et les pages auth, qui sinon
// restaient sur les valeurs :root par défaut (theme.ts n'étant chargé que par
// les écrans authentifiés). Side-effect : applyPalette(loadPalette()).
import './store/theme';
import { ensureSeeded } from './db/seed';

ensureSeeded().catch((e) => console.error('Seed failed', e));

// Service Worker — déclenche le prompt d'installation PWA (épinglage barre des
// tâches sur desktop, ajout à l'écran d'accueil sur mobile). Pas de cache offline
// agressif : juste les assets statiques + manifest. Voir public/sw.js.
//
// Désactivé en DEV pour éviter de cacher les bundles Vite HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[sw] enregistrement échoué (non bloquant):', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
