/**
 * Admin Auth — verrou par mot de passe sur le module Settings.
 *
 * Stockage local : hash SHA-256 du mot de passe + sel aléatoire.
 * Aucun mot de passe en clair. Session valide 30 minutes après déverrouillage,
 * puis re-prompt automatique.
 *
 * Réinit possible via "factory reset" qui efface aussi tous les paramètres.
 */

const HASH_KEY = 'admin-pwd-hash';
const SALT_KEY = 'admin-pwd-salt';
const SESSION_KEY = 'admin-session-until';
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Indique si un mot de passe admin a déjà été configuré. */
export function isAdminPasswordSet(): boolean {
  return !!localStorage.getItem(HASH_KEY);
}

/** Indique si la session admin est actuellement déverrouillée (< 30 min). */
export function isAdminUnlocked(): boolean {
  const until = parseInt(localStorage.getItem(SESSION_KEY) ?? '0', 10);
  return Date.now() < until;
}

/** Renouvelle la session après une activité. */
export function refreshAdminSession() {
  if (isAdminUnlocked()) {
    localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_DURATION_MS));
  }
}

/** Configure un nouveau mot de passe admin (premier setup ou changement). */
export async function setAdminPassword(password: string): Promise<void> {
  if (password.length < 4) throw new Error('Le mot de passe doit contenir au moins 4 caractères.');
  const salt = generateSalt();
  const hash = await sha256Hex(salt + password);
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(HASH_KEY, hash);
  // Une fois configuré, on déverrouille immédiatement
  localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_DURATION_MS));
}

/** Vérifie un mot de passe et déverrouille la session si correct. */
export async function unlockAdmin(password: string): Promise<boolean> {
  const expectedHash = localStorage.getItem(HASH_KEY);
  const salt = localStorage.getItem(SALT_KEY);
  if (!expectedHash || !salt) return false;
  const hash = await sha256Hex(salt + password);
  if (hash !== expectedHash) return false;
  localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_DURATION_MS));
  return true;
}

/** Verrouille immédiatement la session. */
export function lockAdmin() {
  localStorage.removeItem(SESSION_KEY);
}

/** Supprime le mot de passe admin (réinit). À utiliser avec précaution. */
export function resetAdminPassword() {
  localStorage.removeItem(HASH_KEY);
  localStorage.removeItem(SALT_KEY);
  localStorage.removeItem(SESSION_KEY);
}

/** Change le mot de passe en vérifiant l'ancien d'abord. */
export async function changeAdminPassword(oldPassword: string, newPassword: string): Promise<boolean> {
  const ok = await unlockAdmin(oldPassword);
  if (!ok) return false;
  await setAdminPassword(newPassword);
  return true;
}
