/**
 * InstallPrompt — bouton flottant "Installer l'app" sur navigateurs compatibles.
 *
 * Comportement :
 *   - Écoute `beforeinstallprompt` (Chrome, Edge, Opera, Samsung Internet)
 *   - Affiche un bouton discret en bas à droite quand l'app est éligible
 *   - Au clic : déclenche le prompt natif d'installation
 *   - Cache le bouton après installation OU si l'user a refusé (24h cooldown)
 *
 * Compatibilité :
 *   - Chrome 76+, Edge 79+, Samsung Internet 12+, Opera 64+ : prompt natif
 *   - Safari iOS/macOS : pas de prompt programmatique. Le user doit utiliser
 *     "Partager → Ajouter à l'écran d'accueil" manuellement.
 *   - Firefox : pas de prompt programmatique. Le user utilise le menu navigateur.
 */
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { safeLocalStorage } from '../../lib/safeStorage';

// Type non standard, défini par la spec « beforeinstallprompt »
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'cockpit-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Vérifie si l'app est déjà installée (display-mode standalone)
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }
    // Vérifie le cooldown de refus
    try {
      const dismissedAt = parseInt(safeLocalStorage.getItem(DISMISS_KEY) || '0', 10);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return;
    } catch { /* ignore */ }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Petit délai pour ne pas distraire à l'arrivée — attendre 8s
      setTimeout(() => setShow(true), 8_000);
    };

    const installedHandler = () => {
      setShow(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'dismissed') {
        try { safeLocalStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
      }
    } finally {
      setDeferredPrompt(null);
      setShow(false);
    }
  };

  const handleDismiss = () => {
    try { safeLocalStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  };

  if (!show || !deferredPrompt) return null;

  return (
    <div
      role="dialog"
      aria-label="Installer l'application Cockpit FnA"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-primary-900 dark:bg-primary-50 text-white dark:text-primary-900 shadow-2xl border border-primary-700 dark:border-primary-300 p-4 animate-in slide-in-from-bottom-4 duration-300"
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 dark:hover:bg-primary-900/10 transition"
        aria-label="Fermer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-start gap-3 pr-4">
        <div className="w-9 h-9 rounded-lg bg-accent/30 flex items-center justify-center shrink-0">
          <Download className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Installer Cockpit FnA</p>
          <p className="text-xs opacity-70 mt-0.5 leading-snug">
            Ajoutez l'app à votre barre des tâches pour un accès direct, comme une application native.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 transition"
            >
              Installer
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs opacity-70 hover:opacity-100 transition"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
