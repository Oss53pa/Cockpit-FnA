/**
 * EmailPreviewModal — preview + envoi des emails Cockpit (3 templates).
 *
 * Reuse universel pour :
 *  - Invitation utilisateur
 *  - Workflow de validation (review)
 *  - Diffusion de rapport
 *
 * 4 modes d'envoi disponibles :
 *  1. Supabase Edge Function (production)
 *  2. mailto: (universel — ouvre le client mail de l'utilisateur)
 *  3. Copie HTML (pour coller dans Gmail/Outlook compose)
 *  4. Téléchargement .eml (Apple Mail, Outlook, Thunderbird)
 */
import { Modal } from './Modal';
import { Cloud, Download, Pencil, CheckCircle2, Send } from 'lucide-react';
import { toast } from './Toast';
import type { EmailContent } from '../../lib/emailTemplates';
import { buildMailto, buildEmlBlob } from '../../lib/emailTemplates';

export interface SendOptions {
  /** Mode actuel */
  mode: 'invitation' | 'review' | 'report';
  /** Edge function Supabase pour le mode production */
  supabaseFunction?: string;  // ex: 'send-report'
  /** Données complémentaires à transmettre à la Edge Function */
  supabasePayload?: Record<string, unknown>;
  /** Si l'invitation est en mode admin Supabase Auth (cas particulier) */
  useSupabaseInvite?: boolean;
}

export function EmailPreviewModal({
  open, onClose, recipient, content, options, onSent,
}: {
  open: boolean;
  onClose: () => void;
  recipient: { name: string; email: string };
  content: EmailContent;
  options: SendOptions;
  onSent?: () => void;
}) {
  const mailto = buildMailto(recipient.email, content);

  const sendViaSupabase = async () => {
    try {
      const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
      if (!isSupabaseConfigured) {
        toast.warning('Supabase non configuré', 'Configurez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY pour envoyer automatiquement.');
        return;
      }
      if (options.useSupabaseInvite) {
        // Invitation utilisateur via Auth admin
        const { error } = await (supabase as any).auth.admin.inviteUserByEmail(recipient.email, {
          data: options.supabasePayload ?? {},
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
        });
        if (error) throw error;
      } else if (options.supabaseFunction) {
        // Edge Function dédiée (review / report)
        const { data, error } = await (supabase as any).functions.invoke(options.supabaseFunction, {
          body: {
            to: recipient.email,
            recipientName: recipient.name,
            subject: content.subject,
            html: content.htmlBody,
            text: content.textBody,
            ...options.supabasePayload,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } else {
        toast.warning('Mode non configuré', 'Aucune Edge Function spécifiée pour ce template.');
        return;
      }
      toast.success('Email envoyé', `→ ${recipient.email}`);
      onSent?.();
      onClose();
    } catch (e: any) {
      toast.error('Envoi impossible', e?.message ?? 'Vérifiez la configuration Supabase (Edge Function ou clé service_role).');
    }
  };

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(content.htmlBody);
      toast.success('HTML copié', 'Collez-le dans votre client mail (Gmail, Outlook, …) avec Cmd/Ctrl+V');
    } catch {
      toast.error('Copie impossible', 'Sélectionnez et copiez manuellement depuis l\'aperçu.');
    }
  };

  const downloadEml = () => {
    const blob = buildEmlBlob(recipient.email, content);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${options.mode}-${recipient.email.split('@')[0]}-${Date.now()}.eml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Fichier .eml téléchargé', 'Double-cliquez pour ouvrir dans votre client mail.');
  };

  const titleByMode = {
    invitation: `Invitation — ${recipient.name}`,
    review:     `Demande de revue — ${recipient.name}`,
    report:     `Diffusion de rapport — ${recipient.name}`,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titleByMode[options.mode]}
      subtitle={recipient.email}
      size="lg"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Fermer</button>
          <button className="btn-outline" onClick={downloadEml}>
            <Download className="w-4 h-4" /> Télécharger .eml
          </button>
          <button className="btn-outline" onClick={copyHtml}>
            <Pencil className="w-4 h-4" /> Copier HTML
          </button>
          <a className="btn-outline" href={mailto}>
            <Send className="w-4 h-4" /> Client mail
          </a>
          <button className="btn-primary" onClick={sendViaSupabase}>
            <Cloud className="w-4 h-4" /> <CheckCircle2 className="w-4 h-4" /> Envoyer via Supabase
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-xs text-primary-500 leading-relaxed">
          Aperçu de l'email HTML. <strong>4 options d'envoi</strong> disponibles dans le footer.
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px] text-primary-600 dark:text-primary-400">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-800">
            <strong className="block mb-0.5">📨 Sujet</strong>
            <span className="truncate block" title={content.subject}>{content.subject}</span>
          </div>
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-800">
            <strong className="block mb-0.5">👤 Destinataire</strong>
            <span className="truncate block">{recipient.email}</span>
          </div>
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-800">
            <strong className="block mb-0.5">📋 Type</strong>
            <span className="capitalize">{options.mode}</span>
          </div>
        </div>
        <div className="border border-primary-200 dark:border-primary-700 rounded-xl overflow-hidden bg-white">
          <iframe
            srcDoc={content.htmlBody}
            className="w-full"
            style={{ height: 460, border: 0 }}
            title={titleByMode[options.mode]}
            sandbox=""
          />
        </div>
      </div>
    </Modal>
  );
}
