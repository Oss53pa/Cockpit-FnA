import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
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
