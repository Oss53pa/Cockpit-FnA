/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ─── COMPOSANTS UTILITAIRES + MODALES DU RAPPORT ─────────────────
import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { FileText, Mail, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { EmailPreviewModal } from '../../components/ui/EmailPreviewModal';
import { toast } from '../../components/ui/Toast';
import { dataProvider } from '../../db/provider';
import { invalidateCloudData } from '../../hooks/useCloudData';
import type { ReportConfig } from '../../engine/reportBlocks';
import { TABLE_CATALOG, DASHBOARD_CATALOG } from './reportData';

// ─── COMPOSANTS UTILITAIRES ──────────────────────────────────────
export function Field({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">{label}</label>
      <input className="input !py-1.5 text-xs" value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}

export function Stat({ label, v }: { label: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="text-primary-500">{label}</span><span className="font-semibold truncate">{v}</span></div>;
}

export function LogoUpload({ onLogo, current }: { onLogo: (d: string) => void; current?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Logo</label>
      <input ref={ref} type="file" accept="image/*" className="input !py-1 text-[10px]" onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const r = new FileReader(); r.onload = () => onLogo(r.result as string); r.readAsDataURL(f);
      }} />
      {current && <div className="mt-1.5 inline-block border p-1 rounded bg-primary-50"><img src={current} alt="logo" className="h-8" /></div>}
    </div>
  );
}

// ─── MODALES ────────────────────────────────────────────────────
export function SendModal({ open, onClose, config, setConfig, onValidate }: any) {
  const [email, setEmail] = useState('');
  const [destination, setDestination] = useState<'validation' | 'final'>('validation');
  const [comments, setComments] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const sendAll = () => {
    if (config.recipients.length === 0) {
      toast.warning('Aucun destinataire', 'Ajoutez au moins un email avant d\'envoyer.');
      return;
    }
    onValidate();
    setPreviewIndex(0);
  };

  const buildContent = (recipient: string) => {
    const recipientName = recipient.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/reports` : 'https://cockpit-fna.app/reports';
    if (destination === 'validation') {
      return import('../../lib/emailTemplates').then(({ buildReviewEmail }) => buildReviewEmail({
        recipientName, recipientEmail: recipient,
        reportTitle: config.identity?.title ?? 'Rapport', reportPeriod: config.identity?.period ?? 'Période',
        authorName: config.identity?.author ?? 'Cockpit FnA', reviewUrl: appUrl,
        comments: comments.trim() || undefined,
      }));
    }
    return import('../../lib/emailTemplates').then(({ buildReportEmail }) => buildReportEmail({
      recipientName, recipientEmail: recipient,
      reportTitle: config.identity?.title ?? 'Rapport', reportPeriod: config.identity?.period ?? 'Période',
      authorName: config.identity?.author ?? 'Cockpit FnA', appUrl, pdfAttached: true,
      summary: comments.trim() || undefined,
    }));
  };

  return (
    <Modal open={open} onClose={onClose} title="Envoyer le rapport" subtitle="Validation interne ou diffusion finale"
      footer={<>
        <button className="btn-outline" onClick={onClose}>Annuler</button>
        <button className="btn-clay" onClick={sendAll}><Send className="w-4 h-4" /> Envoyer ({config.recipients.length})</button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-primary-500 font-semibold block mb-2">Type d'envoi</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDestination('validation')} className={clsx('p-3 rounded border text-sm text-left',
              destination === 'validation' ? 'border-primary-900 dark:border-primary-100 bg-primary-100 dark:bg-primary-800' : 'border-primary-200 dark:border-primary-800')}>
              <p className="font-semibold">⏸ Pour validation</p><p className="text-[10px] text-primary-500 mt-1">Statut "En révision"</p>
            </button>
            <button onClick={() => setDestination('final')} className={clsx('p-3 rounded border text-sm text-left',
              destination === 'final' ? 'border-primary-900 dark:border-primary-100 bg-primary-100 dark:bg-primary-800' : 'border-primary-200 dark:border-primary-800')}>
              <p className="font-semibold">📤 Diffusion finale</p><p className="text-[10px] text-primary-500 mt-1">Statut "Diffusé"</p>
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-primary-500 font-semibold block mb-2">Destinataires ({config.recipients.length})</label>
          <div className="flex gap-2">
            <input className="input flex-1" type="email" placeholder="email@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) { setConfig((c: ReportConfig) => ({ ...c, recipients: [...c.recipients, email.trim()] })); setEmail(''); } }} />
            <button className="btn-outline" onClick={() => { if (email.trim()) { setConfig((c: ReportConfig) => ({ ...c, recipients: [...c.recipients, email.trim()] })); setEmail(''); } }}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {config.recipients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {config.recipients.map((r: string, i: number) => (
                <span key={i} className="badge bg-primary-200 dark:bg-primary-800 px-2 py-1 text-xs flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {r}
                  <button onClick={() => setConfig((c: ReportConfig) => ({ ...c, recipients: c.recipients.filter((_, j) => j !== i) }))} className="ml-1 hover:text-error">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-primary-500 font-semibold block mb-2">
            {destination === 'validation' ? 'Message au validateur' : 'Synthèse pour les destinataires'} (optionnel)
          </label>
          <textarea className="input min-h-[80px]" value={comments} onChange={(e) => setComments(e.target.value)}
            placeholder={destination === 'validation' ? "Points d'attention pour la revue, demandes spécifiques…" : "Synthèse 2-3 lignes des principaux enseignements du rapport…"} />
        </div>

        <div className="card p-3 bg-primary-100 dark:bg-primary-800 text-xs">
          <p>📎 Le PDF sera téléchargé localement et l'email HTML sera envoyé via Supabase Edge Function (si configuré) ou ouvert dans votre client mail.</p>
          <p className="mt-1 text-primary-500">Format : {config.format} · Palette : {config.palette}</p>
        </div>
      </div>

      {previewIndex !== null && previewIndex < config.recipients.length && (
        <SendPreviewLoader
          recipient={config.recipients[previewIndex]}
          buildContent={buildContent}
          mode={destination === 'validation' ? 'review' : 'report'}
          onClose={() => { setPreviewIndex(null); onClose(); }}
          onNext={() => setPreviewIndex(previewIndex + 1)}
          isLast={previewIndex === config.recipients.length - 1}
        />
      )}
    </Modal>
  );
}

function SendPreviewLoader({ recipient, buildContent, mode, onClose, onNext, isLast }: {
  recipient: string; buildContent: (r: string) => Promise<any>;
  mode: 'review' | 'report'; onClose: () => void; onNext: () => void; isLast: boolean;
}) {
  const [content, setContent] = useState<any>(null);
  useEffect(() => { setContent(null); buildContent(recipient).then(setContent); }, [recipient]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!content) return null;
  const recipientName = recipient.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <EmailPreviewModal
      open={true}
      onClose={isLast ? onClose : onNext}
      recipient={{ name: recipientName, email: recipient }}
      content={content}
      options={{ mode }}
      onSent={isLast ? onClose : onNext}
    />
  );
}

export function SaveModal({ open, onClose, config, orgId }: any) {
  const [name, setName] = useState(config.identity.title);
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(config.identity.title); setDesc(''); } }, [open, config.identity.title]);

  const save = async () => {
    if (!name.trim()) { toast.warning('Nom requis', 'Saisissez un nom pour le modèle.'); return; }
    if (!orgId) { toast.error('Société manquante', 'Sélectionnez une société avant d\'enregistrer un modèle.'); return; }
    setSaving(true);
    try {
      const now = Date.now();
      await dataProvider.upsertTemplate({ orgId, name: name.trim(), description: desc.trim() || undefined, config: JSON.stringify(config), createdAt: now, updatedAt: now });
      invalidateCloudData('templates');
      toast.success('Modèle enregistré', `"${name}" prêt à être réutilisé`);
      onClose();
    } catch (e: any) {
      console.error('SaveModal: erreur lors de l\'enregistrement', e);
      toast.error('Erreur', e?.message ?? 'Impossible d\'enregistrer le modèle.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Enregistrer comme modèle"
      footer={<>
        <button className="btn-outline" onClick={onClose} disabled={saving}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>
          <Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </>}>
      <div className="space-y-3">
        <Field label="Nom du modèle" v={name} on={setName} />
        <div>
          <label className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold block mb-1">Description</label>
          <textarea className="input min-h-[60px]" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description du modèle (optionnel)" />
        </div>
        <p className="text-xs text-primary-500">Le modèle conservera : identité, palette, format, options, et tous les blocs.</p>
      </div>
    </Modal>
  );
}

export function CatalogModal({ open, onClose, kind, onPick }: { open: boolean; onClose: () => void; kind: 'tables' | 'dashboards'; onPick: (item: any, withTitle: boolean) => void }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string>('Toutes');
  const [withTitle, setWithTitle] = useState(true);
  const items = kind === 'tables' ? TABLE_CATALOG : DASHBOARD_CATALOG;
  const cats = ['Toutes', ...Array.from(new Set(items.map((i) => i.cat)))];
  const filtered = items.filter((i) => {
    if (cat !== 'Toutes' && i.cat !== cat) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const label = (i as any).label ?? (i as any).name;
    return label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q);
  });

  return (
    <Modal open={open} onClose={onClose}
      title={kind === 'tables' ? 'Catalogue de tables' : 'Catalogue de dashboards'}
      subtitle={`${filtered.length} élément(s) — cliquez pour insérer`}
      size="xl"
      footer={<>
        <label className="flex items-center gap-2 text-xs cursor-pointer mr-auto">
          <input type="checkbox" checked={withTitle} onChange={(e) => setWithTitle(e.target.checked)} />
          Insérer un titre H2 au-dessus du bloc (ajouté au sommaire)
        </label>
        <button className="btn-outline" onClick={onClose}>Fermer</button>
      </>}>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input className="input !py-1.5 text-sm flex-1 min-w-[200px]" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-1 flex-wrap">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`btn !py-1.5 text-xs ${cat === c ? 'bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900' : 'btn-outline'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto pr-1">
        {filtered.map((it: any) => (
          <button key={it.v ?? it.id} onClick={() => onPick(it, withTitle)}
            className="text-left p-3 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900 hover:border-primary-400 dark:hover:border-primary-600 transition group">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">{it.label ?? it.name}</p>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-200 dark:bg-primary-800 text-primary-600 dark:text-primary-400 shrink-0">{it.cat}</span>
            </div>
            <p className="text-xs text-primary-500 leading-tight">{it.desc}</p>
            <p className="text-[10px] text-primary-400 mt-2 group-hover:text-primary-700 dark:group-hover:text-primary-300">+ Insérer →</p>
          </button>
        ))}
        {filtered.length === 0 && <p className="col-span-full py-12 text-center text-primary-500 text-sm">Aucun résultat</p>}
      </div>
    </Modal>
  );
}

export function LoadModal({ open, onClose, templates, onLoad }: any) {
  const remove = async (id: number) => {
    if (!confirm('Supprimer ce modèle ?')) return;
    try {
      await dataProvider.deleteTemplate(id);
      invalidateCloudData('templates');
      toast.success('Modèle supprimé');
    } catch (e: any) {
      toast.error('Erreur', e?.message ?? 'Suppression impossible.');
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Charger un modèle" size="lg"
      subtitle={templates.length === 0 ? 'Aucun modèle pour le moment' : `${templates.length} modèle(s) disponible(s)`}
      footer={<button className="btn-outline" onClick={onClose}>Fermer</button>}>
      {templates.length === 0 ? (
        <div className="py-12 text-center">
          <FileText className="w-12 h-12 text-primary-300 mx-auto mb-3" />
          <p className="text-sm text-primary-500 mb-2">Aucun modèle enregistré pour cette société.</p>
          <p className="text-xs text-primary-400 max-w-md mx-auto">
            Créez votre premier modèle en cliquant sur <strong>« Enregistrer modèle »</strong> après avoir personnalisé un rapport. Il sera disponible ici pour être chargé en un clic.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t: any) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-sm">{t.name}</p>
                <button onClick={() => remove(t.id)} className="btn-ghost !p-1 text-primary-500 hover:text-error"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {t.description && <p className="text-xs text-primary-500 mb-3">{t.description}</p>}
              <p className="text-[10px] text-primary-400 mb-3">Créé le {new Date(t.createdAt).toLocaleDateString('fr-FR')}</p>
              <button className="btn-primary w-full !py-1.5 text-xs" onClick={() => { onLoad(t); toast.success('Modèle chargé', t.name); }}>Charger</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function ReportJournalModal({ open, onClose, reports, currentReportId, onLoad, onDelete }: any) {
  const [filter, setFilter] = useState('');
  const filtered = reports.filter((r: any) =>
    !filter || r.title.toLowerCase().includes(filter.toLowerCase()) || r.author.toLowerCase().includes(filter.toLowerCase())
  );

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      draft: { label: 'Brouillon', cls: 'bg-primary-200 text-primary-700' },
      review: { label: 'En revue', cls: 'bg-amber-100 text-amber-800' },
      approved: { label: 'Validé', cls: 'bg-emerald-100 text-emerald-800' },
      diffused: { label: 'Diffusé', cls: 'bg-blue-100 text-blue-800' },
    };
    const m = map[s] ?? map.draft;
    return <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold', m.cls)}>{m.label}</span>;
  };

  return (
    <Modal open={open} onClose={onClose} title={`Journal des rapports (${reports.length})`} size="xl"
      subtitle="Tous les rapports enregistrés pour cette société"
      footer={<button className="btn-outline" onClick={onClose}>Fermer</button>}>
      <div className="mb-3">
        <input className="input" placeholder="Rechercher par titre ou auteur…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-primary-500">
          <FileText className="w-10 h-10 mx-auto mb-3 text-primary-400" />
          <p className="text-sm">{reports.length === 0 ? 'Aucun rapport enregistré pour le moment.' : 'Aucun résultat pour cette recherche.'}</p>
          {reports.length === 0 && <p className="text-xs text-primary-400 mt-2">Cliquez sur « Enregistrer le rapport » dans le header pour créer votre premier rapport.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-primary-500 border-b-2 border-primary-200 dark:border-primary-800">
              <tr>
                <th className="text-left py-2 px-3">Titre</th>
                <th className="text-left py-2 px-3">Auteur</th>
                <th className="text-left py-2 px-3">Statut</th>
                <th className="text-left py-2 px-3">Créé le</th>
                <th className="text-left py-2 px-3">Modifié le</th>
                <th className="text-center py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
              {filtered.map((r: any) => (
                <tr key={r.id} className={clsx('hover:bg-primary-100/40 dark:hover:bg-primary-900/40', currentReportId === r.id && 'bg-primary-100 dark:bg-primary-900')}>
                  <td className="py-2 px-3 font-medium">
                    {r.title}
                    {currentReportId === r.id && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary-900 text-primary-50 dark:bg-primary-100 dark:text-primary-900">En cours</span>}
                  </td>
                  <td className="py-2 px-3 text-xs text-primary-500">{r.author}</td>
                  <td className="py-2 px-3">{statusBadge(r.status)}</td>
                  <td className="py-2 px-3 text-xs text-primary-500 num">{new Date(r.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="py-2 px-3 text-xs text-primary-500 num">{new Date(r.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button className="btn-outline !py-1 text-xs" onClick={() => onLoad(r)} title="Charger ce rapport">Ouvrir</button>
                      <button className="btn-ghost !p-1.5 text-primary-500 hover:text-error" onClick={() => onDelete(r.id)} title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
