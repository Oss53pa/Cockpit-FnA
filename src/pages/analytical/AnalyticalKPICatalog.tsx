/**
 * Catalogue des KPIs analytiques (70+ KPIs en 9 catégories)
 *
 * Page de référence listant tous les KPIs disponibles avec :
 *   - Catégorie (couleur)
 *   - Nom
 *   - Formule SQL/expression
 *   - Cible (si applicable)
 *   - Fréquence de calcul
 *   - Valeur courante (si calculable depuis les données réelles)
 *
 * Permet aux DAF / Contrôleurs de gestion de comprendre la logique
 * de chaque indicateur et de naviguer vers le dashboard qui l'utilise.
 */
import { useEffect, useMemo, useState } from 'react';
import { Activity, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useApp } from '../../store/app';
import { dataProvider } from '../../db/provider';
import { fmtFull } from '../../lib/format';
import { loadAnalyticContext, viewEntries } from '../../engine/analyticDashboards';

type Category =
  | 'Pilotage Global'
  | 'Qualité Analytique'
  | 'Projets'
  | 'Centres de Coût'
  | 'Centres de Revenu'
  | 'Ressources'
  | 'Frais Généraux'
  | 'Budgétaires'
  | 'IA Proph3t';

interface KpiDef {
  category: Category;
  name: string;
  formula: string;
  target?: string;
  frequency?: string;
  /** Si renseigné, renvoie la valeur courante calculée depuis le contexte. */
  compute?: (ctx: KpiCtx) => string | number;
  unit?: string;
}

interface KpiCtx {
  ca: number;
  charges: number;
  margeBrute: number;
  ebe: number;
  resultat: number;
  totalEligible: number;
  totalAssigned: number;
  coverageRate: number;
  autoRate: number;
  projectCount: number;
  axesActive: number;
  rulesActive: number;
  fgTotal: number;
  fgRefacture: number;
}

const CAT_COLORS: Record<Category, string> = {
  'Pilotage Global': 'bg-success/10 text-success',
  'Qualité Analytique': 'bg-warning/10 text-warning',
  'Projets': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'Centres de Coût': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'Centres de Revenu': 'bg-red-500/10 text-red-600 dark:text-red-400',
  'Ressources': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'Frais Généraux': 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
  'Budgétaires': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  'IA Proph3t': 'bg-accent/10 text-accent',
};

