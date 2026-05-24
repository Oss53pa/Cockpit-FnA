import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Building2, Calendar, CheckCircle2, Cloud, Lock, LogOut, Moon, Pencil, Plus, Sun, Trash2, Unlock } from 'lucide-react';
import { AdminGate } from '../components/auth/AdminGate';
import { lockAdmin } from '../lib/adminAuth';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import {
  loadConfig as loadAIConfig, saveConfig as saveAIConfig, detectStatus as detectAIStatus,
  PROVIDER_PRESETS as AI_PRESETS, type AIConfig, type AIStatus,
} from '../lib/aiClient';
import { TabSwitch } from '../components/ui/TabSwitch';
import { toast } from '../components/ui/Toast';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { PALETTES, PaletteKey, useTheme } from '../store/theme';
import { dataProvider } from '../db/provider';
import { useCloudData, invalidateCloudData } from '../hooks/useCloudData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { TabDonnees } from './Settings/TabDonnees';
import { TabUsers } from './Settings/TabUsers';
import { TabEmails } from './Settings/TabEmails';
import { TabIntegrations } from './Settings/TabIntegrations';
import { Row, Field, SelectField } from './Settings/helpers';

type Tab = 'apparence' | 'societes' | 'exercices' | 'ratios' | 'donnees' | 'users' | 'ia' | 'emails' | 'integrations';

const SECTORS = ['Industrie', 'Commerce', 'BTP', 'Services', 'Agriculture', 'Santé', 'Banque', 'Microfinance', 'Éducation', 'Hôtellerie', 'Mines', 'Immobilier', 'Transport', 'Télécoms'];
const CURRENCIES = ['XOF', 'XAF', 'EUR', 'USD', 'GHS', 'NGN'];
const COA_SYSTEMS = ['SYSCOHADA', 'PCG_FR', 'IFRS', 'US_GAAP'];

export default function Settings() {
  return (
    <AdminGate>
      <SettingsContent />
    </AdminGate>
  );
}

function SettingsContent() {
  const [tab, setTab] = useState<Tab>('apparence');
  return (
    <div>
      <PageHeader
        title="Paramètres"
        subtitle="Apparence · Sociétés · Exercices · Ratios · Données · Utilisateurs · IA · Intégrations"
        action={<button className="btn-outline !py-1.5 text-xs" onClick={() => { lockAdmin(); window.location.reload(); }}>
          <Lock className="w-3.5 h-3.5" /> Verrouiller
        </button>}
      />

      <TabSwitch value={tab} onChange={setTab} tabs={[
        { key: 'apparence', label: 'Apparence' },
        { key: 'societes', label: 'Sociétés' },
        { key: 'exercices', label: 'Exercices' },
        { key: 'ratios', label: 'Ratios de référence' },
        { key: 'donnees', label: 'Données' },
        { key: 'users', label: 'Utilisateurs & rôles' },
        { key: 'ia', label: 'IA & Proph3t' },
        { key: 'emails', label: "Modèles d'emails" },
        { key: 'integrations', label: 'API & Webhooks' },
      ]} />

      {tab === 'apparence' && <TabApparence />}
      {tab === 'societes' && <TabSocietes />}
      {tab === 'exercices' && <TabExercices />}
      {tab === 'ratios' && <TabRatios />}
      {tab === 'donnees' && <TabDonnees />}
      {tab === 'users' && <TabUsers />}
      {tab === 'ia' && <TabAI />}
      {tab === 'emails' && <TabEmails />}
      {tab === 'integrations' && <TabIntegrations />}
    </div>
  );
}

// ─── APPARENCE ──────────────────────────────────────────────────────
const PALETTE_META: Record<string, { tag: string; tagColor: 'success' | 'accent' | 'warning' | 'default'; forces: string; faiblesses: string }> = {
  twisty: {
    tag: 'Recommandée',
    tagColor: 'success',
    forces: "Équilibre entre apaisement (sage) et urgence (terracotta sur les CTA critiques). Différenciation marketing forte.",
    faiblesses: "Demande discipline d'usage : terracotta réservé aux actions critiques (Envoyer, Diffuser, Clôturer).",
  },
  editorial: {
    tag: 'Pitch / Démo',
    tagColor: 'accent',
    forces: "Chaleur, identité éditoriale forte (rappelle Cockpit CR / Linear / Stripe Dashboard). Le terracotta crie pour les CTA.",
    faiblesses: "Crème peut sembler daté · terracotta vif fatigue après 4h sur des balances comptables · 'lifestyle' plutôt que 'finance institutionnelle'.",
  },
  sauge: {
    tag: 'Anti-fatigue',
    tagColor: 'success',
    forces: "Sage = différenciation rare en SaaS finance · apaisant sur longues sessions · évoque stabilité/conformité (vert = conforme) · positionnement moderne sérieux.",
    faiblesses: "Sage manque d'urgence pour les CTA · peut paraître 'trop calme' pour un outil de pilotage où il faut détecter des alertes.",
  },
};

