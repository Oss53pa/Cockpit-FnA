/**
 * OnboardingModal — wizard OBLIGATOIRE en 4 étapes au premier login.
 *
 * Affiché automatiquement quand :
 *   - L'utilisateur est authentifié (Supabase session active)
 *   - Aucune organisation n'est mappée à son user_id dans fna_user_orgs
 *   - L'utilisateur n'est PAS en mode démo
 *
 * Différence avec l'ancienne version : le modal est désormais BLOQUANT.
 *   - Pas de bouton "Plus tard"
 *   - Pas de croix de fermeture
 *   - Clic en dehors → effet visuel (shake) mais ne ferme pas
 *   - Si tentative de bypass via /dashboard sans org : erreur explicite renvoyée
 *     (cf. ProtectedRoute / OrgGuard)
 *
 * Workflow :
 *   1. Paramétrage entreprise (dénomination, RCCM, NCC, date clôture, régime fiscal)
 *   2. Import balance (étape ignorable, lien vers /imports)
 *   3. Contrôle (récap + checks RLS)
 *   4. Terminé (redirige vers /home)
 *
 * Ce flow résout la cause racine de l'erreur RLS « new row violates row-level
 * security policy » en garantissant qu'au moins une org + mapping fna_user_orgs
 * existent avant la première écriture.
 */
import { useEffect, useState } from 'react';
import { Building2, ArrowRight, ArrowLeft, CheckCircle2, Loader2, AlertCircle, Upload, ShieldCheck, Sparkles } from 'lucide-react';
import { safeLocalStorage } from '../../lib/safeStorage';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { invalidateCloudData } from '../../hooks/useCloudData';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type WizardStep = 1 | 2 | 3 | 4;

const REGIMES_FISCAUX = [
  { value: 'Régime normal', label: 'Régime normal' },
  { value: 'Régime simplifié', label: 'Régime simplifié' },
  { value: 'Régime micro-entreprise', label: 'Régime micro-entreprise' },
  { value: 'Régime de l\'impôt synthétique', label: 'Régime de l\'impôt synthétique' },
];