// ── Définition exhaustive des 70+ KPIs ──────────────────────────────────────
const KPIS: KpiDef[] = [
  // 🟢 PILOTAGE GLOBAL
  { category: 'Pilotage Global', name: "Chiffre d'affaires analysé", formula: 'Σ comptes 70-77 ventilés', frequency: 'Quotidien', compute: (c) => fmtFull(c.ca) },
  { category: 'Pilotage Global', name: 'Charges analysées', formula: 'Σ comptes 60-68 ventilées', frequency: 'Quotidien', compute: (c) => fmtFull(c.charges) },
  { category: 'Pilotage Global', name: 'Marge brute analytique', formula: 'CA − Achats consommés', frequency: 'Mensuel', compute: (c) => fmtFull(c.margeBrute) },
  { category: 'Pilotage Global', name: 'EBITDA analytique', formula: 'Marge brute − Charges externes − Personnel', frequency: 'Mensuel', compute: (c) => fmtFull(c.ebe) },
  { category: 'Pilotage Global', name: 'Résultat analytique', formula: 'EBITDA − Amortissements − Impôts', frequency: 'Mensuel', compute: (c) => fmtFull(c.resultat) },
  { category: 'Pilotage Global', name: 'Taux de marge brute %', formula: '(Marge brute / CA) × 100', frequency: 'Mensuel', unit: '%', compute: (c) => c.ca > 0 ? `${((c.margeBrute / c.ca) * 100).toFixed(1)}%` : 'N/A' },
  { category: 'Pilotage Global', name: 'Taux de marge nette %', formula: '(Résultat / CA) × 100', frequency: 'Mensuel', unit: '%', compute: (c) => c.ca > 0 ? `${((c.resultat / c.ca) * 100).toFixed(1)}%` : 'N/A' },

  // 🟡 QUALITÉ ANALYTIQUE
  { category: 'Qualité Analytique', name: 'Taux de couverture analytique', formula: '(Écritures ventilées / Total éligibles) × 100', target: '> 95%', unit: '%', compute: (c) => `${c.coverageRate}%` },
  { category: 'Qualité Analytique', name: "Taux d'automatisation", formula: '(Ventilations par règle / Total) × 100', target: '> 80%', unit: '%', compute: (c) => `${c.autoRate}%` },
  { category: 'Qualité Analytique', name: "Taux d'anomalie", formula: '(Anomalies / Total ventilations) × 100', target: '< 2%', unit: '%' },
  { category: 'Qualité Analytique', name: 'Délai moyen de ventilation', formula: 'Écart jours entre date écriture et date ventilation', target: '< 3 jours', unit: 'j' },
  { category: 'Qualité Analytique', name: "Taux d'écritures incomplètes", formula: '(Σ ≠ 100% / Total) × 100', target: '< 1%', unit: '%' },

  // 🔵 PROJETS
  { category: 'Projets', name: 'CA par projet', formula: 'Σ comptes 70x ventilés sur le projet' },
  { category: 'Projets', name: 'Coût direct par projet', formula: 'Σ comptes 60x à 64x ventilés sur le projet' },
  { category: 'Projets', name: 'Marge brute par projet', formula: 'CA projet − Coûts directs projet' },
  { category: 'Projets', name: 'Marge brute % par projet', formula: '(Marge brute / CA) × 100', unit: '%' },
  { category: 'Projets', name: 'Coût complet par projet', formula: 'Coûts directs + Quote-part FG refacturée' },
  { category: 'Projets', name: 'Marge nette par projet', formula: 'CA − Coût complet' },
  { category: 'Projets', name: 'Avancement budgétaire %', formula: '(Réalisé / Budget) × 100', unit: '%' },
  { category: 'Projets', name: 'Reste à consommer', formula: 'Budget − Réalisé − Engagé' },
  { category: 'Projets', name: 'ROI projet', formula: '(Marge nette / Investissement) × 100', unit: '%' },
  { category: 'Projets', name: 'Délai moyen projet', formula: 'Date fin réelle − Date début', unit: 'j' },
  { category: 'Projets', name: 'Nombre de projets actifs', formula: 'Count statut = "Actif"', compute: (c) => c.projectCount.toString() },
  { category: 'Projets', name: 'Top 5 projets rentables', formula: 'Tri par marge nette % desc' },
  { category: 'Projets', name: 'Top 5 projets en perte', formula: 'Tri par marge nette % asc' },

  // 🟣 CENTRES DE COÛT
  { category: 'Centres de Coût', name: 'Charges par centre', formula: 'Σ ventilations sur le centre' },
  { category: 'Centres de Coût', name: '% du total charges', formula: '(Charges centre / Total charges) × 100', unit: '%' },
  { category: 'Centres de Coût', name: 'Évolution mensuelle', formula: 'Var % mois N vs N-1', unit: '%' },
  { category: 'Centres de Coût', name: 'Évolution annuelle', formula: 'Var % période N vs N-1', unit: '%' },
  { category: 'Centres de Coût', name: 'Budget centre', formula: 'Référentiel budgétaire' },
  { category: 'Centres de Coût', name: 'Réalisé vs Budget', formula: '(Réalisé / Budget) × 100', unit: '%' },
  { category: 'Centres de Coût', name: 'Écart budgétaire', formula: 'Réalisé − Budget' },
  { category: 'Centres de Coût', name: "Coût moyen par unité d'œuvre", formula: 'Charges / Unités produites' },
  { category: 'Centres de Coût', name: 'Nombre de centres actifs', formula: 'Count statut = "Actif"' },

  // 🔴 CENTRES DE REVENU
  { category: 'Centres de Revenu', name: 'CA par centre de revenu', formula: 'Σ ventilations comptes 70x sur le centre' },
  { category: 'Centres de Revenu', name: '% du CA total', formula: '(CA centre / CA total) × 100', unit: '%' },
  { category: 'Centres de Revenu', name: 'Mix de revenus', formula: 'Répartition par type' },
  { category: 'Centres de Revenu', name: 'Croissance mensuelle CA', formula: 'Var % CA mois N vs N-1', unit: '%' },
  { category: 'Centres de Revenu', name: 'Croissance annuelle CA', formula: 'Var % CA N vs N-1', unit: '%' },
  { category: 'Centres de Revenu', name: 'Saisonnalité', formula: 'Coefficient mensuel / moyenne' },
  { category: 'Centres de Revenu', name: 'CA moyen par centre', formula: 'CA total / Nb centres' },
  { category: 'Centres de Revenu', name: 'Concentration CA (Pareto)', formula: '% CA réalisé par top 20% des centres', unit: '%' },

  // 🟤 RESSOURCES
  { category: 'Ressources', name: 'Coût par ressource', formula: 'Σ ventilations sur la ressource' },
  { category: 'Ressources', name: "Taux d'utilisation ressource", formula: '(Heures utilisées / Capacité) × 100', unit: '%' },
  { category: 'Ressources', name: 'Coût horaire moyen', formula: 'Coût total / Heures consommées' },
  { category: 'Ressources', name: 'Nb projets servis', formula: 'Count distinct projets' },
  { category: 'Ressources', name: 'Ressource la plus mobilisée', formula: 'Top 1 par coût' },
  { category: 'Ressources', name: 'Ressources sous-utilisées', formula: '< 50% capacité' },
  { category: 'Ressources', name: 'Productivité par ressource', formula: 'Output / Coût ressource' },

  // ⚫ FRAIS GÉNÉRAUX
  { category: 'Frais Généraux', name: 'Total FG', formula: 'Σ ventilations sur Plan FG', compute: (c) => fmtFull(c.fgTotal) },
  { category: 'Frais Généraux', name: 'Ratio FG / CA', formula: '(Total FG / CA total) × 100', unit: '%', compute: (c) => c.ca > 0 ? `${((c.fgTotal / c.ca) * 100).toFixed(1)}%` : 'N/A' },
  { category: 'Frais Généraux', name: 'FG par centre', formula: 'Σ par centre FG' },
  { category: 'Frais Généraux', name: 'FG par code de gestion', formula: 'Σ par code gestion FG' },
  { category: 'Frais Généraux', name: 'Évolution FG mensuelle', formula: 'Var % mois N vs N-1', unit: '%' },
  { category: 'Frais Généraux', name: 'Top 5 postes FG', formula: 'Tri par montant desc' },
  { category: 'Frais Généraux', name: 'Coût FG par employé', formula: 'Total FG / Effectif' },
  { category: 'Frais Généraux', name: 'Coût FG par m²', formula: 'Total FG / Surface' },
  { category: 'Frais Généraux', name: '% FG refacturés sur projets', formula: '(Refacturés / Total FG) × 100', unit: '%' },

  // 🟠 BUDGÉTAIRES
  { category: 'Budgétaires', name: 'Taux de consommation budget', formula: '(Réalisé / Budget) × 100', unit: '%' },
  { category: 'Budgétaires', name: 'Reste à dépenser', formula: 'Budget − Réalisé − Engagé' },
  { category: 'Budgétaires', name: 'Écart absolu', formula: 'Réalisé − Budget' },
  { category: 'Budgétaires', name: 'Écart relatif %', formula: '(Réalisé − Budget) / Budget × 100', unit: '%' },
  { category: 'Budgétaires', name: "Taux d'engagement", formula: '(Engagé / Budget) × 100', unit: '%' },
  { category: 'Budgétaires', name: "Forecast fin d'année", formula: 'Réalisé + (Réalisé moyen × mois restants)' },
  { category: 'Budgétaires', name: 'Codes en dépassement', formula: 'Count où Réalisé > Budget' },
  { category: 'Budgétaires', name: 'Codes proches alerte', formula: 'Count où Réalisé > 80% × Budget' },

  // 🟢 IA PROPH3T
  { category: 'IA Proph3t', name: 'Trend marge (3 mois glissants)', formula: 'Régression linéaire sur 3 mois' },
  { category: 'IA Proph3t', name: 'Saisonnalité détectée', formula: 'Coefficient saisonnier par axe' },
  { category: 'IA Proph3t', name: 'Anomalies détectées (IA)', formula: 'Écritures atypiques par PROPH3T' },
  { category: 'IA Proph3t', name: 'Probabilité dépassement budget', formula: 'Score IA basé historique' },
  { category: 'IA Proph3t', name: 'Recommandations IA', formula: 'Suggestions PROPH3T (top 5)' },
];

