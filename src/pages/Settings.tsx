import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Building2, Calendar, CheckCircle2, Cloud, Database, Download, Lock, Pencil, Unlock, Moon, Plus, Settings as SettingsIcon, Sun, Target, Trash2, Upload, Users } from 'lucide-react';
import { AdminGate } from '../components/auth/AdminGate';
import { lockAdmin } from '../lib/adminAuth';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmailPreviewModal } from '../components/ui/EmailPreviewModal';
import { buildInvitationEmail, buildReviewEmail, buildReportEmail } from '../lib/emailTemplates';
import {
  loadConfig as loadAIConfig, saveConfig as saveAIConfig, detectStatus as detectAIStatus,
  PROVIDER_PRESETS as AI_PRESETS, type AIConfig, type AIStatus,
} from '../lib/aiClient';
import { TabSwitch } from '../components/ui/TabSwitch';
import { toast } from '../components/ui/Toast';
import { useApp } from '../store/app';
import { useSettings } from '../store/settings';
import { PALETTES, PaletteKey, useTheme } from '../store/theme';
import { db } from '../db/schema';
import { ensureSeeded } from '../db/seed';

type Tab = 'apparence' | 'societes' | 'exercices' | 'ratios' | 'donnees' | 'users' | 'ia' | 'emails' | 'integrations';

