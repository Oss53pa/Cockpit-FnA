/**
 * Guide d'utilisation — documentation utilisateur complète de Cockpit FnA.
 *
 * Structure : 8 sections (Premiers pas, Données, Pilotage, Restitution, IA,
 * Collaboration, Admin, FAQ). Recherche full-text + navigation par ancre.
 * Le contenu est en français, orienté utilisateur final (DAF, comptable, contrôleur).
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  HelpCircle, Search, ChevronRight, Rocket, Database, LayoutDashboard,
  FileText, Sparkles, Users as UsersIcon, Shield, MessageCircle,
  CheckCircle2, AlertTriangle, Lightbulb, Keyboard,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

type Section = {
  id: string;
  title: string;
  icon: any;
  intro: string;
  topics: { q: string; a: React.ReactNode; tags?: string[] }[];
};

const SECTIONS: Section[] = [
  {
    id: 'starter',
    title: 'Premiers pas',
    icon: Rocket,
    intro: "Tout ce qu'il faut savoir pour démarrer en moins de 10 minutes.",
    topics: [
      {
        q: 'Créer ma première société',
        tags: ['onboarding', 'société', 'organisation'],
        a: (
          <>
            <p>Allez dans <Link to="/settings" className="text-accent underline">Paramètres → Sociétés</Link> puis cliquez sur <strong>Ajouter une société</strong>. Renseignez :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Raison sociale</strong> — nom commercial complet (ex : SARL EXEMPLE)</li>
              <li><strong>Forme juridique</strong> — SARL, SA, SAS, EI, etc.</li>
              <li><strong>Pays / devise</strong> — XOF par défaut (zone OHADA)</li>
              <li><strong>Numéro fiscal (NIF/IFU)</strong> — facultatif mais recommandé pour les déclarations</li>
            </ul>
            <p className="mt-2">Vous pouvez gérer plusieurs sociétés en parallèle (multi-tenant) — chacune avec ses propres données, exercices, utilisateurs et rapports.</p>
          </>
        ),
      },
      {
        q: 'Configurer un exercice fiscal',
        tags: ['exercice', 'période', 'clôture'],
        a: (
          <>
            <p>Dans <Link to="/settings" className="text-accent underline">Paramètres → Exercices</Link>, créez un exercice (ex : "Exercice 2026") avec sa date de début et de fin. L'app génère automatiquement les 12 périodes mensuelles.</p>
            <p className="mt-2">Vous pouvez clôturer une période une fois la balance validée — elle devient en lecture seule (verrou Dexie). Toute écriture sur une période close est refusée par l'app.</p>
          </>
        ),
      },
      {
        q: 'Importer ma première balance',
        tags: ['import', 'balance', 'GL', 'Excel'],
        a: (
          <>
            <p>Plusieurs formats acceptés via <Link to="/imports" className="text-accent underline">Imports</Link> :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Balance générale</strong> — comptes 1 à 8 avec soldes</li>
              <li><strong>Grand Livre</strong> — écritures détaillées (date, journal, libellé, débit, crédit)</li>
              <li><strong>Balance auxiliaire</strong> — clients ou fournisseurs avec encours</li>
              <li><strong>Balance âgée</strong> — vieillissement par tranches (0-30, 30-60, 60-90, +90 j)</li>
              <li><strong>Plan comptable (COA)</strong> — initialisation depuis un fichier OHADA standard</li>
            </ul>
            <p className="mt-2">Téléchargez un modèle Excel pré-rempli depuis chaque écran d'import, complétez-le, puis glissez-déposez le fichier.</p>
          </>
        ),
      },
      {
        q: 'Comprendre la sidebar et la navigation',
        tags: ['navigation', 'menu'],
        a: (
          <>
            <p>4 grandes sections :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Pilotage</strong> — Accueil, Synthèse, Catalogue de dashboards, Alertes, Plan d'action</li>
              <li><strong>Données</strong> — Plan comptable, Budget, Grand Livre, GL Tiers</li>
              <li><strong>Restitution</strong> — États financiers, Ratios, Reporting, Analytique, Personnaliser CR, Proph3t (IA)</li>
              <li><strong>Admin</strong> — Paramètres, Audit trail, Guide d'utilisation</li>
            </ul>
            <p className="mt-2">Cliquez sur <kbd className="kbd">⇤</kbd> en haut de la sidebar pour la replier (mode icônes uniquement).</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'data',
    title: 'Données comptables',
    icon: Database,
    intro: "Plan comptable, écritures, budget, tiers — fondations de votre comptabilité.",
    topics: [
      {
        q: 'Personnaliser le plan comptable (COA)',
        tags: ['coa', 'plan comptable', 'syscohada'],
        a: (
          <>
            <p>Le plan comptable SYSCOHADA révisé 2017 est pré-installé. Dans <Link to="/coa" className="text-accent underline">Plan comptable</Link>, vous pouvez :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Naviguer dans l'arborescence à 8 classes (Capital, Immobilisations, Stocks, Tiers, Financier, Charges, Produits, Soldes)</li>
              <li>Ajouter des sous-comptes spécifiques à votre activité</li>
              <li>Renommer ou désactiver des comptes inutilisés</li>
              <li>Exporter le plan modifié au format OHADA</li>
            </ul>
          </>
        ),
      },
      {
        q: 'Saisir un budget annuel',
        tags: ['budget', 'prévision'],
        a: (
          <>
            <p>Dans <Link to="/budget" className="text-accent underline">Budget</Link>, choisissez un exercice et une version (V1_initial, V2_revisé, etc.). Pour chaque compte, saisissez le montant prévu mois par mois (douze cellules). L'app calcule automatiquement les écarts entre budget et réel.</p>
            <p className="mt-2">Astuce : utilisez le téléchargement du modèle Excel, complétez hors-ligne, puis ré-importez.</p>
          </>
        ),
      },
      {
        q: 'Lettrer et analyser les tiers',
        tags: ['tiers', 'clients', 'fournisseurs', 'lettrage'],
        a: (
          <>
            <p>Importez vos balances clients et fournisseurs via <Link to="/import-tiers" className="text-accent underline">GL Tiers</Link>. L'app calcule automatiquement :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>DSO / DPO</strong> — délai de paiement clients / fournisseurs</li>
              <li><strong>Vieillissement</strong> — répartition encours 0-30 / 30-60 / 60-90 / +90 jours</li>
              <li><strong>Top 10 clients / fournisseurs</strong> par CA ou par encours</li>
              <li><strong>Concentration</strong> — % du CA réalisé avec les N premiers clients</li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    id: 'pilotage',
    title: 'Pilotage & dashboards',
    icon: LayoutDashboard,
    intro: 'Visualiser, alerter, agir — toute la couche pilotage temps réel.',
    topics: [
      {
        q: 'Utiliser la Synthèse',
        tags: ['dashboard', 'synthèse', 'kpi'],
        a: (
          <>
            <p>La <Link to="/dashboard/home" className="text-accent underline">Synthèse</Link> agrège vos KPI principaux : CA, marge, trésorerie, FR/BFR, ratios clés, top alertes. C'est la première chose à ouvrir le matin.</p>
          </>
        ),
      },
      {
        q: 'Configurer des alertes automatiques',
        tags: ['alertes', 'seuils', 'ratios'],
        a: (
          <>
            <p>Dans <Link to="/alerts" className="text-accent underline">Alertes</Link>, définissez des seuils sur les ratios (liquidité, autonomie financière, marge nette, etc.). Quand un seuil est franchi, une alerte est créée automatiquement.</p>
            <p className="mt-2">3 vues disponibles : Liste, Cartes, Tableau, Kanban (par criticité). Chaque alerte peut être acquittée et générer un plan d'action.</p>
          </>
        ),
      },
      {
        q: "Construire un plan d'action",
        tags: ['actions', 'kanban', 'plan'],
        a: (
          <>
            <p>Sur <Link to="/actions" className="text-accent underline">Plan d'action</Link>, transformez les alertes en actions concrètes avec responsable, échéance, budget alloué et critères de succès. Vue Kanban drag & drop pour suivre l'avancement (À faire / En cours / Terminé).</p>
          </>
        ),
      },
      {
        q: 'Catalogue de dashboards',
        tags: ['catalogue', 'dashboards', 'analyses'],
        a: (
          <>
            <p>Le <Link to="/dashboards" className="text-accent underline">Catalogue</Link> liste 30+ dashboards SYSCOHADA prêts à l'emploi : Z-Score, Pareto, Break-even, Cashflow forecast, TFT mensuel, CAF, TAFIRE, Audit trail visualizer, etc. Filtrez par thème (Liquidité, Rentabilité, Audit, Trésorerie).</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'restitution',
    title: 'Restitution & rapports',
    icon: FileText,
    intro: 'États financiers SYSCOHADA, ratios, reporting personnalisable.',
    topics: [
      {
        q: 'Générer les états financiers',
        tags: ['états', 'bilan', 'compte de résultat', 'tafire'],
        a: (
          <>
            <p>Dans <Link to="/states" className="text-accent underline">États financiers</Link>, génération automatique du Bilan, Compte de résultat, TAFIRE et Notes annexes selon le système Normal ou SMT. Export PDF / Excel disponible.</p>
          </>
        ),
      },
      {
        q: 'Calculer et suivre les ratios',
        tags: ['ratios', 'liquidité', 'rentabilité'],
        a: (
          <>
            <p><Link to="/ratios" className="text-accent underline">Ratios</Link> calcule 25+ ratios SYSCOHADA classés en : Structure, Liquidité, Rentabilité, Activité, Endettement. Statut visuel par ratio (Conforme / Vigilance / Alerte) avec valeur cible et historique mensuel.</p>
          </>
        ),
      },
      {
        q: 'Créer un rapport personnalisé',
        tags: ['rapport', 'reporting', 'personnalisé'],
        a: (
          <>
            <p>Dans <Link to="/reports" className="text-accent underline">Reporting</Link>, partez d'un des 13 modèles (Hebdo, Mensuel, Trimestriel, Annuel, CFO, Bank, Audit, Shareholders, Board, Fiscal, Closing, Cash) ou commencez de zéro. Drag & drop de blocs : titre, KPI, table, graphique, commentaire.</p>
            <p className="mt-2">Une fois finalisé : export PDF / PowerPoint, ou envoi par email à plusieurs destinataires (voir section Collaboration).</p>
          </>
        ),
      },
      {
        q: 'Personnaliser un compte de résultat',
        tags: ['cr-editor', 'compte de résultat'],
        a: (
          <>
            <p>L'éditeur <Link to="/cr-editor" className="text-accent underline">Personnaliser CR</Link> permet de construire un compte de résultat sur-mesure par drag & drop des comptes du plan. Idéal pour le reporting groupe avec retraitements spécifiques.</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'ai',
    title: 'IA & Proph3t',
    icon: Sparkles,
    intro: "Assistance IA pour analyser, commenter et anticiper votre activité.",
    topics: [
      {
        q: "Activer l'IA (Ollama local OU Cloud)",
        tags: ['ia', 'ollama', 'openai', 'cloud'],
        a: (
          <>
            <p>Dans <Link to="/settings" className="text-accent underline">Paramètres → IA &amp; Proph3t</Link>, choisissez :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Ollama (local)</strong> — gratuit, privé, fonctionne hors-ligne. Téléchargez Ollama, installez un modèle (llama3.1:8b, qwen2.5:7b…), démarrez le serveur. <strong>Ne fonctionne pas en prod web.</strong></li>
              <li><strong>Cloud (OpenAI / Mistral / Groq / Together / Anthropic)</strong> — clé API requise, fonctionne en prod. 5 presets fournis.</li>
            </ul>
            <p className="mt-2">Le bouton "Tester la connexion" valide la configuration en 1 clic.</p>
          </>
        ),
      },
      {
        q: "Utiliser Proph3t (chat IA contextuel)",
        tags: ['proph3t', 'chat', 'analyse'],
        a: (
          <>
            <p><Link to="/ai" className="text-accent underline">Proph3t</Link> est l'assistant IA qui a accès à TOUTES vos données comptables. Posez-lui des questions en langage naturel :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1 italic">
              <li>"Pourquoi ma marge nette a baissé en Q2 ?"</li>
              <li>"Quel est le top 3 des charges qui ont le plus augmenté ?"</li>
              <li>"Génère le commentaire du Comité de Direction"</li>
            </ul>
          </>
        ),
      },
      {
        q: 'IA contextuelle dans les rapports',
        tags: ['ia', 'commentaire', 'analyse'],
        a: (
          <>
            <p>Sur les écrans Alertes et Reporting, le bouton <strong>"Générer un commentaire IA"</strong> rédige automatiquement une analyse de la situation, des causes probables, et des recommandations.</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'collab',
    title: 'Collaboration & emails',
    icon: MessageCircle,
    intro: "Annotations, validations, envoi de rapports par email.",
    topics: [
      {
        q: 'Sidebar Activité (annotations & commentaires)',
        tags: ['activité', 'annotation', 'commentaire'],
        a: (
          <>
            <p>Le bouton flottant à droite ouvre la sidebar Activité. 4 types d'éléments :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Annotation</strong> — note libre attachée à un écran</li>
              <li><strong>Commentaire</strong> — discussion entre utilisateurs</li>
              <li><strong>Correction</strong> — anomalie détectée à corriger</li>
              <li><strong>Validation</strong> — étape de revue/approbation</li>
            </ul>
            <p className="mt-2">3 statuts : Ouvert, Résolu, Archivé. Filtres par type, scope (page courante vs. toutes), résolu/non résolu.</p>
          </>
        ),
      },
      {
        q: "Inviter un utilisateur par email",
        tags: ['utilisateurs', 'invitation', 'email'],
        a: (
          <>
            <p>Dans <Link to="/settings" className="text-accent underline">Paramètres → Utilisateurs &amp; rôles</Link>, cliquez sur <strong>Nouvel utilisateur</strong>. Saisissez nom, email, choisissez un rôle (Admin, DAF, Contrôleur, Comptable, Direction, Auditeur, Lecture seule, Personnalisé), puis cochez "Envoyer une invitation par email".</p>
            <p className="mt-2">L'utilisateur recevra un email HTML avec le lien de l'application, son rôle et ses sociétés autorisées.</p>
          </>
        ),
      },
      {
        q: "Envoyer un rapport par email (Resend)",
        tags: ['email', 'resend', 'rapport'],
        a: (
          <>
            <p>Dans <Link to="/reports" className="text-accent underline">Reporting</Link>, ouvrez un rapport finalisé puis cliquez sur <strong>Diffuser</strong>. Ajoutez les destinataires, un message d'introduction, et l'app envoie un email HTML pour chacun.</p>
            <p className="mt-2">Pré-requis : configurez Resend dans <Link to="/settings" className="text-accent underline">Paramètres → Modèles d'emails</Link> (clé API + domaine vérifié). Voir l'encart "Configuration de l'envoi (Resend)".</p>
          </>
        ),
      },
      {
        q: 'Workflow de validation',
        tags: ['validation', 'review', 'workflow'],
        a: (
          <>
            <p>Avant de diffuser un rapport, demandez une revue interne à un collègue : un email de "Demande de revue" est envoyé avec un lien direct vers le rapport et un délai. Le valideur peut commenter, demander des corrections, ou approuver.</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'admin',
    title: 'Admin & sécurité',
    icon: Shield,
    intro: "Verrou admin, rôles, audit trail, multi-tenant, conformité.",
    topics: [
      {
        q: 'Verrou par mot de passe sur Paramètres',
        tags: ['admin', 'sécurité', 'mot de passe'],
        a: (
          <>
            <p>Au premier accès aux Paramètres, l'app demande de définir un mot de passe administrateur (SHA-256 + sel, stocké en local). Une session valide 30 minutes après déverrouillage, puis re-prompt automatique.</p>
            <p className="mt-2">5 tentatives échouées = lock 1 minute. Bouton "Réinitialiser (factory reset)" disponible mais efface tous les paramètres locaux.</p>
          </>
        ),
      },
      {
        q: 'Audit trail (chaîne de hashes SHA-256)',
        tags: ['audit', 'traçabilité', 'hash'],
        a: (
          <>
            <p><Link to="/audit" className="text-accent underline">Audit trail</Link> enregistre TOUTES les écritures du Grand Livre avec un hash SHA-256 chaîné — toute modification d'une écriture passée casserait la chaîne. Conformité avec les exigences SYSCOHADA / Big4.</p>
          </>
        ),
      },
      {
        q: 'API tokens & webhooks',
        tags: ['api', 'token', 'webhook', 'intégration'],
        a: (
          <>
            <p><Link to="/settings" className="text-accent underline">Paramètres → API &amp; Webhooks</Link> :</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Tokens</strong> — créez des tokens scopés (read / write / admin) pour les intégrations tierces (ERP, BI). Hash SHA-256 stocké, secret révélé une seule fois.</li>
              <li><strong>Webhooks</strong> — recevez une notif HTTP sur 6 événements (gl.imported, report.published, alert.triggered, period.closed, user.invited, export.generated). Signature HMAC pour vérifier l'origine.</li>
              <li><strong>11 endpoints REST</strong> documentés (GET balance, bilan, ratios… + POST imports, alerts, activities).</li>
            </ul>
          </>
        ),
      },
      {
        q: 'Multi-tenant (plusieurs sociétés)',
        tags: ['multi-tenant', 'société', 'organisation'],
        a: (
          <>
            <p>Chaque utilisateur peut avoir accès à plusieurs sociétés. Toutes les données sont scopées par <code className="text-[10px] bg-primary-100 dark:bg-primary-800 px-1 rounded">orgId</code> en base et localStorage — pas de fuite possible entre sociétés.</p>
            <p className="mt-2">Le sélecteur de société est en haut de l'app — bascule instantanée sans rechargement.</p>
          </>
        ),
      },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ & raccourcis',
    icon: Lightbulb,
    intro: 'Questions fréquentes et raccourcis pour gagner du temps.',
    topics: [
      {
        q: 'Raccourcis clavier',
        tags: ['raccourci', 'clavier', 'shortcut'],
        a: (
          <div className="space-y-1.5">
            <p className="text-sm">Ces raccourcis fonctionnent partout dans l'app :</p>
            <table className="text-xs w-full">
              <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
                <tr><td className="py-1.5"><kbd className="kbd">Cmd/Ctrl</kbd> + <kbd className="kbd">K</kbd></td><td>Recherche universelle</td></tr>
                <tr><td className="py-1.5"><kbd className="kbd">Cmd/Ctrl</kbd> + <kbd className="kbd">/</kbd></td><td>Ouvrir Proph3t (IA)</td></tr>
                <tr><td className="py-1.5"><kbd className="kbd">Cmd/Ctrl</kbd> + <kbd className="kbd">Enter</kbd></td><td>Envoyer un commentaire dans la sidebar Activité</td></tr>
                <tr><td className="py-1.5"><kbd className="kbd">Esc</kbd></td><td>Fermer la modale active</td></tr>
                <tr><td className="py-1.5"><kbd className="kbd">⇤</kbd></td><td>Replier / déplier la sidebar</td></tr>
              </tbody>
            </table>
          </div>
        ),
      },
      {
        q: 'Données stockées localement vs. cloud ?',
        tags: ['stockage', 'dexie', 'supabase', 'données'],
        a: (
          <>
            <p>Cockpit FnA est <strong>local-first</strong> : toutes vos données sont stockées dans IndexedDB (navigateur) via Dexie. Aucune donnée n'est envoyée au cloud par défaut.</p>
            <p className="mt-2">Si Supabase est configuré, vos données peuvent être synchronisées pour usage multi-poste / sauvegarde — ce reste optionnel.</p>
          </>
        ),
      },
      {
        q: 'Réinitialiser toutes les données (factory reset)',
        tags: ['reset', 'réinitialiser', 'effacer'],
        a: (
          <>
            <p>Dans <Link to="/settings" className="text-accent underline">Paramètres → Données</Link>, le bouton <strong>"Réinitialiser toutes les données"</strong> efface IndexedDB et localStorage. Action irréversible — exportez vos données avant si besoin.</p>
          </>
        ),
      },
      {
        q: 'Mode sombre',
        tags: ['thème', 'dark', 'mode sombre'],
        a: (
          <>
            <p>Toggle clair / sombre dans <Link to="/settings" className="text-accent underline">Paramètres → Apparence</Link>. 4 palettes de couleurs disponibles. Le choix est mémorisé localement.</p>
          </>
        ),
      },
      {
        q: 'Que faire en cas de bug ?',
        tags: ['bug', 'support', 'erreur'],
        a: (
          <>
            <p>1. Ouvrez la console du navigateur (F12 → Console) et cherchez les erreurs en rouge.</p>
            <p>2. Vérifiez l'audit trail (<Link to="/audit" className="text-accent underline">/audit</Link>) — la dernière action enregistrée donne souvent un indice.</p>
            <p>3. Essayez en navigation privée pour isoler un problème de cache / extension.</p>
            <p>4. En dernier recours, exportez vos données puis réinitialisez (factory reset).</p>
          </>
        ),
      },
    ],
  },
];

export default function Guide() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      topics: s.topics.filter((t) =>
        t.q.toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
      ),
    })).filter((s) => s.topics.length > 0);
  }, [search]);

  const totalTopics = SECTIONS.reduce((acc, s) => acc + s.topics.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Guide d'utilisation"
        subtitle={`Documentation complète — ${totalTopics} sujets dans ${SECTIONS.length} sections`}
        action={
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un sujet…"
              className="input !pl-8 w-72"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Nav latérale */}
        <Card padded className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Sections</p>
          <nav className="space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const count = filtered.find((f) => f.id === s.id)?.topics.length ?? 0;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveSection(s.id);
                    document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
                    activeSection === s.id
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800',
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 truncate">{s.title}</span>
                  {search && count > 0 && <Badge variant="default">{count}</Badge>}
                </a>
              );
            })}
          </nav>

          <div className="mt-4 pt-3 border-t border-primary-200 dark:border-primary-800">
            <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-2">Liens rapides</p>
            <div className="space-y-0.5 text-xs">
              <Link to="/home" className="block px-2 py-1 rounded hover:bg-primary-100 dark:hover:bg-primary-800">Accueil</Link>
              <Link to="/imports" className="block px-2 py-1 rounded hover:bg-primary-100 dark:hover:bg-primary-800">Imports</Link>
              <Link to="/dashboards" className="block px-2 py-1 rounded hover:bg-primary-100 dark:hover:bg-primary-800">Catalogue de dashboards</Link>
              <Link to="/settings" className="block px-2 py-1 rounded hover:bg-primary-100 dark:hover:bg-primary-800">Paramètres</Link>
            </div>
          </div>
        </Card>

        {/* Contenu */}
        <div className="space-y-4">
          {filtered.length === 0 && (
            <Card padded>
              <div className="text-center py-8">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-warning" />
                <p className="text-primary-500">Aucun sujet ne correspond à "<strong>{search}</strong>"</p>
                <button onClick={() => setSearch('')} className="btn-outline mt-3">Effacer la recherche</button>
              </div>
            </Card>
          )}

          {filtered.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.id} id={section.id} className="scroll-mt-4">
                <Card>
                  <div className="px-5 pt-5 pb-3 border-b border-primary-200 dark:border-primary-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-primary-900 dark:text-primary-50">{section.title}</h2>
                        <p className="text-xs text-primary-500 mt-0.5">{section.intro}</p>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-primary-200 dark:divide-primary-800">
                    {section.topics.map((t, i) => (
                      <Topic key={i} q={t.q} tags={t.tags}>{t.a}</Topic>
                    ))}
                  </div>
                </Card>
              </section>
            );
          })}

          <Card padded>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold mb-1">Vous n'avez pas trouvé votre réponse ?</p>
                <p className="text-xs text-primary-600 dark:text-primary-300 leading-relaxed">
                  Demandez à <Link to="/ai" className="text-accent underline">Proph3t</Link> — il a accès à toutes vos données et peut répondre à des questions plus spécifiques (ex : "Pourquoi mon ratio d'autonomie financière est en alerte ?"). Sinon, ouvrez une annotation via la sidebar Activité.
                </p>
              </div>
            </div>
          </Card>

          <p className="text-center text-[11px] text-primary-400 pt-2">
            CockPit F&amp;A · SYSCOHADA révisé 2017 — une application <a href="https://atlas-studio.app" target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent transition-colors">Atlas Studio</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Topic({ q, tags, children }: { q: string; tags?: string[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 flex items-start gap-2 text-left hover:bg-primary-100/50 dark:hover:bg-primary-800/30 transition-colors"
      >
        <ChevronRight className={clsx('w-4 h-4 text-primary-400 shrink-0 mt-0.5 transition-transform', open && 'rotate-90')} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary-900 dark:text-primary-100">{q}</p>
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-800 text-primary-500">{t}</span>
              ))}
            </div>
          )}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-4 pl-11 text-sm text-primary-700 dark:text-primary-300 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