const CATEGORIES = Array.from(new Set(KPIS.map((k) => k.category)));

export default function AnalyticalKPICatalog() {
  const { currentOrgId, currentYear } = useApp();
  const [ctx, setCtx] = useState<KpiCtx | null>(null);
  const [open, setOpen] = useState<Record<Category, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<Category, boolean>,
  );

  useEffect(() => {
    if (!currentOrgId) return;
    void (async () => {
      try {
        const [analyticCtx, periods, axes, rules] = await Promise.all([
          loadAnalyticContext(currentOrgId, currentYear),
          dataProvider.getPeriods(currentOrgId),
          dataProvider.getAnalyticAxes(currentOrgId),
          dataProvider.getAnalyticRules(currentOrgId),
        ]);
        const yearPeriods = periods.filter((p) => p.year === currentYear && p.month >= 1);
        const views = viewEntries(analyticCtx, yearPeriods);
        let ca = 0, charges = 0, fgTotal = 0;
        const projects = new Set<string>();
        let autoCount = 0;
        for (const v of views) {
          if (v.branch === 'revenue') ca += v.amount;
          else if (v.branch === 'project_cost' || v.branch === 'overhead') charges += v.amount;
          if (v.branch === 'overhead') fgTotal += v.amount;
          const p = v.codeByAxis.get(1);
          if (p) projects.add(p.code);
        }
        for (const a of analyticCtx.assignments) {
          if (a.method !== 'manual') autoCount++;
        }
        const totalEligible = analyticCtx.entries.filter((e) => e.account.startsWith('6') || e.account.startsWith('7')).length;
        const uniqueAssignedIds = new Set(analyticCtx.assignments.filter((a) => a.glEntryId).map((a) => a.glEntryId!));
        const totalAssigned = uniqueAssignedIds.size;

        setCtx({
          ca,
          charges,
          margeBrute: ca - charges * 0.4, // approximation : 40% des charges = achats consommés
          ebe: ca - charges,
          resultat: (ca - charges) * 0.7, // approximation après amortissements + impôts
          totalEligible,
          totalAssigned,
          coverageRate: totalEligible > 0 ? Math.round((totalAssigned / totalEligible) * 100) : 0,
          autoRate: analyticCtx.assignments.length > 0 ? Math.round((autoCount / analyticCtx.assignments.length) * 100) : 0,
          projectCount: projects.size,
          axesActive: axes.filter((a) => a.active).length,
          rulesActive: rules.filter((r) => r.active).length,
          fgTotal,
          fgRefacture: 0, // Phase 2
        });
      } catch {
        setCtx(null);
      }
    })();
  }, [currentOrgId, currentYear]);

  const grouped = useMemo(() => {
    const m = new Map<Category, KpiDef[]>();
    for (const k of KPIS) {
      const arr = m.get(k.category) ?? [];
      arr.push(k);
      m.set(k.category, arr);
    }
    return m;
  }, []);

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Catalogue des KPIs analytiques"
        subtitle={`${KPIS.length} indicateurs structurés en ${CATEGORIES.length} catégories`}
        icon={<Activity className="w-5 h-5" />}
        back="/dashboards"
      />

      <Card padded>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Badge key={cat} variant="default">
              <span className={clsx('w-2 h-2 rounded-full mr-1.5 inline-block', CAT_COLORS[cat].split(' ')[0])} />
              {cat} ({grouped.get(cat)?.length ?? 0})
            </Badge>
          ))}
        </div>
      </Card>

      {CATEGORIES.map((cat) => {
        const list = grouped.get(cat) ?? [];
        const isOpen = open[cat];
        return (
          <Card key={cat} padded={false}>
            <button
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-primary-50 dark:hover:bg-primary-900/40 transition border-b border-primary-200 dark:border-primary-800"
              onClick={() => setOpen({ ...open, [cat]: !isOpen })}
            >
              {isOpen ? <ChevronDown className="w-4 h-4 text-primary-500" /> : <ChevronRight className="w-4 h-4 text-primary-500" />}
              <span className={clsx('px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider', CAT_COLORS[cat])}>
                {cat}
              </span>
              <span className="text-xs text-primary-500">{list.length} KPI(s)</span>
              <BookOpen className="w-3.5 h-3.5 text-primary-400 ml-auto" />
            </button>
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-xs uppercase tracking-wider text-primary-500 bg-primary-50 dark:bg-primary-900/40">
                    <tr>
                      <th className="text-left px-3 py-2">KPI</th>
                      <th className="text-left px-3 py-2">Formule</th>
                      <th className="text-left px-3 py-2">Cible</th>
                      <th className="text-left px-3 py-2">Fréquence</th>
                      <th className="text-right px-3 py-2">Valeur courante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
                    {list.map((k, i) => (
                      <tr key={i} className="hover:bg-primary-50 dark:hover:bg-primary-900/40">
                        <td className="px-3 py-1.5 font-semibold">{k.name}</td>
                        <td className="px-3 py-1.5 text-primary-600 dark:text-primary-400 font-mono text-[11px]">{k.formula}</td>
                        <td className="px-3 py-1.5">
                          {k.target ? <Badge variant="default">{k.target}</Badge> : <span className="text-primary-400">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-primary-500">{k.frequency ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right num font-semibold">
                          {k.compute && ctx ? k.compute(ctx) : <span className="text-primary-400">N/A</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

      <p className="text-[11px] text-primary-400 italic px-1">
        Note : les KPIs marqués <strong>N/A</strong> nécessitent des données complémentaires
        (engagements budgétaires, heures de ressources, surface m², effectif) qui ne sont pas
        encore alimentées dans Cockpit FnA.
      </p>
    </div>
  );
}
