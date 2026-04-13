import { useState } from 'react';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useOrganizations } from '../hooks/useFinancials';
import { db, type AccountingSystem } from '../db/schema';
import { useApp } from '../store/app';
import { ACCOUNTING_SYSTEMS, SYSTEM_META } from '../syscohada/systems';

const SECTORS = ['Industrie', 'Commerce', 'BTP', 'Services', 'Agriculture', 'Santé', 'Banque', 'Microfinance', 'Éducation', 'Hôtellerie', 'Mines', 'Immobilier', 'Transport', 'Télécoms'];
const CURRENCIES = ['XOF', 'XAF', 'EUR', 'USD', 'GHS', 'NGN'];

export default function Orgs() {
  const orgs = useOrganizations();
  const { currentOrgId, setCurrentOrg } = useApp();
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ name: '', sector: 'Industrie', currency: 'XOF', rccm: '', ifu: '', accountingSystem: 'Normal' as AccountingSystem });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const id = 'org-' + Date.now();
      await db.organizations.add({
        id,
        name: form.name.trim(),
        sector: form.sector,
        currency: form.currency,
        accountingSystem: form.accountingSystem,
        rccm: form.rccm || undefined,
        ifu: form.ifu || undefined,
        createdAt: Date.now(),
      });
      // Exercice courant vide
      const year = new Date().getFullYear();
      await db.fiscalYears.add({
        id: `${id}-${year}`, orgId: id, year,
        startDate: `${year}-01-01`, endDate: `${year}-12-31`, closed: false,
      });
      const monthLabels = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const periods = Array.from({ length: 12 }, (_, i) => ({
        id: `${id}-${year}-${String(i + 1).padStart(2, '0')}`,
        orgId: id, fiscalYearId: `${id}-${year}`,
        year, month: i + 1, label: `${monthLabels[i]} ${year}`, closed: false,
      }));
      await db.periods.bulkPut(periods);
      setOpenNew(false);
      setForm({ name: '', sector: 'Industrie', currency: 'XOF', rccm: '', ifu: '', accountingSystem: 'Normal' as AccountingSystem });
      setCurrentOrg(id);
    } finally {
      setSaving(false);
    }
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
      const next = orgs.find((o) => o.id !== id);
      if (next) setCurrentOrg(next.id);
    }
  };

  return (
    <div>
      <PageHeader
        title="Sociétés & sites"
        subtitle="Multi-sociétés, multi-sites, consolidation"
        action={<button className="btn-primary" onClick={() => setOpenNew(true)}><Plus className="w-4 h-4" /> Ajouter une société</button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orgs.map((o) => (
          <Card key={o.id}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary-200 dark:bg-primary-800 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{o.name}</p>
                <p className="text-xs text-primary-500 mt-0.5">{o.sector} · {o.currency}</p>
                {o.rccm && <p className="text-[10px] text-primary-400 mt-0.5 font-mono">RCCM : {o.rccm}</p>}
                {o.ifu && <p className="text-[10px] text-primary-400 font-mono">IFU : {o.ifu}</p>}
                <div className="mt-2 flex gap-2 items-center">
                  {currentOrgId === o.id
                    ? <Badge variant="success">Active</Badge>
                    : <button className="badge bg-primary-200 dark:bg-primary-800 hover:bg-primary-300 dark:hover:bg-primary-700" onClick={() => setCurrentOrg(o.id)}>Sélectionner</button>}
                  <select
                    className="text-[10px] py-0.5 px-1 rounded border border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900"
                    value={o.accountingSystem ?? 'Normal'}
                    onChange={(e) => db.organizations.update(o.id, { accountingSystem: e.target.value as AccountingSystem })}
                    title="Système comptable OHADA"
                  >
                    {ACCOUNTING_SYSTEMS.map((s) => <option key={s} value={s}>{SYSTEM_META[s].label}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn-ghost !p-1.5 text-error hover:bg-error/10" onClick={() => remove(o.id)} title="Supprimer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={openNew}
        onClose={() => setOpenNew(false)}
        title="Ajouter une société"
        subtitle="Création d'un nouveau tenant — 12 périodes seront générées automatiquement"
        footer={<>
          <button className="btn-outline" onClick={() => setOpenNew(false)}>Annuler</button>
          <button className="btn-primary" onClick={create} disabled={saving || !form.name.trim()}>
            {saving ? 'Création…' : 'Créer'}
          </button>
        </>}
      >
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
          <div>
            <label className="text-xs text-primary-500 font-medium block mb-1">Système comptable OHADA</label>
            <select className="input" value={form.accountingSystem}
              onChange={(e) => setForm({ ...form, accountingSystem: e.target.value as AccountingSystem })}>
              {ACCOUNTING_SYSTEMS.map((s) => (
                <option key={s} value={s}>{SYSTEM_META[s].label} — {SYSTEM_META[s].caThreshold}</option>
              ))}
            </select>
            <p className="text-[11px] text-primary-400 mt-1">{SYSTEM_META[form.accountingSystem].desc}</p>
          </div>
        </div>
      </Modal>
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
