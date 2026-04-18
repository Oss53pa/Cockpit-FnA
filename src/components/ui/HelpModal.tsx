// Modale « Objet & mode d'emploi » — ouverte depuis la navbar
import { useState } from 'react';
import { Target, BookOpen, Upload, LayoutDashboard, FileSpreadsheet, BarChart3, FileText, Bot, Wallet, AlertTriangle, Settings as SettingsIcon } from 'lucide-react';
import { Modal } from './Modal';
import { TabSwitch } from './TabSwitch';

type Tab = 'objet' | 'mode';

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('objet');

  return (
    <Modal open={open} onClose={onClose} title="Cockpit Finance & Accounting" subtitle="Objet et mode d'emploi" size="lg">
      <TabSwitch
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'objet', label: 'Objet' },
          { key: 'mode', label: "Mode d'emploi" },
        ]}
      />

      {tab === 'objet' && (
        <div className="space-y-4 mt-4 text-sm text-primary-700 dark:text-primary-200">
          <Section icon={<Target className="w-4 h-4" />} title="Raison d'être">
            Cockpit est un outil de pilotage financier (FP&amp;A) dédié aux PME et groupes appliquant le référentiel
            SYSCOHADA révisé. Il transforme vos données comptables brutes (balance, Grand Livre) en états
            financiers, ratios, rapports et tableaux de bord prêts à être présentés à la direction et aux parties prenantes.
          </Section>

          <Section icon={<BookOpen className="w-4 h-4" />} title="Pour qui ?">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Direction financière &amp; DAF</strong> : pilotage, budgets, reporting mensuel/trimestriel.</li>
              <li><strong>Cabinets d'expertise comptable</strong> : production des états et du dossier financier multi-clients.</li>
              <li><strong>Contrôle de gestion</strong> : analyse budgétaire, comptabilité analytique, alertes.</li>
              <li><strong>Direction générale</strong> : dashboards synthétiques, KPI clés, alertes, scénarios.</li>
            </ul>
          </Section>

          <Section icon={<LayoutDashboard className="w-4 h-4" />} title="Ce que fait Cockpit">
            <ul className="list-disc pl-5 space-y-1">
              <li>Imports multi-formats (Excel, CSV, exports ERP) de la balance et du Grand Livre.</li>
              <li>Production automatique des états SYSCOHADA : Bilan, Compte de résultat, SIG, Flux de trésorerie, TAFIRE, Variation des capitaux propres.</li>
              <li>Ratios financiers, analyse budgétaire (Budget vs Réalisé), comptabilité analytique.</li>
              <li>Dashboards par domaine (général, industrie, commerce, services…) et studio de rapports PDF/Excel/PowerPoint.</li>
              <li><em>Proph3t</em> : détection d'anomalies, benchmark sectoriel, commentaires automatiques et prédictions.</li>
              <li>Audit trail, multi-sociétés, multi-exercices — 100&nbsp;% local (offline-first, IndexedDB).</li>
            </ul>
          </Section>
        </div>
      )}

      {tab === 'mode' && (
        <div className="space-y-3 mt-4 text-sm text-primary-700 dark:text-primary-200">
          <Step n={1} icon={<SettingsIcon className="w-4 h-4" />} title="Créer / choisir une société">
            Dans <strong>Paramètres → Sociétés</strong>, créez votre entité (secteur, devise, exercice). Sélectionnez-la ensuite via le menu déroulant en haut à droite.
          </Step>
          <Step n={2} icon={<Upload className="w-4 h-4" />} title="Importer vos données">
            Allez dans <strong>Imports</strong>, déposez votre balance et/ou votre Grand Livre. Cockpit détecte les colonnes ; vous pouvez mapper manuellement si besoin. Les écritures sont horodatées et rattachées à la période active.
          </Step>
          <Step n={3} icon={<FileSpreadsheet className="w-4 h-4" />} title="Consulter les états financiers">
            <strong>États</strong> affiche Bilan, Compte de résultat, SIG, Flux de trésorerie, TAFIRE — avec comparaison N/N-1 et vs budget.
          </Step>
          <Step n={4} icon={<BarChart3 className="w-4 h-4" />} title="Analyser ratios et dashboards">
            <strong>Ratios</strong> évalue structure financière, liquidité, rentabilité, activité. <strong>Dashboards</strong> propose des vues synthétiques par métier avec KPIs, charts et alertes.
          </Step>
          <Step n={5} icon={<Wallet className="w-4 h-4" />} title="Piloter le budget">
            <strong>Budget</strong> permet d'importer/saisir un budget et de suivre les écarts par section (Charges/Produits, Financier, Exploitation).
          </Step>
          <Step n={6} icon={<AlertTriangle className="w-4 h-4" />} title="Surveiller les alertes">
            La cloche et <strong>Alertes</strong> remontent les ratios dégradés et les variations anormales. <strong>Actions</strong> trace les plans d'action associés.
          </Step>
          <Step n={7} icon={<FileText className="w-4 h-4" />} title="Produire les rapports">
            <strong>Rapports</strong> est un studio de reporting : glissez des blocs (texte, table, dashboard, image), appliquez une palette et exportez en PDF ou PowerPoint.
          </Step>
          <Step n={8} icon={<Bot className="w-4 h-4" />} title="Utiliser l'IA (Proph3t)">
            <strong>AI</strong> détecte les anomalies, compare aux normes sectorielles SYSCOHADA, produit un commentaire de gestion et des prédictions. Fonctionne en local via Ollama si configuré.
          </Step>

          <div className="mt-5 p-3 rounded-lg bg-primary-100 dark:bg-primary-800/50 text-xs">
            <strong>Astuce&nbsp;:</strong> toutes les données restent sur votre appareil. Utilisez <strong>Paramètres → Données</strong> pour exporter/importer une sauvegarde complète.
          </div>
        </div>
      )}
    </Modal>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 font-semibold text-primary-900 dark:text-primary-100">
        {icon}
        <span>{title}</span>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-900 dark:bg-primary-100 text-primary-50 dark:text-primary-900 flex items-center justify-center text-xs font-bold num">
        {n}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 font-semibold text-primary-900 dark:text-primary-100 mb-0.5">
          {icon}
          <span>{title}</span>
        </div>
        <div className="text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
