/**
 * MD&A — Management Discussion & Analysis (auto-généré par Proph3t).
 * Narratif synthétique du mois.
 */
import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { ChartCard } from '../components/ui/ChartCard';
import { useApp } from '../store/app';
import { useStatements, useRatios, useCurrentOrg } from '../hooks/useFinancials';
import { fmtK, fmtPct } from '../lib/format';

export default function MdaAutoPage() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, bilan } = useStatements();
  const ratios = useRatios();
  const [narrative, setNarrative] = useState<string[]>([]);

  useEffect(() => {
    if (!sig || !bilan) return;
    const get = (lines: any[], code: string) => lines?.find((l: any) => l.code === code)?.value ?? 0;
    const tn = get(bilan.actif, '_BT') - get(bilan.passif, 'DV');
    const margeNette = sig.ca ? (sig.resultat / sig.ca) * 100 : 0;
    const tauxEbe = sig.ca ? (sig.ebe / sig.ca) * 100 : 0;
    const alertes = ratios.filter((r) => r.status === 'alert');

    const lines: string[] = [];

    // Synthèse activité
    if (sig.ca > 0) {
      lines.push(`L'exercice ${currentYear} affiche un chiffre d'affaires de ${fmtK(sig.ca)} XOF, générant un résultat net de ${fmtK(sig.resultat)} XOF (marge nette ${fmtPct(margeNette)}).`);
    } else {
      lines.push(`Aucun chiffre d'affaires significatif n'a été enregistré sur l'exercice ${currentYear}.`);
    }

    // Performance opérationnelle
    if (tauxEbe > 20) lines.push(`La performance opérationnelle est solide : l'EBE représente ${fmtPct(tauxEbe)} du CA, témoignant d'une bonne maîtrise des charges d'exploitation.`);
    else if (tauxEbe > 10) lines.push(`L'EBE atteint ${fmtPct(tauxEbe)} du CA, niveau correct pouvant être amélioré par optimisation des coûts variables.`);
    else if (tauxEbe > 0) lines.push(`L'EBE est faible (${fmtPct(tauxEbe)} du CA) — analyser la structure de coûts variables et négocier les achats prioritaires.`);
    else lines.push(`L'EBE est NÉGATIF — l'activité ne couvre pas ses charges d'exploitation. Action urgente requise sur les coûts variables et le pricing.`);

    // Trésorerie
    if (tn > 0) lines.push(`La trésorerie nette est positive (${fmtK(tn)} XOF), offrant une marge de manœuvre pour les investissements.`);
    else lines.push(`La trésorerie nette est NÉGATIVE (${fmtK(tn)} XOF) — tension de financement à court terme. Recommandation : ligne de crédit ou recouvrement accéléré.`);

    // Alertes
    if (alertes.length > 0) {
      lines.push(`${alertes.length} ratio(s) déclenchent une alerte critique : ${alertes.slice(0, 3).map((a) => a.label).join(', ')}${alertes.length > 3 ? '…' : ''}. Ces points méritent une revue prioritaire.`);
    } else if (ratios.filter((r) => r.status === 'warn').length > 0) {
      lines.push(`Aucune alerte critique mais ${ratios.filter((r) => r.status === 'warn').length} ratio(s) en zone de vigilance.`);
    } else {
      lines.push(`Tous les ratios financiers sont conformes aux seuils SYSCOHADA — santé financière satisfaisante.`);
    }

    // Recommandations
    const recos: string[] = [];
    if (margeNette < 5) recos.push("revue tarifaire pour reconstituer la marge nette");
    if (tn < 0) recos.push("plan de redressement de trésorerie sur 90 jours");
    if (alertes.length > 0) recos.push("revue mensuelle des ratios en alerte");
    if (recos.length > 0) lines.push(`Actions recommandées : ${recos.join(' ; ')}.`);

    setNarrative(lines);
  }, [sig, bilan, ratios, currentYear]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="MD&A — Management Discussion & Analysis"
        subtitle={`${org?.name ?? '—'} · Narration auto-générée — Proph3t powered`}
        action={<button className="btn-outline" onClick={() => window.location.reload()}><RefreshCw className="w-4 h-4" /> Régénérer</button>}
      />

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4 text-primary-500 text-xs uppercase tracking-wider font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          Synthèse de l'exercice
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-primary-700 dark:text-primary-300">
          {narrative.map((line, i) => (
            <p key={i} className={i === 0 ? 'text-base font-medium text-primary-900 dark:text-primary-100' : ''}>{line}</p>
          ))}
        </div>
      </Card>

      <ChartCard title="Méthodologie" subtitle="Les analyses sont basées sur les données réelles de votre Grand Livre" accent="rgb(var(--accent))">
        <div className="text-xs text-primary-500 space-y-1">
          <p>• Les indicateurs (CA, RN, EBE, marge, trésorerie) sont calculés en temps réel via le moteur de balance Cockpit.</p>
          <p>• Les ratios suivent les seuils paramétrés dans Settings → Ratios (modifiables par tenant).</p>
          <p>• Le narratif est généré par règles (pas de LLM en production) pour garantir la déterminisme et la traçabilité.</p>
        </div>
      </ChartCard>
    </div>
  );
}
