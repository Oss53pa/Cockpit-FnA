/**
 * proph3Crypto — chiffrement AES-GCM côté client pour la mémoire/apprentissage
 * de Proph3t stockée dans Supabase.
 *
 * Modèle de menace :
 *   - L'attaquant peut accéder au ROW Supabase via le user (RLS le restreint
 *     déjà à ses orgs). Mais on chiffre quand même les données pour :
 *       1. Ne pas exposer les chiffres financiers en clair même avec accès DB.
 *       2. Si la table était par erreur exposée (mauvaise config RLS future), les
 *          données restent illisibles sans la clé client.
 *
 * Clé maître :
 *   - Dérivée par PBKDF2 d'un secret stable côté client : `user.id` Supabase
 *     (UUID stable across devices) + un sel applicatif.
 *   - Multi-device : même `user.id` → même clé sur tous les devices de l'utilisateur.
 *   - Fragile si `user.id` est compromis (visible côté browser). Mais combiné avec
 *     RLS server-side, ça forme une defense-in-depth raisonnable.
 *
 * Format stocké :
 *   - `data_encrypted` : ciphertext AES-256-GCM en base64
 *   - `iv`             : Initialization Vector (12 bytes random) en base64
 *
 * Pas de support de rotation de clé pour l'instant — si user.id change (rare),
 * on perd l'accès aux anciennes données. Acceptable pour ce use case (pas de
 * contrainte de rétention légale sur la mémoire IA).
 */

// Sels applicatifs versionnés (pas des secrets — visibles dans le code).
// Leur rôle : séparer ce schéma de tout autre usage du user.id ET permettre la
// rotation de clé sans cassure des données existantes (SEC-03).
// v1 = sel d'origine ; v2 = nouveau sel (rotation post-audit).
const APP_SALTS: Record<number, Uint8Array> = {
  1: new TextEncoder().encode('cockpit-fna-proph3:v1'),
  2: new TextEncoder().encode('cockpit-fna-proph3:v2'),
} as const;
/** Sel courant pour les NOUVEAUX chiffrements. */
const CURRENT_KEY_VERSION = 2;

const subtle = (): SubtleCrypto => {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Web Crypto API non disponible — environnement non sécurisé.');
  }
  return window.crypto.subtle;
};

// ─── Encodages base64 ────────────────────────────────────────────────────────
function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── Dérivation de la clé maître AES-256 ─────────────────────────────────────
let cachedKey: { userId: string; version: number; key: CryptoKey } | null = null;

async function deriveMasterKey(userId: string, version = CURRENT_KEY_VERSION): Promise<CryptoKey> {
  if (cachedKey && cachedKey.userId === userId && cachedKey.version === version) return cachedKey.key;
  const salt = APP_SALTS[version] ?? APP_SALTS[1];
  const enc = new TextEncoder();
  const baseKey = await subtle().importKey(
    'raw',
    enc.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  cachedKey = { userId, version, key };
  return key;
}

// ─── API publique ────────────────────────────────────────────────────────────
export interface EncryptedPayload {
  data_encrypted: string; // base64 ciphertext
  iv: string;             // base64 IV (12 bytes)
  /** Version de la clé utilisée (absent = 1 pour compatibilité). SEC-03. */
  v?: number;
}

/**
 * Chiffre un objet JSON avec la clé maître dérivée du `userId`.
 * Renvoie un payload prêt à stocker (data_encrypted + iv + v).
 * Utilise CURRENT_KEY_VERSION (v2 post-audit SEC-03).
 */
export async function encryptJson(userId: string, payload: unknown): Promise<EncryptedPayload> {
  const key = await deriveMasterKey(userId, CURRENT_KEY_VERSION);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    data_encrypted: bytesToB64(new Uint8Array(ciphertext)),
    iv: bytesToB64(iv),
    v: CURRENT_KEY_VERSION,
  };
}

/**
 * Déchiffre un payload AES-GCM avec la clé maître dérivée du `userId`.
 * Gère automatiquement les deux versions de clé (v1 = ancien, v2 = post-audit).
 * Lève une exception si la clé est mauvaise ou si le ciphertext est corrompu.
 */
export async function decryptJson<T = unknown>(
  userId: string,
  encrypted: { data_encrypted: string; iv: string; v?: number },
): Promise<T> {
  // Détermine la version de la clé à partir du payload (absent = v1 pour compat)
  const keyVersion = encrypted.v ?? 1;
  const key = await deriveMasterKey(userId, keyVersion);
  const iv = b64ToBytes(encrypted.iv);
  const ciphertext = b64ToBytes(encrypted.data_encrypted);
  const plaintext = await subtle().decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const text = new TextDecoder().decode(plaintext);
  return JSON.parse(text) as T;
}

/**
 * Effectue la rotation d'un tableau de payloads de v1 → v2 (ou vers la version courante).
 * Appeler après un changement de sel (bump CURRENT_KEY_VERSION).
 *
 * @example
 *   const migrated = await rotateCryptoKey(userId, oldPayloads);
 *   // Sauvegarder `migrated` en base pour remplacer les anciens payloads.
 */
export async function rotateCryptoKey(
  userId: string,
  payloads: EncryptedPayload[],
  fromVersion = 1,
): Promise<EncryptedPayload[]> {
  const result: EncryptedPayload[] = [];
  for (const p of payloads) {
    const version = p.v ?? 1;
    if (version === CURRENT_KEY_VERSION) { result.push(p); continue; }
    // Déchiffre avec l'ancienne clé
    const plainObj = await decryptJson(userId, { ...p, v: fromVersion });
    // Rechiffre avec la clé courante
    result.push(await encryptJson(userId, plainObj));
  }
  return result;
}

/**
 * Vide le cache de clé (à appeler au logout pour libérer la mémoire).
 */
export function clearCryptoCache(): void {
  cachedKey = null;
}