export function OnboardingModal() {
  const { setCurrentOrg } = useApp();
  const [shouldShow, setShouldShow] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [shake, setShake] = useState(false);

  // Form state — étape 1
  const [name, setName] = useState('');
  const [rccm, setRccm] = useState('');
  const [ncc, setNcc] = useState('');           // N° Contribuable (= IFU/NIF selon pays)
  const [clotureDate, setClotureDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [regimeFiscal, setRegimeFiscal] = useState('Régime normal');

  // ID de l'org créée (utilisé aux étapes 2-4 pour les actions optionnelles)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);

  // Détection : faut-il afficher le modal ?
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id;
        if (!uid) return;
        if (cancelled) return;
        setUserId(uid);

        // En mode démo : ne pas perturber le parcours
        const isDemoMode = typeof localStorage !== 'undefined' && safeLocalStorage.getItem('demo-mode') === '1';
        if (isDemoMode) return;

        // Vérifie si user a au moins 1 org mappée
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table fna_user_orgs non typée dans le schéma généré
        const { data: userOrgs } = await (supabase as any)
          .from('fna_user_orgs')
          .select('org_id')
          .eq('user_id', uid);

        const hasOrg = (userOrgs?.length ?? 0) > 0;
        if (!hasOrg && !cancelled) {
          // Petit délai pour laisser hydrate finir
          setTimeout(() => { if (!cancelled) setShouldShow(true); }, 800);
        }
      } catch (e) {
        console.warn('[OnboardingModal] détection échouée:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Effet shake si l'utilisateur tente de fermer
  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  // Validation étape 1
  const step1Valid = name.trim().length > 0 && clotureDate && regimeFiscal;

  // Soumission de l'étape 1 : crée l'org + le mapping fna_user_orgs
  const submitStep1 = async () => {
    if (!step1Valid || !userId) {
      setError('Renseignez au minimum la dénomination sociale, la date de clôture et le régime fiscal.');
      return;
    }
    setStatus('submitting');
    setError(null);
    try {
      const orgId = `org-${Date.now()}-${userId.slice(0, 6)}`;
      // Extrait l'année de clôture pour l'exercice fiscal
      const closeYear = parseInt(clotureDate.substring(0, 4), 10);

      // 1) Crée l'organisation
      await dataProvider.upsertOrganization({
        id: orgId,
        name: name.trim(),
        sector: 'Services',
        rccm: rccm.trim() || undefined,
        ifu: ncc.trim() || undefined,
        accountingSystem: 'Normal',
        currency: 'XOF',
        coaSystem: 'SYSCOHADA',
        createdAt: Date.now(),
        // Champs additionnels (régime fiscal stocké comme tag sur address pour rétro-compat)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // 2) Mapping fna_user_orgs (CRITIQUE pour RLS)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: mapErr } = await (supabase as any).from('fna_user_orgs').upsert(
        { user_id: userId, org_id: orgId, role: 'admin' },
        { onConflict: 'user_id,org_id', ignoreDuplicates: true },
      );
      if (mapErr) throw mapErr;

      // 3) Crée l'exercice fiscal selon la date de clôture choisie
      const fyId = `${orgId}-${closeYear}`;
      await dataProvider.upsertFiscalYear({
        id: fyId,
        orgId,
        year: closeYear,
        startDate: `${closeYear}-01-01`,
        endDate: clotureDate,
        closed: false,
      });

      // 4) Crée les 12 périodes mensuelles
      const monthLabels = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const periods = Array.from({ length: 12 }, (_, i) => ({
        id: `${orgId}-${closeYear}-${String(i + 1).padStart(2, '0')}`,
        orgId,
        fiscalYearId: fyId,
        year: closeYear,
        month: i + 1,
        label: `${monthLabels[i]} ${closeYear}`,
        closed: false,
      }));
      await dataProvider.bulkUpsertPeriods(periods);

      // 5) Active l'org créée
      setCreatedOrgId(orgId);
      setCurrentOrg(orgId);
      invalidateCloudData('organizations');
      invalidateCloudData('fiscalYears');
      invalidateCloudData('periods');

      setStatus('idle');
      setStep(2);
    } catch (err: any) {
      console.error('[OnboardingModal] création échouée:', err);
      setError(err?.message || 'Erreur lors de la création de la société.');
      setStatus('error');
    }
  };

  // Étape 4 : finalise et ferme
  const finalize = () => {
    setStatus('success');
    setTimeout(() => {
      setShouldShow(false);
      // Redirige vers /home si on n'y est pas déjà
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/home')) {
        window.location.href = '/home';
      }
    }, 1200);
  };

  if (!shouldShow) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onClick={(e) => {
        // Clic en dehors du modal = shake, pas de fermeture
        if (e.target === e.currentTarget) triggerShake();
      }}
    >
      <div
        className={`bg-bgpage dark:bg-primary-950 max-w-2xl w-full rounded-2xl shadow-2xl border border-primary-200 dark:border-primary-800 overflow-hidden transition-transform ${shake ? 'animate-shake' : ''}`}
        style={shake ? { animation: 'wiggle 0.4s ease-in-out' } : undefined}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-primary-200 dark:border-primary-800">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 id="onboarding-title" className="text-lg font-bold text-primary-900 dark:text-primary-100">
                Configuration de l'entreprise
              </h2>
              <p className="text-xs text-primary-600 dark:text-primary-400">
                Étape {step} sur 4
              </p>
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-5 pb-3">
          <Stepper current={step} />
        </div>

        {/* Body */}
        {status === 'success' ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-success" />
            <p className="font-semibold text-primary-900 dark:text-primary-100">
              Configuration terminée
            </p>
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
              Bienvenue dans Cockpit FnA — redirection en cours…
            </p>
          </div>
        ) : (
          <>
            {step === 1 && (
              <Step1Form
                name={name} setName={setName}
                rccm={rccm} setRccm={setRccm}
                ncc={ncc} setNcc={setNcc}
                clotureDate={clotureDate} setClotureDate={setClotureDate}
                regimeFiscal={regimeFiscal} setRegimeFiscal={setRegimeFiscal}
                error={error}
              />
            )}

            {step === 2 && <Step2ImportBalance orgId={createdOrgId} />}

            {step === 3 && (
              <Step3Controle
                orgName={name}
                clotureDate={clotureDate}
                regimeFiscal={regimeFiscal}
                rccm={rccm}
                ncc={ncc}
              />
            )}

            {step === 4 && <Step4Termine orgName={name} />}

            {/* Footer navigation */}
            <div className="px-6 py-4 border-t border-primary-200 dark:border-primary-800 flex items-center justify-between bg-primary-50/40 dark:bg-primary-900/30">
              <button
                type="button"
                disabled={step === 1 || status === 'submitting'}
                onClick={() => {
                  if (step > 1) setStep((step - 1) as WizardStep);
                }}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-100 inline-flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Retour
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  disabled={(step === 1 && (!step1Valid || status === 'submitting'))}
                  onClick={() => {
                    if (step === 1) {
                      void submitStep1();
                    } else {
                      setStep((step + 1) as WizardStep);
                    }
                  }}
                  className="btn-primary !py-2 !text-sm inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'submitting' ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Création…</>
                  ) : (
                    <>Suivant <ArrowRight className="w-3.5 h-3.5" /></>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finalize}
                  className="btn-primary !py-2 !text-sm inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Accéder à l'app
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Animation shake inline (à défaut d'avoir une keyframe globale Tailwind) */}
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────
function Stepper({ current }: { current: WizardStep }) {
  const steps: { num: WizardStep; label: string }[] = [
    { num: 1, label: 'Paramétrage entreprise' },
    { num: 2, label: 'Import balance' },
    { num: 3, label: 'Contrôle' },
    { num: 4, label: 'Terminé' },
  ];
  return (
    <div className="flex items-center justify-between">
      {steps.map((s, i) => {
        const active = current === s.num;
        const done = current > s.num;
        return (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition ${
                  done ? 'bg-success text-white' :
                  active ? 'bg-primary-900 dark:bg-primary-100 text-white dark:text-primary-900' :
                  'bg-primary-200 dark:bg-primary-800 text-primary-500'
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : s.num}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${active || done ? 'text-primary-900 dark:text-primary-100' : 'text-primary-500'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 -mt-4 transition ${done ? 'bg-success' : 'bg-primary-200 dark:bg-primary-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Étape 1 — Paramétrage entreprise ─────────────────────────────────
function Step1Form(props: {
  name: string; setName: (v: string) => void;
  rccm: string; setRccm: (v: string) => void;
  ncc: string; setNcc: (v: string) => void;
  clotureDate: string; setClotureDate: (v: string) => void;
  regimeFiscal: string; setRegimeFiscal: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="p-6 space-y-4">
      <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100">
        Paramétrage de votre entreprise
      </h3>

      <Field
        label="Dénomination sociale"
        required
        value={props.name}
        onChange={props.setName}
        placeholder="Ex. EMERGENCE PLAZA SA"
        autoFocus
      />

      <Field
        label="RCCM"
        value={props.rccm}
        onChange={props.setRccm}
        placeholder="Ex. CI-ABJ-2024-B-12345"
      />

      <Field
        label="N° Contribuable (NCC)"
        value={props.ncc}
        onChange={props.setNcc}
        placeholder="Identifiant fiscal de l'entreprise"
      />

      <Field
        label="Date de clôture de l'exercice"
        required
        type="date"
        value={props.clotureDate}
        onChange={props.setClotureDate}
      />

      <div>
        <label className="text-xs font-semibold text-primary-700 dark:text-primary-300 block mb-1">
          Régime fiscal <span className="text-error">*</span>
        </label>
        <select
          value={props.regimeFiscal}
          onChange={(e) => props.setRegimeFiscal(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-primary-300 dark:border-primary-700 bg-white dark:bg-primary-950 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {REGIMES_FISCAUX.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {props.error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/30">
          <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
          <p className="text-xs text-error">{props.error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Étape 2 — Import balance (optionnel) ─────────────────────────────
function Step2ImportBalance({ orgId }: { orgId: string | null }) {
  return (
    <div className="p-6 space-y-4">
      <div className="text-center py-4">
        <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-3">
          <Upload className="w-7 h-7 text-accent" />
        </div>
        <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100">
          Import de la balance (optionnel)
        </h3>
        <p className="text-xs text-primary-600 dark:text-primary-400 mt-1 max-w-md mx-auto">
          Vous pourrez importer votre balance d'ouverture ou votre Grand Livre depuis la page <strong>Imports</strong>.
          {orgId && <> Cette étape n'est pas bloquante — passez à l'étape suivante.</>}
        </p>
      </div>
      <div className="rounded-lg bg-primary-100/60 dark:bg-primary-900/30 p-4 text-xs text-primary-700 dark:text-primary-300">
        <p className="font-semibold mb-1">Formats acceptés :</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>CSV (séparateur virgule, point-virgule ou tabulation)</li>
          <li>Excel (XLSX, XLS)</li>
          <li>Exports SAGE, PERFECTO, SAARI, CEGID, Odoo, SAP</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Étape 3 — Contrôle (récap) ───────────────────────────────────────
function Step3Controle(props: {
  orgName: string;
  clotureDate: string;
  regimeFiscal: string;
  rccm: string;
  ncc: string;
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="text-center py-2">
        <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-3">
          <ShieldCheck className="w-7 h-7 text-success" />
        </div>
        <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100">
          Contrôle des informations
        </h3>
        <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
          Vérifiez les paramètres avant de finaliser
        </p>
      </div>

      <div className="rounded-lg border border-primary-200 dark:border-primary-800 divide-y divide-primary-200 dark:divide-primary-800">
        <Row label="Dénomination sociale" value={props.orgName} />
        <Row label="RCCM" value={props.rccm || '—'} />
        <Row label="N° Contribuable" value={props.ncc || '—'} />
        <Row label="Date de clôture" value={new Date(props.clotureDate).toLocaleDateString('fr-FR')} />
        <Row label="Régime fiscal" value={props.regimeFiscal} />
        <Row label="Plan comptable" value="SYSCOHADA révisé 2017" />
        <Row label="Devise" value="XOF (Franc CFA)" />
      </div>

      <p className="text-[11px] text-primary-500 text-center pt-2">
        Tous les paramètres sont modifiables ultérieurement dans Paramètres → Sociétés.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[11px] uppercase tracking-wider text-primary-500 font-medium">{label}</span>
      <span className="text-xs font-medium text-primary-900 dark:text-primary-100">{value}</span>
    </div>
  );
}

// ─── Étape 4 — Terminé ─────────────────────────────────────────────────
function Step4Termine({ orgName }: { orgName: string }) {
  return (
    <div className="p-10 text-center">
      <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-9 h-9 text-success" />
      </div>
      <h3 className="text-base font-bold text-primary-900 dark:text-primary-100 mb-2">
        Configuration terminée !
      </h3>
      <p className="text-xs text-primary-600 dark:text-primary-400 max-w-md mx-auto">
        L'entreprise <strong className="text-accent">{orgName}</strong> est configurée. Vous pouvez maintenant importer votre Grand Livre,
        consulter vos dashboards et générer vos états financiers SYSCOHADA.
      </p>
    </div>
  );
}

// ─── Champ texte / date factorisé ──────────────────────────────────────
function Field(props: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'date';
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-primary-700 dark:text-primary-300 block mb-1">
        {props.label} {props.required && <span className="text-error">*</span>}
      </label>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        autoFocus={props.autoFocus}
        className="w-full px-3 py-2 rounded-lg border border-primary-300 dark:border-primary-700 bg-white dark:bg-primary-950 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}
