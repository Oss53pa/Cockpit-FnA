import React, { useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Cloud, Send, Shield } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { toast } from '../../components/ui/Toast';
import { buildInvitationEmail, buildReviewEmail, buildReportEmail } from '../../lib/emailTemplates';

// ─── STEP helper ────────────────────────────────────────────────────
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-accent text-primary-50 text-xs font-bold shrink-0">{n}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <div className="text-xs text-primary-600 dark:text-primary-300 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

// ─── EMAIL DELIVERY STATUS ───────────────────────────────────────────
export function EmailDeliveryStatus() {
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const runDiag = async () => {
    setTesting(true);
    setLastResult(null);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!SUPABASE_URL || !SUPABASE_ANON) {
        setLastResult({ ok: false, msg: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY non configures' });
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cockpit-send-email?debug=1`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'apikey': SUPABASE_ANON,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const data = await res.json();
      const env = data.env ?? {};
      const lines = [
        `RESEND_API_KEY : ${env.RESEND_API_KEY_set ? `✓ définie (${env.RESEND_API_KEY_prefix}, ${env.RESEND_API_KEY_length} car.)` : '✗ MANQUANTE'}`,
        `From utilisé : ${env.RESEND_FROM_USED}`,
        `RESEND_FROM_COCKPIT : ${env.RESEND_FROM_COCKPIT_set ? '✓' : '—'}`,
        `RESEND_FROM : ${env.RESEND_FROM_set ? '✓' : '—'}`,
        `FROM_EMAIL : ${env.FROM_EMAIL_set ? `✓ (${env.FROM_EMAIL_value})` : '—'}`,
        `SERVICE_ROLE_KEY : ${env.SUPABASE_SERVICE_ROLE_KEY_set ? '✓' : '—'}`,
      ].join('\n');
      setLastResult({ ok: env.RESEND_API_KEY_set, msg: lines });
    } catch (e: any) {
      setLastResult({ ok: false, msg: e?.message ?? 'Erreur inconnue' });
    } finally {
      setTesting(false);
    }
  };

  const runTest = async () => {
    if (!testEmail.includes('@')) {
      toast.warning('Email invalide', 'Saisissez une adresse de test.');
      return;
    }
    setTesting(true);
    setLastResult(null);
    try {
      const { supabase, isSupabaseConfigured } = await import('../../lib/supabase');
      if (!isSupabaseConfigured) {
        setLastResult({ ok: false, msg: 'Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)' });
        return;
      }
      const html = `<div style="font-family:system-ui,sans-serif;padding:20px"><h2 style="color:#DA4D28">Cockpit FnA — test d'envoi</h2><p>Si vous lisez ce message, l'envoi via Resend fonctionne 🎉</p><p style="color:#666;font-size:12px">Envoyé le ${new Date().toLocaleString('fr-FR')}</p></div>`;

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const session = await (supabase as any).auth.getSession();
      const accessToken = session?.data?.session?.access_token ?? SUPABASE_ANON;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/cockpit-send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: testEmail,
          subject: '[Cockpit FnA] Test d\'envoi Resend',
          html,
          text: 'Cockpit FnA — test d\'envoi. Si vous lisez ce message, Resend fonctionne.',
          mode: 'invitation',
        }),
      });

      const responseBody = await res.json().catch(() => ({}));

      if (!res.ok || responseBody.success === false) {
        const errMsg = responseBody.error ?? `HTTP ${res.status}`;
        const hint = responseBody.hint ? `\n→ ${responseBody.hint}` : '';
        const fromInfo = responseBody.from ? `\nFrom utilisé : ${responseBody.from}` : '';
        const resendStatus = responseBody.resendStatus ? `\nStatut Resend : ${responseBody.resendStatus}` : '';
        const resendBody = responseBody.resendBody
          ? `\nRéponse Resend : ${JSON.stringify(responseBody.resendBody).slice(0, 400)}`
          : '';
        setLastResult({ ok: false, msg: `${errMsg}${hint}${fromInfo}${resendStatus}${resendBody}` });
        return;
      }

      setLastResult({ ok: true, msg: `Email envoyé (id: ${responseBody.emailId ?? '—'})\nFrom : ${responseBody.from ?? '—'}` });
      toast.success('Test réussi', `Email envoyé à ${testEmail}`);
    } catch (e: any) {
      setLastResult({ ok: false, msg: e?.message ?? 'Erreur inconnue' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card title="Configuration de l'envoi d'emails (Resend)" subtitle="Edge Function cockpit-send-email — déjà déployée ✓">
      <div className="space-y-4">
        <div className="space-y-2">
          <Step n={1} title="Edge Function déployée">
            <p className="text-xs">
              <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">cockpit-send-email</code> est active sur votre projet Supabase. Elle accepte directement le HTML construit par les templates Cockpit (pas de prefixe imposé, contrairement à <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">send-email</code> qui appartient à Liass'Pilot sur le même projet).
            </p>
          </Step>
          <Step n={2} title="Récupérer une clé API Resend">
            <p className="text-xs">
              Sur <a href="https://resend.com" target="_blank" rel="noopener" className="text-accent underline">resend.com</a>, vérifiez votre domaine d'envoi (DNS DKIM/SPF), puis récupérez une clé <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">re_xxx</code>.
            </p>
          </Step>
          <Step n={3} title="Configurer les secrets (Dashboard Supabase)">
            <p className="text-[11px] text-primary-500 mb-1">
              Dashboard Supabase → Edge Functions → cockpit-send-email → <strong>Secrets</strong> :
            </p>
            <pre className="text-[11px] bg-primary-950 text-primary-100 p-2 rounded overflow-x-auto">{`RESEND_API_KEY=re_xxx
RESEND_FROM_COCKPIT=Cockpit FnA <noreply@votre-domaine.com>`}</pre>
            <p className="text-[11px] text-primary-500 mt-1">
              ⚠️ <strong>Important</strong> : la config Resend dans Supabase Authentication ne couvre que les mails d'auth (signup/reset/magic-link). Les mails métier passent par <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">cockpit-send-email</code>.
              <br/>
              Si <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">RESEND_API_KEY</code> est déjà défini sur le projet (utilisé par d'autres fonctions), la fonction l'hérite automatiquement.
            </p>
          </Step>
        </div>

        <div className="border-t border-primary-200 dark:border-primary-800 pt-3">
          <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Test d'envoi</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="email" className="input flex-1" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="votre.email@exemple.com" />
            <button className="btn-outline whitespace-nowrap" onClick={runDiag} disabled={testing} title="Vérifie quels secrets sont configurés">
              <Shield className="w-4 h-4" /> Diagnostiquer
            </button>
            <button className="btn-primary whitespace-nowrap" onClick={runTest} disabled={testing || !testEmail}>
              <Send className="w-4 h-4" /> {testing ? 'Envoi…' : 'Envoyer un test'}
            </button>
          </div>
          {lastResult && (
            <div className={clsx('mt-2 p-3 rounded-lg text-xs flex items-start gap-2',
              lastResult.ok
                ? 'bg-success/10 border border-success/30 text-success'
                : 'bg-danger/10 border border-danger/30 text-danger',
            )}>
              {lastResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <pre className="leading-relaxed whitespace-pre-wrap break-words text-[11px] flex-1 font-sans">{lastResult.msg}</pre>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── TAB EMAILS ─────────────────────────────────────────────────────
export function TabEmails() {
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

      <EmailDeliveryStatus />

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
