/**
 * Service Worker minimal pour Cockpit FnA.
 *
 * Rôle PRIMARY : satisfaire l'exigence Chrome/Edge pour le prompt
 * d'installation PWA ("Ajouter à l'écran d'accueil" / épingler à la
 * barre des tâches). Le SW DOIT être enregistré et répondre au moins
 * à une requête fetch pour que l'app soit considérée installable.
 *
 * Pas de cache offline pour l'instant : l'app reste dépendante du réseau
 * (Supabase) pour l'auth et la data. Une stratégie offline complète
 * (cache-first sur les assets + IndexedDB pour la data) sera ajoutée
 * plus tard si demandée par les pilotes.
 *
 * Versioning : modifier la constante CACHE_VERSION pour invalider tous
 * les clients existants et forcer le re-fetch des assets.
 */

const CACHE_VERSION = 'cockpit-fna-v1';
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// Liste minimale de ressources à pré-cacher (le shell de l'app).
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith('cockpit-fna-') && k !== ASSET_CACHE).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

// Stratégie : network-first pour la navigation (HTML), cache-first pour les
// assets statiques (icons, manifest). On NE TOUCHE PAS aux requêtes Supabase
// (API calls, auth) — elles passent toujours par le réseau.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignorer les appels API (Supabase, autres origins) — pas de cache, juste passer
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/functions/v1/')) return;

  // Navigation HTML : network-first avec fallback cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || new Response('Offline', { status: 503 }))),
    );
    return;
  }

  // Assets statiques : cache-first
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req).then((r) => r || new Response('', { status: 404 })))),
    );
  }
});