const SECTORS = ['Industrie', 'Commerce', 'BTP', 'Services', 'Agriculture', 'Santé', 'Banque', 'Microfinance', 'Éducation', 'Hôtellerie', 'Mines', 'Immobilier', 'Transport', 'Télécoms'];
const CURRENCIES = ['XOF', 'XAF', 'EUR', 'USD', 'GHS', 'NGN'];

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
        { key: 'integrations', label: 'Intégrations' },
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

      <Card title="Palette de couleurs" subtitle="Couleurs appliquées aux graphiques, tables, KPIs et dashboards de toute l'application">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(PALETTES) as PaletteKey[]).map((k) => {
            const p = PALETTES[k];
            const active = paletteKey === k;
            return (
              <button key={k} onClick={() => setPalette(k)}
                className={`text-left p-4 rounded-lg border-2 transition ${active ? 'border-primary-900 dark:border-primary-100 bg-primary-200/30 dark:bg-primary-800/30' : 'border-primary-200 dark:border-primary-800 hover:border-primary-400 dark:hover:border-primary-600'}`}>
                <div className="flex items-start justify-between mb-2">
                  <p className="font-semibold text-sm">{p.name}</p>
                  {active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900 font-semibold">Active</span>}
                </div>
                <div className="flex gap-0.5 mb-2">
                  {p.chartColors.map((c, i) => (
                    <div key={i} className="flex-1 h-6 first:rounded-l last:rounded-r" style={{ background: c }} />
                  ))}
                </div>
                <div className="flex gap-0.5">
                  {p.scale.map((c, i) => (
                    <div key={i} className="flex-1 h-3 first:rounded-l last:rounded-r" style={{ background: c }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-primary-500 mt-4">
          Le changement est instantané sur tous les graphiques (camembert, barres, courbes), les en-têtes de tables, et les accents primaires.
        </p>
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
  const orgs = useLiveQuery(() => db.organizations.toArray(), [], []) ?? [];
  const { currentOrgId, setCurrentOrg } = useApp();
  const [openNew, setOpenNew] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', sector: 'Industrie', currency: 'XOF', rccm: '', ifu: '', address: '', phone: '', email: '', website: '' });
  const [saving, setSaving] = useState(false);

  const openEdit = (org: any) => {
    setEditingOrg(org);
    setForm({
      name: org.name || '',
      sector: org.sector || 'Industrie',
      currency: org.currency || 'XOF',
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
      await db.organizations.update(editingOrg.id, {
        name: form.name.trim(),
        sector: form.sector,
        currency: form.currency,
        rccm: form.rccm || undefined,
        ifu: form.ifu || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
      } as any);
      setEditingOrg(null);
    } finally { setSaving(false); }
  };

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const id = 'org-' + Date.now();
      await db.organizations.add({
        id, name: form.name.trim(), sector: form.sector, currency: form.currency,
        rccm: form.rccm || undefined, ifu: form.ifu || undefined, createdAt: Date.now(),
      });
      const year = new Date().getFullYear();
      await db.fiscalYears.add({ id: `${id}-${year}`, orgId: id, year, startDate: `${year}-01-01`, endDate: `${year}-12-31`, closed: false });
      const monthLabels = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const periods = Array.from({ length: 12 }, (_, i) => ({
        id: `${id}-${year}-${String(i + 1).padStart(2, '0')}`, orgId: id, fiscalYearId: `${id}-${year}`,
        year, month: i + 1, label: `${monthLabels[i]} ${year}`, closed: false,
      }));
      await db.periods.bulkPut(periods);
      setOpenNew(false);
      setForm({ name: '', sector: 'Industrie', currency: 'XOF', rccm: '', ifu: '', address: '', phone: '', email: '', website: '' });
      setCurrentOrg(id);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cette société ? Toutes les données associées seront effacées.')) return;
    await db.transaction('rw', [db.organizations, db.fiscalYears, db.periods, db.accounts, db.gl, db.imports, db.budgets, db.mappings], async () => {
      await db.gl.where('orgId').equals(id).delete();
      await db.imports.where('orgId').equals(id).delete();
      await db.budgets.where('orgId').equals(id).delete();
      await db.accounts.where('orgId').equals(id).delete();
      await db.mappings.where('orgId').equals(id).delete();
      await db.periods.where('orgId').equals(id).delete();
      await db.fiscalYears.where('orgId').equals(id).delete();
      await db.organizations.delete(id);
    });
    if (currentOrgId === id && orgs.length > 1) {
      const next = orgs.find((o: any) => o.id !== id);
      if (next) setCurrentOrg(next.id);
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
                  <button className="btn-ghost !p-1.5 text-primary-500 hover:text-primary-900 dark:hover:text-primary-100" onClick={() => openEdit(o)} title="Modifier">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button className="btn-ghost !p-1.5 text-primary-500 hover:text-error hover:bg-error/10" onClick={() => remove(o.id)} title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Modale d'édition */}
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
  const orgs = useLiveQuery(() => db.organizations.toArray(), [], []) ?? [];
  const currentOrg = orgs.find((o: any) => o.id === currentOrgId);

  const fiscalYears = useLiveQuery(
    () => (currentOrgId ? db.fiscalYears.where('orgId').equals(currentOrgId).sortBy('year') : Promise.resolve([] as any[])),
    [currentOrgId], [] as any[],
  ) ?? [];

  const periods = useLiveQuery(
    () => (currentOrgId ? db.periods.where('orgId').equals(currentOrgId).toArray() : Promise.resolve([] as any[])),
    [currentOrgId], [] as any[],
  ) ?? [];

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
      await db.fiscalYears.add({
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
        await db.periods.bulkPut(newPeriods);
      }
      setOpenNew(false);
      setCurrentYear(form.year);
    } finally { setSaving(false); }
  };

  const toggleClosed = async (fy: any) => {
    await db.fiscalYears.update(fy.id, { closed: !fy.closed });
    await db.periods.where('fiscalYearId').equals(fy.id).modify({ closed: !fy.closed });
  };

  const remove = async (fy: any) => {
    const entries = await db.gl.where('orgId').equals(fy.orgId).toArray();
    const yearEntries = entries.filter((e: any) => {
      const y = parseInt(e.date.substring(0, 4), 10);
      return y === fy.year;
    });
    const msg = yearEntries.length > 0
      ? `Supprimer l'exercice ${fy.year} ET ses ${yearEntries.length.toLocaleString('fr-FR')} écritures ?`
      : `Supprimer l'exercice ${fy.year} ?`;
    if (!confirm(msg)) return;

    await db.transaction('rw', [db.fiscalYears, db.periods, db.gl], async () => {
      // 1) supprimer les écritures de l'année
      const ids = yearEntries.map((e: any) => e.id!).filter(Boolean);
      if (ids.length) await db.gl.bulkDelete(ids);
      // 2) supprimer les périodes de cet exercice
      await db.periods.where('fiscalYearId').equals(fy.id).delete();
      // 3) supprimer l'exercice
      await db.fiscalYears.delete(fy.id);
    });
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

// ─── DONNÉES ────────────────────────────────────────────────────────
function TabDonnees() {
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const stats = useLiveQuery(async () => ({
    orgs: await db.organizations.count(),
    periods: await db.periods.count(),
    gl: await db.gl.count(),
    accounts: await db.accounts.count(),
    imports: await db.imports.count(),
    budgets: await db.budgets.count(),
    templates: await db.templates.count(),
  }), [], { orgs: 0, periods: 0, gl: 0, accounts: 0, imports: 0, budgets: 0, templates: 0 });

  const exportDB = async () => {
    const data = {
      version: 2, exportedAt: new Date().toISOString(),
      organizations: await db.organizations.toArray(),
      fiscalYears: await db.fiscalYears.toArray(),
      periods: await db.periods.toArray(),
      accounts: await db.accounts.toArray(),
      gl: await db.gl.toArray(),
      imports: await db.imports.toArray(),
      budgets: await db.budgets.toArray(),
      mappings: await db.mappings.toArray(),
      reports: await db.reports.toArray(),
      templates: await db.templates.toArray(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cockpit-backup-${new Date().toISOString().substring(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importDB = async (file: File) => {
    if (!confirm('Importer remplacera les données existantes. Continuer ?')) return;
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      await db.transaction('rw', [db.organizations, db.fiscalYears, db.periods, db.accounts, db.gl, db.imports, db.budgets, db.mappings, db.reports, db.templates], async () => {
        await Promise.all([db.organizations, db.fiscalYears, db.periods, db.accounts, db.gl, db.imports, db.budgets, db.mappings, db.reports, db.templates].map((t) => t.clear()));
        if (data.organizations) await db.organizations.bulkAdd(data.organizations);
        if (data.fiscalYears) await db.fiscalYears.bulkAdd(data.fiscalYears);
        if (data.periods) await db.periods.bulkAdd(data.periods);
        if (data.accounts) await db.accounts.bulkAdd(data.accounts);
        if (data.gl) await db.gl.bulkAdd(data.gl.map(({ id: _i, ...r }: any) => r));
        if (data.imports) await db.imports.bulkAdd(data.imports.map(({ id: _i, ...r }: any) => r));
        if (data.budgets) await db.budgets.bulkAdd(data.budgets.map(({ id: _i, ...r }: any) => r));
        if (data.mappings) await db.mappings.bulkAdd(data.mappings);
        if (data.reports) await db.reports.bulkAdd(data.reports.map(({ id: _i, ...r }: any) => r));
        if (data.templates) await db.templates.bulkAdd(data.templates.map(({ id: _i, ...r }: any) => r));
      });
      toast.success('Import terminé', 'Sauvegarde restaurée avec succès');
    } catch (e: any) { toast.error("Erreur d'import", e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card title="Données locales" subtitle="IndexedDB — stockage navigateur">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Stat label="Sociétés" value={stats.orgs} />
          <Stat label="Périodes" value={stats.periods} />
          <Stat label="Écritures GL" value={stats.gl} />
          <Stat label="Comptes" value={stats.accounts} />
          <Stat label="Imports" value={stats.imports} />
          <Stat label="Lignes budget" value={stats.budgets} />
          <Stat label="Modèles rapport" value={stats.templates} />
        </div>
        <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-primary-200 dark:border-primary-800">
          <button className="btn-outline" onClick={exportDB} disabled={busy}><Download className="w-4 h-4" /> Exporter sauvegarde (JSON)</button>
          <label className="btn-outline cursor-pointer">
            <Upload className="w-4 h-4" /> Importer sauvegarde
            <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importDB(e.target.files[0])} />
          </label>
          <button className="btn-outline" onClick={async () => { if (!confirm('Regénérer les données de démonstration ?')) return; setBusy(true); await ensureSeeded(); setBusy(false); toast.success('Données régénérées', 'Démo prête à être consultée'); }}>
            <Database className="w-4 h-4" /> Regénérer données démo
          </button>
        </div>
      </Card>

      <Card title="Zone dangereuse" subtitle="Opérations irréversibles">
        <Row label="Réinitialiser toutes les données" hint="Supprime définitivement toutes les sociétés, écritures, budgets et rapports">
          <button className="btn text-error border border-error/30 hover:bg-error/10" onClick={() => setResetOpen(true)}>
            <Trash2 className="w-4 h-4" /> Réinitialiser
          </button>
        </Row>
      </Card>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Réinitialiser toutes les données ?" subtitle="Cette action est irréversible"
        footer={<>
          <button className="btn-outline" onClick={() => setResetOpen(false)}>Annuler</button>
          <button className="btn text-primary-50 bg-error hover:bg-error/90" onClick={async () => { setBusy(true); await db.delete(); location.reload(); }} disabled={busy}>
            {busy ? 'Suppression…' : 'Confirmer la suppression'}
          </button>
        </>}>
        <div className="flex items-start gap-3 p-4 bg-error/10 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-error">Toutes les données locales seront effacées.</p>
            <p className="text-xs text-primary-500 mt-2">L'application rechargera et regénérera les données de démonstration.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── UTILISATEURS ──────────────────────────────────────────────────
// ─── UTILISATEURS & RÔLES ──────────────────────────────────────────
// Gestion complète : CRUD utilisateurs + rôles + permissions par module.
// Stockage local (localStorage) en mode dev. En production avec Supabase Auth,
// les users sont créés via signup et la table fna_user_orgs lie user→org→role.

type AppRole = 'admin' | 'daf' | 'controller' | 'accountant' | 'dg' | 'auditor' | 'viewer' | 'custom';
const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrateur',
  daf: 'Directeur Financier (DAF)',
  controller: 'Contrôleur de gestion',
  accountant: 'Comptable',
  dg: 'Direction Générale',
  auditor: 'Auditeur',
  viewer: 'Lecture seule',
  custom: 'Personnalisé',
};
const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: 'Accès total — gestion utilisateurs, paramètres, données.',
  daf: 'Pilotage financier complet : rapports, budget, ratios, clôture.',
  controller: 'Contrôle de gestion : budgets, écarts, analytique, prévisions.',
  accountant: 'Saisie GL, rapprochements, lettrage, justifications de clôture.',
  dg: 'Vue exécutive : KPIs, board pack, comité, MD&A. Pas de modification.',
  auditor: 'Audit trail, contrôles SYSCOHADA, anomalies. Lecture étendue + commentaires.',
  viewer: 'Lecture seule sur les dashboards et rapports publiés.',
  custom: 'Permissions personnalisées par module.',
};

interface AppUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  orgIds: string[];
  active: boolean;
  createdAt: number;
  lastLoginAt?: number;
  customPermissions?: Record<string, boolean>;
}

const USERS_KEY = 'cockpit-users';
function loadUsers(): AppUser[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]'); } catch { return []; }
}
function saveUsers(users: AppUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function TabUsers() {
  const [users, setUsers] = useState<AppUser[]>(() => loadUsers());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [invitePreview, setInvitePreview] = useState<{ user: AppUser; orgs: { id: string; name: string }[] } | null>(null);
  const orgs = useLiveQuery(() => db.organizations.toArray(), [], []) ?? [];

  const handleSave = (user: AppUser, sendInvite: boolean) => {
    const existing = users.findIndex((u) => u.id === user.id);
    const isNew = existing < 0;
    const next = isNew
      ? [...users, user]
      : users.map((u, i) => (i === existing ? user : u));
    setUsers(next);
    saveUsers(next);
    setModalOpen(false);
    setEditing(null);

    if (isNew && sendInvite) {
      // Affiche le preview de l'invitation HTML que l'admin peut envoyer
      setInvitePreview({ user, orgs: orgs.filter((o) => user.orgIds.includes(o.id)) });
    } else {
      toast.success(isNew ? 'Utilisateur ajouté' : 'Utilisateur modifié', user.name);
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('Supprimer cet utilisateur ? Cette action est irréversible.')) return;
    const next = users.filter((u) => u.id !== id);
    setUsers(next);
    saveUsers(next);
    toast.success('Utilisateur supprimé');
  };

  const handleToggleActive = (id: string) => {
    const next = users.map((u) => u.id === id ? { ...u, active: !u.active } : u);
    setUsers(next);
    saveUsers(next);
  };

  const counts = {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admin: users.filter((u) => u.role === 'admin').length,
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card padded>
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Utilisateurs</p>
          <p className="num text-2xl font-bold mt-1">{counts.total}</p>
        </Card>
        <Card padded>
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Actifs</p>
          <p className="num text-2xl font-bold mt-1 text-success">{counts.active}</p>
        </Card>
        <Card padded>
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Administrateurs</p>
          <p className="num text-2xl font-bold mt-1 text-accent">{counts.admin}</p>
        </Card>
      </div>

      {/* Table utilisateurs */}
      <Card
        title="Utilisateurs"
        subtitle="Gestion des comptes — accès, rôles, permissions"
        action={
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="w-4 h-4" /> Nouvel utilisateur
          </button>
        }
      >
        {users.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-primary-400 mb-3" />
            <p className="text-sm text-primary-500 mb-2">Aucun utilisateur configuré</p>
            <p className="text-xs text-primary-400 max-w-md mx-auto mb-4">
              Ajoutez votre premier utilisateur pour gérer les accès. En mode local, les comptes sont stockés dans le navigateur. En production avec Supabase, les comptes sont créés via Supabase Auth.
            </p>
            <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="w-4 h-4" /> Ajouter un utilisateur
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-primary-500 border-b-2 border-primary-200 dark:border-primary-800">
                <tr>
                  <th className="text-left py-2 px-3">Nom · Email</th>
                  <th className="text-left py-2 px-3 w-44">Rôle</th>
                  <th className="text-center py-2 px-3 w-24">Sociétés</th>
                  <th className="text-center py-2 px-3 w-24">Statut</th>
                  <th className="text-right py-2 px-3 w-32">Dernière connexion</th>
                  <th className="py-2 px-3 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-primary-100/40 dark:hover:bg-primary-900/40">
                    <td className="py-2 px-3">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-[11px] text-primary-500">{u.email}</p>
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant={u.role === 'admin' ? 'critical' : u.role === 'daf' || u.role === 'dg' ? 'high' : 'low'}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-xs num text-primary-500">{u.orgIds.length} / {orgs.length}</span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button onClick={() => handleToggleActive(u.id)} className={clsx('text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold', u.active ? 'bg-success/10 text-success' : 'bg-primary-200/60 text-primary-600')}>
                        {u.active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-right text-xs text-primary-500 num">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button className="btn-ghost !p-1 text-primary-500 hover:text-accent" onClick={() => { setEditing(u); setModalOpen(true); }} title="Modifier">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn-ghost !p-1 text-primary-500 hover:text-error" onClick={() => handleDelete(u.id)} title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Carte des rôles disponibles */}
      <Card title="Rôles disponibles" subtitle="Description des 8 rôles standards">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(ROLE_LABELS) as AppRole[]).map((role) => (
            <div key={role} className="p-3 rounded-xl border border-primary-200 dark:border-primary-700">
              <div className="flex items-center justify-between mb-1.5">
                <Badge variant={role === 'admin' ? 'critical' : role === 'daf' || role === 'dg' ? 'high' : 'low'}>{ROLE_LABELS[role]}</Badge>
                <span className="text-[10px] num text-primary-400">{users.filter((u) => u.role === role).length} user(s)</span>
              </div>
              <p className="text-xs text-primary-600 dark:text-primary-400 leading-relaxed">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Note Supabase */}
      <Card padded>
        <div className="flex items-start gap-3">
          <Cloud className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold mb-1">Mode hybride local / Supabase Auth</p>
            <p className="text-xs text-primary-500 leading-relaxed">
              En mode local (sans Supabase), les utilisateurs sont stockés dans le navigateur (localStorage). En production avec Supabase configuré (variables <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">VITE_SUPABASE_URL</code> et <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>), les comptes sont gérés via Supabase Auth (email/mot de passe, magic link, OAuth Google) et les rôles via la table <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">fna_user_orgs</code>. Les permissions par rôle sont appliquées via Row-Level Security (RLS) Postgres.
            </p>
          </div>
        </div>
      </Card>

      <UserModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
        orgs={orgs}
      />
      <InvitePreviewModal
        open={!!invitePreview}
        onClose={() => setInvitePreview(null)}
        user={invitePreview?.user ?? null}
        orgs={invitePreview?.orgs ?? []}
      />
    </div>
  );
}

function UserModal({ open, onClose, onSave, initial, orgs }: {
  open: boolean;
  onClose: () => void;
  onSave: (u: AppUser, sendInvite: boolean) => void;
  initial: AppUser | null;
  orgs: { id: string; name: string }[];
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('viewer');
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [sendInvite, setSendInvite] = useState(true);

  // Re-init proprement à chaque ouverture (et quand initial change)
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setEmail(initial.email);
      setRole(initial.role);
      setOrgIds(initial.orgIds);
      setActive(initial.active);
      setSendInvite(false); // pas d'invitation pour une edition
    } else {
      setName('');
      setEmail('');
      setRole('viewer');
      setOrgIds([]);
      setActive(true);
      setSendInvite(true);
    }
  }, [open, initial]);

  const handleSubmit = () => {
    if (!email.trim() || !email.includes('@')) {
      toast.warning('Email invalide', 'Saisissez une adresse email valide.');
      return;
    }
    if (!name.trim()) {
      toast.warning('Nom requis', 'Saisissez un nom complet.');
      return;
    }
    const user: AppUser = {
      id: initial?.id ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      orgIds,
      active,
      createdAt: initial?.createdAt ?? Date.now(),
      lastLoginAt: initial?.lastLoginAt,
    };
    onSave(user, sendInvite);
  };

  const toggleOrg = (id: string) => {
    setOrgIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Modifier — ${initial.name}` : 'Nouvel utilisateur'}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={handleSubmit}>
            <CheckCircle2 className="w-4 h-4" /> {initial ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Nom complet</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" autoFocus />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@societe.com" />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-2">Rôle</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={clsx(
                  'text-left p-3 rounded-xl border-2 transition-all',
                  role === r ? 'border-accent bg-accent/5' : 'border-primary-200 dark:border-primary-700 hover:border-primary-400',
                )}
              >
                <p className="font-semibold text-sm">{ROLE_LABELS[r]}</p>
                <p className="text-[11px] text-primary-500 mt-0.5 leading-relaxed">{ROLE_DESCRIPTIONS[r]}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold block mb-2">
            Sociétés accessibles ({orgIds.length} / {orgs.length})
          </label>
          {orgs.length === 0 ? (
            <p className="text-xs text-primary-400 italic">Aucune société. Créez-en une dans l'onglet Sociétés.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 border border-primary-200 dark:border-primary-700 rounded-lg">
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-2 border-b border-primary-200/60 dark:border-primary-800/40">
                <input
                  type="checkbox"
                  checked={orgIds.length === orgs.length}
                  onChange={(e) => setOrgIds(e.target.checked ? orgs.map((o) => o.id) : [])}
                />
                <span className="text-primary-700 dark:text-primary-300 font-semibold">Toutes les sociétés</span>
              </label>
              {orgs.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={orgIds.includes(o.id)} onChange={() => toggleOrg(o.id)} />
                  <Building2 className="w-3.5 h-3.5 text-primary-400" />
                  {o.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="font-semibold">Compte actif</span>
            <span className="text-xs text-primary-500">— peut se connecter et accéder aux données</span>
          </label>
          {!initial && (
            <label className="flex items-start gap-2 text-sm cursor-pointer p-3 rounded-xl bg-accent/5 border border-accent/20">
              <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">📧 Envoyer une invitation par email</span>
                <p className="text-xs text-primary-500 mt-0.5">L'utilisateur recevra un email HTML avec le lien de l'application, son rôle, ses sociétés et un bouton de connexion.</p>
              </div>
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── INVITATION PREVIEW MODAL ──────────────────────────────────────
// Génère l'email HTML d'invitation, permet de :
//  1. Envoyer via Supabase Auth invite (si configure)
//  2. Ouvrir mailto: avec le contenu pre-rempli
//  3. Copier le HTML dans le presse-papier
//  4. Telecharger le HTML en .eml
function InvitePreviewModal({ open, onClose, user, orgs }: {
  open: boolean;
  onClose: () => void;
  user: AppUser | null;
  orgs: { id: string; name: string }[];
}) {
  if (!user) return null;
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://cockpit-fna.app/login';
  const orgsLabel = orgs.length > 0 ? orgs.map((o) => o.name).join(', ') : 'Toutes les sociétés autorisées';

  const content = buildInvitationEmail({
    recipientName: user.name,
    recipientEmail: user.email,
    roleLabel: ROLE_LABELS[user.role],
    orgsLabel,
    appUrl,
  });

  return (
    <EmailPreviewModal
      open={open}
      onClose={onClose}
      recipient={{ name: user.name, email: user.email }}
      content={content}
      options={{
        mode: 'invitation',
        useSupabaseInvite: true,
        supabasePayload: { name: user.name, role: user.role, orgIds: user.orgIds },
      }}
    />
  );
}

// ─── IA & PROPH3T (Ollama local OU Cloud OpenAI-compatible) ────────
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

// ─── MODÈLES D'EMAILS ─────────────────────────────────────────────────
function TabEmails() {
  const [selected, setSelected] = useState<'invitation' | 'review' | 'report'>('invitation');

  const sampleData = {
    invitation: buildInvitationEmail({
      recipientName: 'Aïcha Diallo',
      recipientEmail: 'aicha.diallo@societe.com',
      roleLabel: 'Directeur Financier (DAF)',
      orgsLabel: 'SARL EXEMPLE · Filiale BTP',
      appUrl: typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://cockpit-fna.app/login',
    }),
    review: buildReviewEmail({
      recipientName: 'Marc Koné',
      recipientEmail: 'marc.kone@societe.com',
      reportTitle: 'Rapport mensuel de gestion — Mai 2026',
      reportPeriod: 'Mai 2026',
      authorName: 'Direction Financière',
      reviewUrl: typeof window !== 'undefined' ? `${window.location.origin}/reports/r-123` : 'https://cockpit-fna.app/reports/r-123',
      deadline: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10),
      comments: "Merci de relire en particulier la section sur la marge nette et les charges d'exploitation. Validation attendue avant le COMEX.",
    }),
    report: buildReportEmail({
      recipientName: 'Jean Camara',
      recipientEmail: 'jean.camara@conseil.com',
      reportTitle: 'Rapport CFO — Q2 2026',
      reportPeriod: 'Q2 2026',
      authorName: 'Direction Financière',
      appUrl: typeof window !== 'undefined' ? `${window.location.origin}/reports/r-456` : 'https://cockpit-fna.app/reports/r-456',
      pdfAttached: true,
      summary: "Performance solide au Q2 avec une croissance du CA de 12% YoY et une amélioration de la marge nette à 8.5%. La trésorerie reste positive malgré les investissements en cours.",
      highlights: [
        'CA Q2 : 1 250 M XOF (+12% YoY)',
        'Marge nette : 8.5% (cible 10%)',
        'Trésorerie nette : +185 M XOF',
        '3 alertes ratios à traiter (DSO, autonomie financière, liquidité)',
      ],
      hasComments: true,
    }),
  };

  const labels = {
    invitation: { name: 'Invitation utilisateur', desc: 'Envoyé quand un nouvel utilisateur est ajouté' },
    review:     { name: 'Demande de revue',        desc: 'Envoyé pour faire valider un rapport en interne' },
    report:     { name: 'Diffusion de rapport',    desc: 'Envoyé pour transmettre un rapport finalisé' },
  };

  const current = sampleData[selected];

  return (
    <div className="space-y-4">
      <Card title="Modèles d'emails" subtitle="Aperçu des 3 templates HTML — branding Cockpit FnA cohérent">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {(['invitation', 'review', 'report'] as const).map((k) => (
            <button key={k} onClick={() => setSelected(k)}
              className={clsx('text-left p-3 rounded-xl border-2 transition-all',
                selected === k ? 'border-accent bg-accent/5' : 'border-primary-200 dark:border-primary-700 hover:border-primary-400')}>
              <p className="font-semibold text-sm">{labels[k].name}</p>
              <p className="text-[11px] text-primary-500 mt-0.5">{labels[k].desc}</p>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-primary-100 dark:bg-primary-800">
              <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-0.5">Sujet</p>
              <p className="font-medium truncate" title={current.subject}>{current.subject}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-primary-100 dark:bg-primary-800">
              <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-0.5">Type</p>
              <p className="font-medium capitalize">{selected}</p>
            </div>
          </div>
          <div className="border border-primary-200 dark:border-primary-700 rounded-xl overflow-hidden bg-white">
            <iframe srcDoc={current.htmlBody} className="w-full" style={{ height: 600, border: 0 }} title={`Aperçu — ${labels[selected].name}`} sandbox="" />
          </div>
        </div>
      </Card>

      <Card padded>
        <div className="flex items-start gap-3">
          <Cloud className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold mb-1">Personnalisation</p>
            <p className="text-xs text-primary-500 leading-relaxed">
              Les templates HTML sont définis dans <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">src/lib/emailTemplates.ts</code>. Pour les personnaliser (logo, couleurs, signature), modifiez ce fichier. Les emails sont envoyés via 4 canaux configurables : Supabase Edge Function (production), mailto: (universel), copie HTML (Gmail/Outlook), téléchargement .eml (Apple Mail/Outlook/Thunderbird).
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── INTÉGRATIONS ──────────────────────────────────────────────────
function TabIntegrations() {
  return (
    <Card title="Intégrations" subtitle="Services distants — roadmap sprints">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { icon: <Cloud className="w-5 h-5" />, name: 'Supabase', desc: 'Auth, PostgreSQL, Storage, Realtime', status: 'Sprint 5' },
          { icon: <Database className="w-5 h-5" />, name: 'Ollama IA locale', desc: 'Llama 3 / Mistral / Phi — confidentialité totale', status: 'Sprint 7' },
          { icon: <SettingsIcon className="w-5 h-5" />, name: 'Electron Desktop', desc: 'Application native + sync offline SQLite', status: 'Sprint 6' },
          { icon: <Cloud className="w-5 h-5" />, name: 'SMTP / Resend', desc: 'Envoi automatique des rapports par email', status: 'Sprint 5' },
          { icon: <Target className="w-5 h-5" />, name: 'Connecteurs ERP', desc: 'SAGE, PERFECTO, SAARI, CEGID, ODOO, SAP', status: 'Sprint 2 ✓' },
          { icon: <Database className="w-5 h-5" />, name: 'IndexedDB Dexie', desc: 'Stockage local, transactions, indexes', status: 'Sprint 1 ✓' },
        ].map((i) => (
          <div key={i.name} className="flex items-start gap-3 p-3 card">
            <div className="w-10 h-10 rounded-lg bg-primary-200 dark:bg-primary-800 flex items-center justify-center shrink-0">{i.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">{i.name}</p>
                <Badge variant="info">{i.status}</Badge>
              </div>
              <p className="text-xs text-primary-500 mt-0.5">{i.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── HELPERS ───────────────────────────────────────────────────────
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-primary-200 dark:border-primary-800 last:border-0">
      <div>
        <p className="font-medium text-sm">{label}</p>
        {hint && <p className="text-xs text-primary-500 mt-0.5">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-primary-500">{label}</p>
      <p className="num text-xl font-bold">{value.toLocaleString('fr-FR')}</p>
    </div>
  );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
