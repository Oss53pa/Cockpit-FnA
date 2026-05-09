/**
 * D10 — Dashboard Refacturation FG
 *
 * Placeholder Phase 2 : nécessite le moteur de répartition (clés de
 * répartition CA / heures / direct → projets) qui n'est pas encore livré.
 *
 * Quand le moteur sera prêt :
 *   - Configuration : clé par centre FG (CA / heures / direct / forfait)
 *   - Exécution mensuelle : calcul des montants à refacturer
 *   - Écritures analytiques générées (méthode 'allocation' à ajouter)
 *   - Tableau Source FG → Projet bénéficiaire × période
 *   - Comparatif Coût direct vs Coût complet par projet
 *   - Simulation : impact d'un changement de clé en temps réel
 */
import { Link } from 'react-router-dom';
import { GitBranch, Construction, Sparkles } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';

export default function AnalyticalFGAllocation() {
  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="D10 — Refacturation FG"
        subtitle="Répartition des frais généraux sur les projets selon clés de répartition"
        icon={<GitBranch className="w-5 h-5" />}
        back="/dashboards"
      />

      <Card padded>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
            <Construction className="w-6 h-6 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-primary-900 dark:text-primary-100 mb-1">
              Module en développement (Phase 2)
            </h3>
            <p className="text-sm text-primary-600 dark:text-primary-400">
              La refacturation analytique des frais généraux vers les projets nécessite
              le <strong>moteur de répartition</strong> — actuellement en cours de spec.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Périmètre prévu" padded>
        <ul className="space-y-2 text-sm text-primary-700 dark:text-primary-300">
          <li className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <span>
              <strong>Clés de répartition</strong> par centre FG : CA, heures imputées,
              forfait, % direct, ou clé personnalisée par projet.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <span>
              <strong>Génération automatique</strong> des écritures analytiques de refacturation
              en fin de période (mensuel ou trimestriel).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <span>
              <strong>Tableau Source FG → Projet</strong> avec montant refacturé,
              clé utilisée, % de la clé.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <span>
              <strong>Comparatif Coût direct vs Coût complet</strong> par projet pour
              piloter la rentabilité réelle.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <span>
              <strong>Simulation</strong> : impact d'un changement de clé sur la marge
              de chaque projet, en temps réel.
            </span>
          </li>
        </ul>
      </Card>

      <Card padded>
        <p className="text-xs text-primary-500">
          En attendant, vous pouvez visualiser les FG <strong>non alloués</strong> dans la{' '}
          <Link to="/analytical?tab=wbs" className="text-accent underline hover:opacity-80">
            Vue WBS du module Analytique
          </Link>{' '}
          (bandeau d'alerte en bas de page).
        </p>
      </Card>
    </div>
  );
}
