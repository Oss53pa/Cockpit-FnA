import { useState, useEffect } from 'react';
import { safeLocalStorage } from '../../lib/safeStorage';
import clsx from 'clsx';
import { AlertTriangle, Cloud, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { useApp } from '../../store/app';

// ─── TYPES ──────────────────────────────────────────────────────────
type ApiToken = {
  id: string;
  name: string;
  scopes: ('read' | 'write' | 'admin')[];
  prefix: string;
  hashedKey: string;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
};

type Webhook = {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  secret: string;
  createdAt: number;
  lastFiredAt?: number;
  lastStatus?: number;
};

type WebhookEvent = 'gl.imported' | 'report.published' | 'alert.triggered' | 'period.closed' | 'user.invited' | 'export.generated';

const WEBHOOK_EVENTS: { id: WebhookEvent; label: string; desc: string }[] = [
  { id: 'gl.imported',      label: 'GL importé',         desc: 'Un nouveau Grand Livre a été importé' },
  { id: 'report.published', label: 'Rapport publié',     desc: 'Un rapport a été validé et diffusé' },
  { id: 'alert.triggered',  label: 'Alerte déclenchée',  desc: 'Un ratio dépasse un seuil critique' },
  { id: 'period.closed',    label: 'Période clôturée',   desc: 'Une période fiscale a été verrouillée' },
  { id: 'user.invited',     label: 'Utilisateur invité', desc: 'Un nouvel utilisateur a été invité' },
  { id: 'export.generated', label: 'Export généré',      desc: 'Un export PDF/Excel a été produit' },
];

// ─── STORAGE HELPERS ────────────────────────────────────────────────
const tokensKey = (orgId: string) => `cockpit-api-tokens-${orgId}`;
const webhooksKey = (orgId: string) => `cockpit-webhooks-${orgId}`;
const LEGACY_TOKENS_KEY = 'cockpit-api-tokens';
const LEGACY_WEBHOOKS_KEY = 'cockpit-webhooks';

function loadTokens(orgId: string): ApiToken[] {
  try {
    const scoped = safeLocalStorage.getItem(tokensKey(orgId));
    if (!scoped) {
      const legacy = safeLocalStorage.getItem(LEGACY_TOKENS_KEY);
      if (legacy) {
        safeLocalStorage.setItem(tokensKey(orgId), legacy);
        safeLocalStorage.removeItem(LEGACY_TOKENS_KEY);
        return JSON.parse(legacy);
      }
    }
    return JSON.parse(scoped ?? '[]');
  } catch { return []; }
}

function saveTokens(orgId: string, tokens: ApiToken[]) {
  safeLocalStorage.setItem(tokensKey(orgId), JSON.stringify(tokens));
}

function loadWebhooks(orgId: string): Webhook[] {
  try {
    const scoped = safeLocalStorage.getItem(webhooksKey(orgId));
    if (!scoped) {
      const legacy = safeLocalStorage.getItem(LEGACY_WEBHOOKS_KEY);
      if (legacy) {
        safeLocalStorage.setItem(webhooksKey(orgId), legacy);
        safeLocalStorage.removeItem(LEGACY_WEBHOOKS_KEY);
        return JSON.parse(legacy);
      }
    }
    return JSON.parse(scoped ?? '[]');
  } catch { return []; }
}

function saveWebhooks(orgId: string, hooks: Webhook[]) {
  safeLocalStorage.setItem(webhooksKey(orgId), JSON.stringify(hooks));
}

async function generateToken(): Promise<{ key: string; prefix: string; hashedKey: string }> {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const key = 'cfa_' + Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
  const prefix = key.slice(0, 12) + '…';
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hashedKey = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { key, prefix, hashedKey };
}

function generateWebhookSecret(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return 'whsec_' + Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── TAB INTEGRATIONS ───────────────────────────────────────────────
export function TabIntegrations() {
  const { currentOrgId } = useApp();
  const orgScope = currentOrgId ?? 'global';
  const [tokens, setTokens] = useState<ApiToken[]>(() => loadTokens(orgScope));
  const [webhooks, setWebhooks] = useState<Webhook[]>(() => loadWebhooks(orgScope));
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenScopes, setNewTokenScopes] = useState<ApiToken['scopes']>(['read']);
  const [revealedToken, setRevealedToken] = useState<{ name: string; key: string } | null>(null);
  const [newHookUrl, setNewHookUrl] = useState('');
  const [newHookEvents, setNewHookEvents] = useState<WebhookEvent[]>([]);

  useEffect(() => {
    setTokens(loadTokens(orgScope));
    setWebhooks(loadWebhooks(orgScope));
  }, [orgScope]);

  const createToken = async () => {
    if (!newTokenName.trim()) { toast.warning('Nom requis'); return; }
    if (newTokenScopes.length === 0) { toast.warning('Au moins un scope'); return; }
    const { key, prefix, hashedKey } = await generateToken();
    const token: ApiToken = {
      id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newTokenName.trim(),
      scopes: newTokenScopes,
      prefix, hashedKey,
      createdAt: Date.now(),
    };
    const next = [...tokens, token];
    setTokens(next); saveTokens(orgScope, next);
    setRevealedToken({ name: token.name, key });
    setNewTokenName(''); setNewTokenScopes(['read']);
    toast.success('Token créé', 'Copiez-le maintenant — il ne sera plus affiché');
  };

  const revokeToken = (id: string) => {
    if (!confirm('Révoquer ce token ? Les requêtes l\'utilisant seront refusées immédiatement.')) return;
    const next = tokens.filter((t) => t.id !== id);
    setTokens(next); saveTokens(orgScope, next);
    toast.success('Token révoqué');
  };

  const createWebhook = () => {
    if (!newHookUrl.trim() || !/^https?:\/\//.test(newHookUrl.trim())) {
      toast.warning('URL invalide', 'L\'URL doit commencer par https://');
      return;
    }
    if (newHookEvents.length === 0) { toast.warning('Au moins un événement'); return; }
    const hook: Webhook = {
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      url: newHookUrl.trim(),
      events: newHookEvents,
      active: true,
      secret: generateWebhookSecret(),
      createdAt: Date.now(),
    };
    const next = [...webhooks, hook];
    setWebhooks(next); saveWebhooks(orgScope, next);
    setNewHookUrl(''); setNewHookEvents([]);
    toast.success('Webhook créé', `${hook.events.length} événement(s) configuré(s)`);
  };

  const toggleHook = (id: string) => {
    const next = webhooks.map((h) => h.id === id ? { ...h, active: !h.active } : h);
    setWebhooks(next); saveWebhooks(orgScope, next);
  };

  const deleteHook = (id: string) => {
    if (!confirm('Supprimer ce webhook ?')) return;
    const next = webhooks.filter((h) => h.id !== id);
    setWebhooks(next); saveWebhooks(orgScope, next);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copié`); }
    catch { toast.error('Copie impossible'); }
  };

  return (
    <div className="space-y-4">
      {/* API tokens */}
      <Card
        title="Tokens d'API"
        subtitle="Pour permettre à des systèmes externes (ERP, BI, scripts, n8n…) de lire ou écrire des données"
      >
        <div className="space-y-3 mb-4">
          {tokens.length === 0 ? (
            <p className="text-xs text-primary-500 italic py-3">Aucun token. Créez-en un ci-dessous pour autoriser un accès programmatique.</p>
          ) : tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-primary-200 dark:border-primary-700">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-sm">{t.name}</p>
                  {t.scopes.map((s) => <Badge key={s} variant={s === 'admin' ? 'critical' : s === 'write' ? 'medium' : 'low'}>{s}</Badge>)}
                </div>
                <p className="text-[11px] text-primary-500 num font-mono">{t.prefix}</p>
                <p className="text-[10px] text-primary-400 mt-0.5">Créé {new Date(t.createdAt).toLocaleDateString('fr-FR')}{t.lastUsedAt ? ` · Dernière utilisation ${new Date(t.lastUsedAt).toLocaleDateString('fr-FR')}` : ' · Jamais utilisé'}</p>
              </div>
              <button className="btn-outline !py-1 text-xs text-error" onClick={() => revokeToken(t.id)}>
                <Trash2 className="w-3 h-3" /> Révoquer
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-primary-200 dark:border-primary-700 pt-4 space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Nouveau token</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="input" placeholder="Nom (ex: Power BI prod, Script export…)" value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} />
            <div className="flex items-center gap-2">
              {(['read', 'write', 'admin'] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={newTokenScopes.includes(s)} onChange={(e) => {
                    setNewTokenScopes(e.target.checked ? [...newTokenScopes, s] : newTokenScopes.filter((x) => x !== s));
                  }} />
                  <span className="capitalize">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={createToken}>
            <Plus className="w-4 h-4" /> Générer le token
          </button>
        </div>
      </Card>

      {/* Modal token révélé */}
      {revealedToken && (
        <Modal open onClose={() => setRevealedToken(null)} title={`Token créé : ${revealedToken.name}`}
          footer={<button className="btn-primary" onClick={() => setRevealedToken(null)}>J'ai copié, fermer</button>}>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-primary-700 dark:text-primary-300 leading-relaxed">
                <strong>Copiez ce token maintenant.</strong> Il ne sera plus jamais affiché. Si vous le perdez, vous devrez en générer un nouveau.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-800 font-mono text-xs break-all">
              {revealedToken.key}
            </div>
            <button className="btn-outline w-full" onClick={() => copyToClipboard(revealedToken.key, 'Token')}>
              <Pencil className="w-4 h-4" /> Copier dans le presse-papier
            </button>
          </div>
        </Modal>
      )}

      {/* Webhooks */}
      <Card
        title="Webhooks"
        subtitle="Notifications HTTP POST automatiques quand un événement métier survient"
      >
        <div className="space-y-3 mb-4">
          {webhooks.length === 0 ? (
            <p className="text-xs text-primary-500 italic py-3">Aucun webhook. Créez-en un ci-dessous pour notifier vos outils externes (Slack, Zapier, n8n, votre backend…).</p>
          ) : webhooks.map((h) => (
            <div key={h.id} className="p-3 rounded-xl border border-primary-200 dark:border-primary-700">
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs truncate" title={h.url}>{h.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {h.events.map((e) => <Badge key={e}>{WEBHOOK_EVENTS.find((x) => x.id === e)?.label ?? e}</Badge>)}
                  </div>
                </div>
                <button onClick={() => toggleHook(h.id)} className={clsx('text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold shrink-0', h.active ? 'bg-success/10 text-success' : 'bg-primary-200/60 text-primary-600')}>
                  {h.active ? 'Actif' : 'Inactif'}
                </button>
                <button className="btn-ghost !p-1 text-primary-500 hover:text-error" onClick={() => deleteHook(h.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-primary-400">
                <span>Secret HMAC :</span>
                <code className="bg-primary-100 dark:bg-primary-800 px-1.5 py-0.5 rounded font-mono">{h.secret.slice(0, 16)}…</code>
                <button onClick={() => copyToClipboard(h.secret, 'Secret')} className="text-accent hover:underline">copier</button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-primary-200 dark:border-primary-700 pt-4 space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">Nouveau webhook</p>
          <input className="input font-mono text-xs" placeholder="https://votre-backend.com/webhooks/cockpit" value={newHookUrl} onChange={(e) => setNewHookUrl(e.target.value)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev.id} className="flex items-start gap-2 p-2 rounded-lg border border-primary-200 dark:border-primary-700 hover:border-accent cursor-pointer">
                <input type="checkbox" checked={newHookEvents.includes(ev.id)} className="mt-0.5"
                  onChange={(e) => setNewHookEvents(e.target.checked ? [...newHookEvents, ev.id] : newHookEvents.filter((x) => x !== ev.id))} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{ev.label}</p>
                  <p className="text-[10px] text-primary-500">{ev.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <button className="btn-primary" onClick={createWebhook}>
            <Plus className="w-4 h-4" /> Créer le webhook
          </button>
        </div>
      </Card>

      {/* Endpoints API documentation */}
      <Card title="Endpoints API" subtitle="REST — base : /api/v1 · Auth : header Authorization: Bearer cfa_…">
        <div className="space-y-2 font-mono text-xs">
          {[
            { method: 'GET',  path: '/orgs',                     scope: 'read',  desc: 'Liste des sociétés accessibles avec ce token' },
            { method: 'GET',  path: '/orgs/:id/balance',         scope: 'read',  desc: 'Balance générale d\'une société (year, fromMonth, uptoMonth)' },
            { method: 'GET',  path: '/orgs/:id/bilan',           scope: 'read',  desc: 'Bilan SYSCOHADA (Actif + Passif)' },
            { method: 'GET',  path: '/orgs/:id/cr',              scope: 'read',  desc: 'Compte de résultat + SIG' },
            { method: 'GET',  path: '/orgs/:id/ratios',          scope: 'read',  desc: 'Ratios financiers calculés' },
            { method: 'GET',  path: '/orgs/:id/reports',         scope: 'read',  desc: 'Liste des rapports publiés' },
            { method: 'GET',  path: '/orgs/:id/reports/:rid',    scope: 'read',  desc: 'Rapport complet (JSON ou PDF via Accept)' },
            { method: 'POST', path: '/orgs/:id/imports/gl',      scope: 'write', desc: 'Importer un fichier GL (multipart/form-data)' },
            { method: 'POST', path: '/orgs/:id/alerts/ack',      scope: 'write', desc: 'Acquitter une alerte' },
            { method: 'POST', path: '/orgs/:id/activities',      scope: 'write', desc: 'Créer un commentaire / annotation / correction' },
            { method: 'POST', path: '/orgs/:id/periods/:p/close', scope: 'admin', desc: 'Clôturer une période (verrouille les écritures)' },
          ].map((e) => (
            <div key={`${e.method} ${e.path}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-800/30">
              <span className={clsx('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0',
                e.method === 'GET' ? 'bg-blue-100 text-blue-800' :
                e.method === 'POST' ? 'bg-emerald-100 text-emerald-800' : 'bg-primary-200 text-primary-700')}>
                {e.method}
              </span>
              <code className="text-primary-900 dark:text-primary-100 shrink-0">{e.path}</code>
              <Badge variant={e.scope === 'admin' ? 'critical' : e.scope === 'write' ? 'medium' : 'low'}>{e.scope}</Badge>
              <p className="text-primary-500 text-[11px] flex-1 min-w-0 truncate" title={e.desc}>{e.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-primary-200 dark:border-primary-700 flex items-start gap-2 text-xs text-primary-500">
          <Cloud className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            La REST API nécessite un backend déployé. En mode 100% local (sans Supabase), les tokens sont configurés ici mais l'app servie depuis le navigateur ne peut pas répondre aux requêtes externes. Déployez Cockpit FnA derrière une Edge Function Supabase ou un proxy backend pour activer l'API.
          </p>
        </div>
      </Card>
    </div>
  );
}