function TabApparence() {
  const { theme, toggleTheme } = useApp();
  const paletteKey = useTheme((s) => s.paletteKey);
  const setPalette = useTheme((s) => s.setPalette);

  return (
    <div className="space-y-4">
      <Card title="Thème clair / sombre" subtitle="Persisté dans ce navigateur">
        <button className="btn-outline" onClick={toggleTheme}>
          {theme === 'dark' ? <><Sun className="w-4 h-4" /> Passer en clair</> : <><Moon className="w-4 h-4" /> Passer en sombre</>}
        </button>
      </Card>

      <Card title="Palette de couleurs" subtitle="3 directions visuelles principales · 3 alternatives complémentaires. Le changement est instantané sur toute l'app.">
        <p className="text-[10px] uppercase tracking-[0.10em] font-semibold text-primary-500 mb-2">Directions visuelles principales</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {(['twisty', 'editorial', 'sauge'] as PaletteKey[]).map((k) => {
            const p = PALETTES[k];
            if (!p) return null;
            const active = paletteKey === k;
            const meta = PALETTE_META[k] ?? { tag: '', tagColor: 'default', forces: '', faiblesses: '' };
            return (
              <button key={k} onClick={() => setPalette(k)}
                className={clsx(
                  'text-left p-4 rounded-xl border-2 transition-all',
                  active
                    ? 'border-accent bg-accent/5 shadow-sm'
                    : 'border-primary-200 dark:border-primary-800 hover:border-primary-400 dark:hover:border-primary-600',
                )}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{p.name}</p>
                    {meta.tag && (
                      <span className={clsx(
                        'inline-block mt-1 text-[10px] uppercase tracking-[0.08em] font-semibold px-1.5 py-0.5 rounded-md',
                        meta.tagColor === 'success' && 'bg-success/10 text-success',
                        meta.tagColor === 'accent' && 'bg-accent/10 text-accent',
                        meta.tagColor === 'warning' && 'bg-warning/10 text-warning',
                        meta.tagColor === 'default' && 'bg-primary-100 dark:bg-primary-800 text-primary-600',
                      )}>{meta.tag}</span>
                    )}
                  </div>
                  {active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-white font-semibold shrink-0">Active</span>}
                </div>
                <div className="flex gap-0.5 mb-2 rounded-md overflow-hidden">
                  <div className="flex-1 h-7" style={{ background: p.layout?.bgPage }} title="Fond" />
                  <div className="flex-1 h-7" style={{ background: p.layout?.bgSurface }} title="Card" />
                  <div className="flex-1 h-7" style={{ background: p.layout?.accent }} title="Accent" />
                  <div className="flex-1 h-7" style={{ background: p.scale[9] }} title="Texte" />
                </div>
                <div className="flex gap-0.5 mb-3 rounded-sm overflow-hidden">
                  {p.chartColors.map((c, i) => (
                    <div key={i} className="flex-1 h-3" style={{ background: c }} />
                  ))}
                </div>
                {meta.forces && (
                  <div className="space-y-1.5 text-[11px] leading-relaxed">
                    <div className="flex items-start gap-1.5">
                      <span className="text-success font-bold mt-0.5 shrink-0">+</span>
                      <span className="text-primary-700 dark:text-primary-300">{meta.forces}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-error font-bold mt-0.5 shrink-0">−</span>
                      <span className="text-primary-500">{meta.faiblesses}</span>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] uppercase tracking-[0.10em] font-semibold text-primary-500 mb-2">Autres palettes disponibles</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {(Object.keys(PALETTES) as PaletteKey[]).filter((k) => !['twisty', 'editorial', 'sauge'].includes(k)).map((k) => {
            const p = PALETTES[k];
            const active = paletteKey === k;
            return (
              <button key={k} onClick={() => setPalette(k)}
                className={clsx(
                  'text-left p-2.5 rounded-lg border transition-all',
                  active
                    ? 'border-accent bg-accent/5'
                    : 'border-primary-200 dark:border-primary-800 hover:border-primary-400',
                )}>
                <p className="text-xs font-semibold mb-1.5 truncate">{p.name}</p>
                <div className="flex gap-0.5 rounded-sm overflow-hidden">
                  {p.chartColors.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex-1 h-3" style={{ background: c }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Typographie" subtitle="Polices utilisées dans l'application">
        <div className="space-y-2 text-sm">
          <Row label="Sans-serif principal" hint="Corps de texte, navigation"><span className="font-sans">Exo 2</span></Row>
          <Row label="Display" hint="Titre Cockpit en page d'accueil"><span className="font-display text-2xl">Cockpit</span></Row>
          <Row label="Monospace" hint="Nombres, codes comptables"><span className="num">1 234 567</span></Row>
        </div>
      </Card>

      <Card title="Langue" subtitle="Interface utilisateur">
        <select className="input !w-auto" defaultValue="fr" disabled>
          <option value="fr">Français</option>
          <option value="en">English (bientôt)</option>
        </select>
      </Card>
    </div>
  );
}

// ─── SOCIÉTÉS ───────────────────────────────────────────────────────
function TabSocietes() {
  const { data: orgs = [] } = useCloudData(() => dataProvider.getOrganizations(), [], { initial: [], tag: 'organizations' });
  const { currentOrgId, setCurrentOrg } = useApp();
  const [openNew, setOpenNew] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', sector: 'Industrie', currency: 'XOF', coaSystem: 'SYSCOHADA', rccm: '', ifu: '', address: '', phone: '', email: '', website: '' });
  const [saving, setSaving] = useState(false);

  const openEdit = (org: any) => {
    setEditingOrg(org);
    setForm({
      name: org.name || '',
      sector: org.sector || 'Industrie',
      currency: org.currency || 'XOF',
      coaSystem: org.coaSystem || 'SYSCOHADA',
      rccm: org.rccm || '',
      ifu: org.ifu || '',
      address: org.address || '',
      phone: org.phone || '',
      email: org.email || '',
      website: org.website || '',
    });
  };

  const saveEdit = async () => {
    if (!editingOrg || !form.name.trim()) return;
    setSaving(true);
    try {
      await dataProvider.upsertOrganization({
        ...editingOrg,
        name: form.name.trim(),
        sector: form.sector,
        currency: form.currency,
        coaSystem: form.coaSystem as any,
        rccm: form.rccm || undefined,
        ifu: form.ifu || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
      } as any);
      invalidateCloudData('organizations');
      setEditingOrg(null);
    } finally { setSaving(false); }
  };

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const id = 'org-' + Date.now();
      await dataProvider.upsertOrganization({
        id, name: form.name.trim(), sector: form.sector, currency: form.currency,
        coaSystem: form.coaSystem as any,
        rccm: form.rccm || undefined, ifu: form.ifu || undefined, createdAt: Date.now(),
      });
      if (isSupabaseConfigured) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData.session?.user?.id;
          if (userId) {
            await (supabase as any)
              .from('fna_user_orgs')
              .upsert({ user_id: userId, org_id: id, role: 'admin' }, { onConflict: 'user_id,org_id' });
          }
        } catch (e) {
          console.warn('[Settings] fna_user_orgs upsert failed (non bloquant):', e);
        }
      }
      const year = new Date().getFullYear();
      await dataProvider.upsertFiscalYear({ id: `${id}-${year}`, orgId: id, year, startDate: `${year}-01-01`, endDate: `${year}-12-31`, closed: false });
      const monthLabels = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const periods = Array.from({ length: 12 }, (_, i) => ({
        id: `${id}-${year}-${String(i + 1).padStart(2, '0')}`, orgId: id, fiscalYearId: `${id}-${year}`,
        year, month: i + 1, label: `${monthLabels[i]} ${year}`, closed: false,
      }));
      await dataProvider.bulkUpsertPeriods(periods);
      invalidateCloudData('organizations');
      invalidateCloudData('fiscalYears');
      invalidateCloudData('periods');
      setOpenNew(false);
      setForm({ name: '', sector: 'Industrie', currency: 'XOF', coaSystem: 'SYSCOHADA', rccm: '', ifu: '', address: '', phone: '', email: '', website: '' });
      setCurrentOrg(id);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cette société ? Toutes les données associées seront effacées.')) return;
    await dataProvider.deleteOrganizationCascade(id);
    invalidateCloudData('organizations');
    invalidateCloudData('fiscalYears');
    invalidateCloudData('periods');
    invalidateCloudData('accounts');
    invalidateCloudData('gl');
    if (currentOrgId === id && orgs.length > 1) {
      const next = orgs.find((o: any) => o.id !== id);
      if (next) setCurrentOrg(next.id);
    }
  };

  const leaveOrg = async (id: string, name: string) => {
    if (!confirm(`Quitter la société "${name}" ? Vous n'y aurez plus accès. L'org reste pour les autres membres.`)) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        alert('Vous devez être connecté pour quitter une société.');
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('fna_user_orgs')
        .delete()
        .eq('user_id', userId)
        .eq('org_id', id);
      if (error) throw error;
      invalidateCloudData('organizations');
      if (currentOrgId === id) {
        const next = orgs.find((o: any) => o.id !== id);
        setCurrentOrg(next?.id ?? '');
      }
    } catch (e) {
      const msg = (e as Error).message ?? 'Erreur inconnue';
      alert(`Impossible de quitter la société : ${msg}`);
    }
  };

  return (
    <div className="space-y-4">
      <Card title={`Sociétés (${orgs.length})`} subtitle="Multi-sociétés, multi-sites, consolidation"
        action={<button className="btn-primary" onClick={() => setOpenNew(true)}><Plus className="w-4 h-4" /> Ajouter</button>}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((o: any) => (
            <div key={o.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-primary-200 dark:bg-primary-800 flex items-center justify-center">
                  <Building2 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{o.name}</p>
                  <p className="text-xs text-primary-500 mt-0.5">{o.sector} · {o.currency}</p>
                  {o.rccm && <p className="text-[10px] text-primary-400 mt-0.5 font-mono">RCCM : {o.rccm}</p>}
                  {o.ifu && <p className="text-[10px] text-primary-400 font-mono">IFU : {o.ifu}</p>}
                  <div className="mt-2 flex gap-1 items-center">
                    {currentOrgId === o.id
                      ? <Badge variant="success">Active</Badge>
                      : <button className="badge bg-primary-200 dark:bg-primary-800 hover:bg-primary-300 dark:hover:bg-primary-700" onClick={() => setCurrentOrg(o.id)}>Sélectionner</button>}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    className="btn-ghost !p-1.5 text-primary-500 hover:text-primary-900 dark:hover:text-primary-100"
                    onClick={() => openEdit(o)}
                    title={o.role === 'admin' || !o.role ? 'Modifier' : `Lecture seule (${o.role})`}
                    disabled={o.role && o.role !== 'admin'}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {o.role === 'admin' || !o.role ? (
                    <button
                      className="btn-ghost !p-1.5 text-primary-500 hover:text-error hover:bg-error/10"
                      onClick={() => remove(o.id)}
                      title="Supprimer la société (toutes données effacées)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      className="btn-ghost !p-1.5 text-primary-500 hover:text-warning hover:bg-warning/10"
                      onClick={() => leaveOrg(o.id, o.name)}
                      title="Quitter la société (vous n'y aurez plus accès)"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={!!editingOrg} onClose={() => setEditingOrg(null)} title={`Modifier ${editingOrg?.name ?? ''}`} subtitle="Identité, fiscalité et coordonnées de la société"
        footer={<>
          <button className="btn-outline" onClick={() => setEditingOrg(null)}>Annuler</button>
          <button className="btn-primary" onClick={saveEdit} disabled={saving || !form.name.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>}>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Identité</p>
            <Field label="Raison sociale *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ex : SOCIÉTÉ ALPHA SA" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Secteur" value={form.sector} options={SECTORS} onChange={(v) => setForm({ ...form, sector: v })} />
            <SelectField label="Devise" value={form.currency} options={CURRENCIES} onChange={(v) => setForm({ ...form, currency: v })} />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <SelectField
              label="Plan comptable"
              value={form.coaSystem}
              options={COA_SYSTEMS}
              onChange={(v) => setForm({ ...form, coaSystem: v })}
            />
            <p className="text-[10px] text-primary-500 -mt-2">
              SYSCOHADA (Afrique Ouest, défaut) · PCG_FR (Plan comptable français) · IFRS / US_GAAP (référentiels internationaux).
              Détermine la logique de rapprochement tiers et d'agrégation par classe.
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2 mt-2">Fiscalité</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="RCCM" value={form.rccm} onChange={(v) => setForm({ ...form, rccm: v })} placeholder="CI-ABJ-YYYY-B-XXXX" />
              <Field label="IFU / NIF" value={form.ifu} onChange={(v) => setForm({ ...form, ifu: v })} placeholder="Numéro fiscal" />
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2 mt-2">Coordonnées</p>
            <Field label="Adresse" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Adresse postale complète" />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Téléphone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+225 XX XX XX XX XX" />
              <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="contact@societe.com" />
            </div>
            <Field label="Site web" value={form.website} onChange={(v) => setForm({ ...form, website: v })} placeholder="https://www.societe.com" />
          </div>
        </div>
      </Modal>

      <Modal open={openNew} onClose={() => setOpenNew(false)} title="Ajouter une société" subtitle="Création d'un nouveau tenant"
        footer={<>
          <button className="btn-outline" onClick={() => setOpenNew(false)}>Annuler</button>
          <button className="btn-primary" onClick={create} disabled={saving || !form.name.trim()}>{saving ? 'Création…' : 'Créer'}</button>
        </>}>
        <div className="space-y-4">
          <Field label="Raison sociale *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ex : SOCIÉTÉ NOUVELLE SA" />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Secteur" value={form.sector} options={SECTORS} onChange={(v) => setForm({ ...form, sector: v })} />
            <SelectField label="Devise" value={form.currency} options={CURRENCIES} onChange={(v) => setForm({ ...form, currency: v })} />
          </div>
          <SelectField
            label="Plan comptable"
            value={form.coaSystem}
            options={COA_SYSTEMS}
            onChange={(v) => setForm({ ...form, coaSystem: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="RCCM" value={form.rccm} onChange={(v) => setForm({ ...form, rccm: v })} placeholder="CI-ABJ-YYYY-B-XXXX" />
            <Field label="IFU / NIF" value={form.ifu} onChange={(v) => setForm({ ...form, ifu: v })} placeholder="Numéro fiscal" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── EXERCICES ──────────────────────────────────────────────────────
function TabExercices() {
  const { currentOrgId, currentYear, setCurrentYear } = useApp();
  const { data: orgs = [] } = useCloudData(() => dataProvider.getOrganizations(), [], { initial: [], tag: 'organizations' });
  const currentOrg = orgs.find((o: any) => o.id === currentOrgId);

  const { data: fiscalYears = [] } = useCloudData(
    async () => {
      if (!currentOrgId) return [] as any[];
      const fys = await dataProvider.getFiscalYears(currentOrgId);
      return [...fys].sort((a, b) => a.year - b.year);
    },
    [currentOrgId],
    { initial: [], tag: 'fiscalYears' },
  );

  const { data: periods = [] } = useCloudData(
    () => currentOrgId ? dataProvider.getPeriods(currentOrgId) : Promise.resolve([] as any[]),
    [currentOrgId],
    { initial: [], tag: 'periods' },
  );

  const periodCountByYear = (year: number) => periods.filter((p: any) => p.year === year && p.month >= 1).length;

  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ year: new Date().getFullYear(), startDate: '', endDate: '', createPeriods: true });
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    const y = new Date().getFullYear();
    setForm({ year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31`, createPeriods: true });
  };

  const openCreate = () => { resetForm(); setOpenNew(true); };

  const create = async () => {
    if (!currentOrgId) { toast.warning('Société requise', 'Sélectionnez une société dans le header avant de créer un exercice'); return; }
    if (fiscalYears.some((fy: any) => fy.year === form.year)) {
      toast.warning('Exercice existant', `L'exercice ${form.year} existe déjà pour cette société`); return;
    }
    setSaving(true);
    try {
      const fyId = `${currentOrgId}-${form.year}`;
      await dataProvider.upsertFiscalYear({
        id: fyId, orgId: currentOrgId, year: form.year,
        startDate: form.startDate, endDate: form.endDate, closed: false,
      });
      if (form.createPeriods) {
        const monthLabels = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
        const newPeriods = Array.from({ length: 12 }, (_, i) => ({
          id: `${currentOrgId}-${form.year}-${String(i + 1).padStart(2, '0')}`,
          orgId: currentOrgId, fiscalYearId: fyId, year: form.year, month: i + 1,
          label: `${monthLabels[i]} ${form.year}`, closed: false,
        }));
        await dataProvider.bulkUpsertPeriods(newPeriods);
      }
      invalidateCloudData('fiscalYears');
      invalidateCloudData('periods');
      setOpenNew(false);
      setCurrentYear(form.year);
    } finally { setSaving(false); }
  };

  const toggleClosed = async (fy: any) => {
    await dataProvider.setFiscalYearClosed(fy, !fy.closed);
    invalidateCloudData('fiscalYears');
    invalidateCloudData('periods');
  };

  const remove = async (fy: any) => {
    const entries = await dataProvider.getGLEntries({ orgId: fy.orgId });
    const yearEntries = entries.filter((e: any) => {
      const y = parseInt(e.date.substring(0, 4), 10);
      return y === fy.year;
    });
    const msg = yearEntries.length > 0
      ? `Supprimer l'exercice ${fy.year} ET ses ${yearEntries.length.toLocaleString('fr-FR')} écritures ?`
      : `Supprimer l'exercice ${fy.year} ?`;
    if (!confirm(msg)) return;

    await dataProvider.deleteFiscalYearCascade(fy);
    invalidateCloudData('fiscalYears');
    invalidateCloudData('periods');
    invalidateCloudData('gl');
    if (currentYear === fy.year) {
      const remaining = fiscalYears.filter((x: any) => x.id !== fy.id);
      if (remaining.length) setCurrentYear(remaining[remaining.length - 1].year);
    }
  };

  const activate = (fy: any) => setCurrentYear(fy.year);

  return (
    <div className="space-y-4">
      <Card
        title={`Exercices — ${currentOrg?.name ?? 'Aucune société sélectionnée'}`}
        subtitle="Créer, activer, clôturer ou supprimer les exercices comptables de la société active"
        action={
          <button className="btn-primary" onClick={openCreate} disabled={!currentOrgId}>
            <Plus className="w-4 h-4" /> Nouvel exercice
          </button>
        }
      >
        {!currentOrgId && (
          <p className="text-sm text-primary-500 italic py-6 text-center">
            Sélectionnez d'abord une société (menu en haut de la page ou onglet Sociétés).
          </p>
        )}

        {currentOrgId && fiscalYears.length === 0 && (
          <div className="py-10 text-center">
            <Calendar className="w-10 h-10 mx-auto text-primary-400 mb-3" />
            <p className="text-sm text-primary-500 mb-1">Aucun exercice défini pour cette société.</p>
            <p className="text-xs text-primary-400">Créez-en un pour commencer à importer des écritures.</p>
          </div>
        )}

        {currentOrgId && fiscalYears.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
                <tr>
                  <th className="text-left py-2 px-3">Année</th>
                  <th className="text-left py-2 px-3">Période</th>
                  <th className="text-right py-2 px-3">Mois créés</th>
                  <th className="text-center py-2 px-3">Statut</th>
                  <th className="text-center py-2 px-3">Actif</th>
                  <th className="text-right py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                {fiscalYears.map((fy: any) => {
                  const isActive = currentYear === fy.year;
                  const count = periodCountByYear(fy.year);
                  return (
                    <tr key={fy.id} className={isActive ? 'bg-primary-100/60 dark:bg-primary-900/60' : ''}>
                      <td className="py-2.5 px-3 num font-semibold">{fy.year}</td>
                      <td className="py-2.5 px-3 text-xs text-primary-500 font-mono">{fy.startDate} → {fy.endDate}</td>
                      <td className="py-2.5 px-3 text-right num">{count} / 12</td>
                      <td className="py-2.5 px-3 text-center">
                        {fy.closed
                          ? <Badge variant="warning"><Lock className="w-3 h-3" /> Clôturé</Badge>
                          : <Badge variant="success"><Unlock className="w-3 h-3" /> Ouvert</Badge>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isActive
                          ? <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Actif</Badge>
                          : <button className="badge bg-primary-200 dark:bg-primary-800 hover:bg-primary-300 dark:hover:bg-primary-700" onClick={() => activate(fy)}>Activer</button>}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            className="btn-ghost !p-1.5"
                            onClick={() => toggleClosed(fy)}
                            title={fy.closed ? "Rouvrir l'exercice" : "Clôturer l'exercice"}
                          >
                            {fy.closed ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                          <button
                            className="btn-ghost !p-1.5 text-primary-500 hover:text-error hover:bg-error/10"
                            onClick={() => remove(fy)}
                            title="Supprimer cet exercice et toutes ses écritures"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-primary-500 italic mt-4">
          L'exercice <strong>actif</strong> est celui utilisé par tous les écrans (Dashboard, États, Ratios, Imports…). Vous pouvez aussi le changer rapidement depuis le sélecteur en haut à droite de la barre de navigation.
        </p>
      </Card>

      <Modal
        open={openNew}
        onClose={() => setOpenNew(false)}
        title="Nouvel exercice comptable"
        subtitle={currentOrg?.name}
        footer={<>
          <button className="btn-outline" onClick={() => setOpenNew(false)}>Annuler</button>
          <button
            className="btn-primary"
            onClick={create}
            disabled={saving || !form.startDate || !form.endDate || !form.year}
          >
            {saving ? 'Création…' : 'Créer l\'exercice'}
          </button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-primary-500 font-medium block mb-1">Année *</label>
            <input
              type="number" min={1990} max={2100}
              className="input"
              value={form.year}
              onChange={(e) => {
                const y = parseInt(e.target.value, 10) || new Date().getFullYear();
                setForm({ ...form, year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31` });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-primary-500 font-medium block mb-1">Date de début *</label>
              <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-primary-500 font-medium block mb-1">Date de fin *</label>
              <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input type="checkbox" className="mt-1" checked={form.createPeriods} onChange={(e) => setForm({ ...form, createPeriods: e.target.checked })} />
            <span className="text-xs">
              Créer automatiquement les <strong>12 périodes mensuelles</strong> (Janvier → Décembre). À décocher si votre exercice est non calendaire : les périodes seront créées automatiquement lors de l'import du Grand Livre.
            </span>
          </label>
        </div>
      </Modal>
    </div>
  );
}

// ─── RATIOS DE RÉFÉRENCE ────────────────────────────────────────────
function TabRatios() {
  const targets = useSettings((s) => s.ratioTargets);
  const setTarget = useSettings((s) => s.setRatioTarget);
  const reset = useSettings((s) => s.resetRatioTargets);

  const families = ['Rentabilité', 'Liquidité', 'Structure', 'Activité'];
  const byCode = Object.values(targets);
  const catOf = (code: string) => {
    if (['MB','TVA','EBE','TRE','TRN','ROE','ROA'].includes(code)) return 'Rentabilité';
    if (['LG','LR','LI'].includes(code)) return 'Liquidité';
    if (['AF','END','CAP_REMB'].includes(code)) return 'Structure';
    return 'Activité';
  };

  return (
    <Card title="Ratios de référence" subtitle="Cibles et seuils comparés aux résultats calculés"
      action={<button className="btn-outline" onClick={() => { if (confirm('Restaurer les cibles par défaut ?')) reset(); }}>Restaurer défaut</button>}>
      <p className="text-xs text-primary-500 mb-4">
        OK <strong>OK</strong> : le ratio atteint ou dépasse la cible &nbsp;·&nbsp;
        -- <strong>Vigilance</strong> : ≥ seuil de vigilance × cible &nbsp;·&nbsp;
        !! <strong>Alerte</strong> : en dessous du seuil d'alerte
      </p>

      {families.map((fam) => {
        const list = byCode.filter((r) => catOf(r.code) === fam);
        return (
          <div key={fam} className="mb-6 last:mb-0">
            <p className="text-xs uppercase tracking-wider font-semibold text-primary-500 mb-2">{fam}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700">
                  <tr>
                    <th className="text-left py-2 px-3">Code</th>
                    <th className="text-left py-2 px-3">Libellé</th>
                    <th className="text-right py-2 px-3">Cible</th>
                    <th className="text-left py-2 px-3">Unité</th>
                    <th className="text-right py-2 px-3">Seuil vigilance (%)</th>
                    <th className="text-right py-2 px-3">Seuil alerte (%)</th>
                    <th className="text-center py-2 px-3">Inversé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                  {list.map((r) => (
                    <tr key={r.code}>
                      <td className="py-2 px-3 num font-mono text-xs">{r.code}</td>
                      <td className="py-2 px-3 text-xs">{r.label}</td>
                      <td className="py-2 px-3 text-right">
                        <input type="number" step={r.unit === '%' || r.unit === 'j' ? 1 : 0.1}
                          className="input !py-1 !w-24 text-right num text-xs"
                          value={r.target}
                          onChange={(e) => setTarget(r.code, { target: Number(e.target.value) })} />
                      </td>
                      <td className="py-2 px-3 text-xs text-primary-500">{r.unit}</td>
                      <td className="py-2 px-3 text-right">
                        <input type="number" step={5}
                          className="input !py-1 !w-20 text-right num text-xs"
                          value={r.warnThreshold}
                          onChange={(e) => setTarget(r.code, { warnThreshold: Number(e.target.value) })} />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input type="number" step={5}
                          className="input !py-1 !w-20 text-right num text-xs"
                          value={r.alertThreshold}
                          onChange={(e) => setTarget(r.code, { alertThreshold: Number(e.target.value) })} />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input type="checkbox" checked={r.inverse ?? false}
                          onChange={(e) => setTarget(r.code, { inverse: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="mt-4 p-3 bg-primary-200/30 dark:bg-primary-800/30 rounded-lg text-xs text-primary-600 dark:text-primary-400">
        « Inversé » : cocher si une valeur plus basse est meilleure (ex : DSO, endettement). Les modifications sont appliquées immédiatement sur la page Ratios.
      </div>
    </Card>
  );
}

// ─── IA & Proph3t ───────────────────────────────────────────────────
function TabAI() {
  const [cfg, setCfg] = useState(loadAIConfig());
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const refresh = async () => {
    setTesting(true);
    setStatus(await detectAIStatus());
    setTesting(false);
  };

  useEffect(() => { refresh(); }, []);

  const update = (patch: Partial<AIConfig>) => {
    const next = saveAIConfig(patch);
    setCfg(next);
  };

  return (
    <div className="space-y-4">
      <Card title="Statut IA" subtitle={`Provider actuel : ${cfg.provider === 'ollama' ? 'Ollama (local)' : cfg.provider === 'openai' ? 'Cloud (OpenAI-compatible)' : 'Aucun'}`}>
        <div className="flex items-center gap-3">
          {testing ? (
            <Badge variant="info">Test en cours…</Badge>
          ) : status?.available ? (
            <Badge variant="low">✓ Connecté</Badge>
          ) : (
            <Badge variant="critical">✗ Non disponible</Badge>
          )}
          <button className="btn-outline !py-1 text-xs" onClick={refresh}>Tester la connexion</button>
        </div>
        {status && !status.available && (
          <p className="text-xs text-error mt-2">{status.errorMessage}</p>
        )}
        {status && status.available && status.models.length > 0 && (
          <div className="mt-3">
            <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Modèle sélectionné</label>
            <select className="input" value={cfg.provider === 'ollama' ? cfg.ollamaModel : cfg.openaiModel}
              onChange={(e) => update(cfg.provider === 'ollama' ? { ollamaModel: e.target.value } : { openaiModel: e.target.value })}>
              {status.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
      </Card>

      <Card title="Choix du provider" subtitle="Local pour la confidentialité, cloud pour la production déployée">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <button onClick={() => update({ provider: 'ollama' })} className={clsx('p-4 rounded-xl border-2 text-left transition-all',
            cfg.provider === 'ollama' ? 'border-accent bg-accent/5' : 'border-primary-200 dark:border-primary-700 hover:border-primary-400')}>
            <p className="font-semibold mb-1">🖥 Ollama (local)</p>
            <p className="text-xs text-primary-500 leading-relaxed">LLM hébergé sur votre machine. Aucune donnée ne quitte votre poste. Llama 3 / Mistral / Phi. Ne fonctionne pas en production déployée.</p>
          </button>
          <button onClick={() => update({ provider: 'openai' })} className={clsx('p-4 rounded-xl border-2 text-left transition-all',
            cfg.provider === 'openai' ? 'border-accent bg-accent/5' : 'border-primary-200 dark:border-primary-700 hover:border-primary-400')}>
            <p className="font-semibold mb-1">☁ Cloud (OpenAI-compatible)</p>
            <p className="text-xs text-primary-500 leading-relaxed">API compatible OpenAI : OpenAI, Mistral, Groq, Together, Anthropic via proxy. Fonctionne en production déployée. Nécessite une clé API.</p>
          </button>
        </div>

        {cfg.provider === 'ollama' && (
          <div className="space-y-3 pt-3 border-t border-primary-200 dark:border-primary-700">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">URL Ollama</label>
              <input className="input font-mono text-xs" value={cfg.ollamaUrl} onChange={(e) => update({ ollamaUrl: e.target.value })} placeholder="http://localhost:11434" />
              <p className="text-[10px] text-primary-400 mt-1">Installer Ollama : <a href="https://ollama.ai/download" target="_blank" rel="noreferrer" className="text-accent underline">ollama.ai/download</a> · Puis : <code className="bg-primary-100 dark:bg-primary-800 px-1 rounded">ollama pull llama3.1</code></p>
            </div>
          </div>
        )}

        {cfg.provider === 'openai' && (
          <div className="space-y-3 pt-3 border-t border-primary-200 dark:border-primary-700">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-2">Provider preset</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                {AI_PRESETS.map((p) => {
                  const active = cfg.openaiBaseUrl === p.baseUrl;
                  return (
                    <button key={p.id} onClick={() => update({ openaiBaseUrl: p.baseUrl, openaiModel: p.suggestedModel })}
                      className={clsx('text-left p-2.5 rounded-lg border-2 transition-all',
                        active ? 'border-accent bg-accent/5' : 'border-primary-200 dark:border-primary-700 hover:border-primary-400')}>
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="font-semibold text-sm">{p.name}</p>
                        <a href={p.signupUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-accent underline">obtenir clé →</a>
                      </div>
                      <p className="text-[10px] text-primary-500 leading-snug">{p.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Base URL</label>
              <input className="input font-mono text-xs" value={cfg.openaiBaseUrl} onChange={(e) => update({ openaiBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Clé API (stockée localement, jamais envoyée à un autre serveur)</label>
              <input type="password" className="input font-mono text-xs" value={cfg.openaiApiKey} onChange={(e) => update({ openaiApiKey: e.target.value })} placeholder="sk-..." />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Modèle</label>
              <input className="input font-mono text-xs" value={cfg.openaiModel} onChange={(e) => update({ openaiModel: e.target.value })} placeholder="gpt-4o-mini" />
            </div>
          </div>
        )}

        <div className="pt-3 mt-3 border-t border-primary-200 dark:border-primary-700">
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Température (0 = factuel, 1 = créatif)</label>
          <input type="range" min={0} max={1} step={0.1} value={cfg.temperature} onChange={(e) => update({ temperature: Number(e.target.value) })} className="w-full" />
          <p className="text-[10px] text-primary-500 num">{cfg.temperature.toFixed(1)}</p>
        </div>
      </Card>

      <Card padded>
        <div className="flex items-start gap-3">
          <Cloud className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold mb-1">Confidentialité</p>
            <p className="text-xs text-primary-500 leading-relaxed">
              <strong>Mode Ollama</strong> : aucune donnée ne quitte votre machine. Idéal pour les données sensibles. <br/>
              <strong>Mode Cloud</strong> : les questions et le contexte financier (KPIs, ratios) sont envoyés au provider choisi. Le contexte reste minimal — aucun GL brut n'est transmis. Les clés API sont stockées localement (localStorage).
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
