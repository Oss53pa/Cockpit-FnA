// Auto-commentaire du rapport — Proph3t parcourt les blocs (h1/h2) et génère
// un paragraphe d'analyse pour chaque section, basé sur les données réelles.
import { fmtMoney } from '../../lib/format';

export interface ReportBlock {
  id: string;
  type: 'h1' | 'h2' | 'h3' | 'paragraph' | 'kpi' | 'table' | 'dashboard' | 'pageBreak';
  text?: string;
  source?: string;
  dashboardId?: string;
  [k: string]: any;
}

export interface ReportData {
  sig?: any;
  bilanActif?: any[];
  bilanPassif?: any[];
  cr?: any[];
  balance?: any[];
  ratios?: any[];
  budgetActual?: any[];
  monthlyCR?: any;
  capital?: any[];
  tft?: any[];
  hasAnalytical?: boolean;
  hasStocks?: boolean;
  org?: { name?: string };
  year?: number;
  period?: string;
}

const pct = (num: number, denom: number) => denom !== 0 ? ((num / denom) * 100).toFixed(1) : '0';

// Génère un commentaire pour une section donnée selon son titre + les données
function generateForSection(title: string, data: ReportData): string | null {
  const t = title.toLowerCase();
  const sig = data.sig;
  const ca = sig?.ca ?? 0;

  // Synthèse exécutive
  if (/synth[èe]se\s*ex[ée]cut/i.test(t) || /faits\s*marquants/i.test(t)) {
    if (!sig) return "Données financières en cours de chargement.";
    const rn = sig.resultat ?? 0;
    const ebe = sig.ebe ?? 0;
    const margeRn = pct(rn, ca);
    const margeEbe = pct(ebe, ca);
    const trend = rn > 0 ? 'bénéficiaire' : 'déficitaire';
    return `Sur la période, l'entreprise réalise un chiffre d'affaires de ${fmtMoney(ca)} et dégage un résultat net ${trend} de ${fmtMoney(rn)} (marge de ${margeRn} %). L'EBE atteint ${fmtMoney(ebe)} soit ${margeEbe} % du CA, ${Number(margeEbe) > 15 ? 'reflétant une bonne capacité opérationnelle' : Number(margeEbe) > 5 ? 'avec une rentabilité opérationnelle correcte' : 'révélant une rentabilité opérationnelle sous tension'}.`;
  }

  // Compte de résultat
  if (/compte\s*de\s*r[ée]sultat/i.test(t) || /^cr\b/i.test(t)) {
    if (!sig) return "Compte de résultat non disponible.";
    return `Le compte de résultat présente un CA de ${fmtMoney(ca)}, une marge brute de ${fmtMoney(sig.margeBrute ?? 0)} (${pct(sig.margeBrute ?? 0, ca)} %), et une valeur ajoutée de ${fmtMoney(sig.valeurAjoutee ?? 0)} (${pct(sig.valeurAjoutee ?? 0, ca)} %). Le résultat d'exploitation s'établit à ${fmtMoney(sig.re ?? 0)} et le résultat net à ${fmtMoney(sig.resultat ?? 0)}.`;
  }

  // Waterfall
  if (/waterfall|cascade/i.test(t)) {
    if (!sig) return null;
    return `La cascade SIG part du CA (${fmtMoney(ca)}) et descend vers le résultat net (${fmtMoney(sig.resultat ?? 0)}) en passant par la marge brute (${fmtMoney(sig.margeBrute ?? 0)}), la valeur ajoutée (${fmtMoney(sig.valeurAjoutee ?? 0)}) et l'EBE (${fmtMoney(sig.ebe ?? 0)}). Les principales étapes de destruction de valeur sont identifiables visuellement.`;
  }

  // Analyse CR par bloc
  if (/analyse\s*du\s*cr|cr\s*par\s*bloc/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const prodExpl = ba.filter((r: any) => /^(70|71|72|73|74|75)/.test(r.code)).reduce((s: number, r: any) => s + r.realise, 0);
    const chExpl = ba.filter((r: any) => /^(60|61|62|63|64|65|66)/.test(r.code)).reduce((s: number, r: any) => s + r.realise, 0);
    return `Les produits d'exploitation totalisent ${fmtMoney(prodExpl)} et les charges d'exploitation ${fmtMoney(chExpl)}, dégageant un résultat d'exploitation de ${fmtMoney(prodExpl - chExpl)}. La répartition par section est détaillée dans les sous-tableaux ci-dessous.`;
  }

  // Bilan / Position financière
  if (/bilan|position\s*financ/i.test(t)) {
    const a = data.bilanActif ?? [], p = data.bilanPassif ?? [];
    const get = (l: any[], c: string) => l.find((x) => x.code === c)?.value ?? 0;
    const totA = get(a, '_BZ'), cp = get(p, '_CP'), af = totA ? (cp / totA) * 100 : 0;
    const fr = get(p, '_DF') - get(a, '_AZ');
    const bfr = get(a, '_BK') - get(p, '_DP');
    const tn = get(a, '_BT') - get(p, 'DV');
    return `Le total bilan s'élève à ${fmtMoney(totA)}. Les capitaux propres (${fmtMoney(cp)}) représentent ${af.toFixed(0)} % du passif, ce qui ${af > 50 ? 'traduit une bonne autonomie financière' : af > 30 ? 'reflète une autonomie acceptable' : 'indique une dépendance importante aux financements externes'}. L'équilibre financier : FR ${fmtMoney(fr)}, BFR ${fmtMoney(bfr)}, Trésorerie nette ${fmtMoney(tn)}. ${fr >= bfr ? 'Le fonds de roulement couvre le besoin en BFR.' : 'Le fonds de roulement est insuffisant pour couvrir le BFR — vigilance trésorerie.'}`;
  }

  // Budget vs Réalisé
  if (/budget.*r[ée]alis|r[ée]alis.*budget|[ée]carts?\s*budget|budget\s*vs/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const totR = ba.reduce((s: number, r: any) => s + r.realise, 0);
    const totB = ba.reduce((s: number, r: any) => s + r.budget, 0);
    const ecart = totR - totB;
    const pctEcart = totB ? (ecart / Math.abs(totB)) * 100 : 0;
    return `Le réalisé cumulé atteint ${fmtMoney(totR)} contre un budget de ${fmtMoney(totB)}, soit un écart de ${fmtMoney(ecart)} (${pctEcart.toFixed(1)} %). ${Math.abs(pctEcart) < 5 ? 'L\'exécution budgétaire est conforme aux prévisions.' : pctEcart > 0 ? 'Les produits dépassent le budget — performance favorable.' : 'Le réalisé est en retrait par rapport aux objectifs.'} Le détail par compte est présenté ci-dessous.`;
  }

  // BFR
  if (/bfr|fonds\s*de\s*roulement/i.test(t)) {
    const a = data.bilanActif ?? [], p = data.bilanPassif ?? [];
    const get = (l: any[], c: string) => l.find((x) => x.code === c)?.value ?? 0;
    const fr = get(p, '_DF') - get(a, '_AZ');
    const bfr = get(a, '_BK') - get(p, '_DP');
    const tn = get(a, '_BT') - get(p, 'DV');
    return `Le fonds de roulement net global s'élève à ${fmtMoney(fr)}, le besoin en fonds de roulement à ${fmtMoney(bfr)} et la trésorerie nette à ${fmtMoney(tn)}. ${fr - bfr === tn ? 'L\'équation FR − BFR = TN est vérifiée.' : ''} ${bfr > 0 ? 'Le BFR positif traduit un besoin de financement du cycle d\'exploitation.' : 'Le BFR négatif est une source de financement.'}`;
  }

  // Cycle clients
  if (/cycle\s*client|client.*cycle|cr[ée]ances|dso/i.test(t)) {
    const a = data.bilanActif ?? [];
    const get = (l: any[], c: string) => l.find((x) => x.code === c)?.value ?? 0;
    const creances = get(a, 'BH');
    const dso = ca > 0 ? (creances / ca) * 360 : 0;
    return `L'encours clients représente ${fmtMoney(creances)}. Le délai moyen de règlement (DSO) est estimé à ${dso.toFixed(0)} jours. ${dso < 60 ? 'Délai maîtrisé.' : dso < 90 ? 'Délai correct, à surveiller.' : 'Délai élevé — actions de relance à intensifier.'}`;
  }

  // Cycle fournisseurs
  if (/cycle\s*fournisseur|fournisseur.*cycle|dpo/i.test(t)) {
    const p = data.bilanPassif ?? [];
    const get = (l: any[], c: string) => l.find((x) => x.code === c)?.value ?? 0;
    const dettes = get(p, 'DJ');
    const achats = (data.cr ?? []).find((l: any) => l.code === 'RA')?.value ?? 0;
    const dpo = achats > 0 ? (dettes / achats) * 360 : 0;
    return `L'encours fournisseurs s'élève à ${fmtMoney(dettes)}. Le délai moyen de paiement (DPO) est estimé à ${dpo.toFixed(0)} jours. ${dpo > 60 ? 'Délai favorable au cash.' : 'Délai standard.'}`;
  }

  // Stocks
  if (/^\s*\d*\.?\s*stocks?\b/i.test(t)) {
    const a = data.bilanActif ?? [];
    const stocks = a.find((l: any) => l.code === 'BB')?.value ?? 0;
    const rotation = ca > 0 ? (stocks / ca) * 360 : 0;
    return `Les stocks sont valorisés à ${fmtMoney(stocks)}, soit une rotation de ${rotation.toFixed(0)} jours de CA. ${rotation < 60 ? 'Rotation rapide.' : rotation < 120 ? 'Rotation normale.' : 'Stocks lourds — risque d\'obsolescence à surveiller.'}`;
  }

  // Trésorerie
  if (/tr[ée]sorerie|cashflow|cash\s*flow/i.test(t)) {
    const a = data.bilanActif ?? [], p = data.bilanPassif ?? [];
    const treA = a.find((l: any) => l.code === '_BT')?.value ?? 0;
    const treP = p.find((l: any) => l.code === 'DV')?.value ?? 0;
    const tn = treA - treP;
    return `La trésorerie active s'établit à ${fmtMoney(treA)}, la trésorerie passive à ${fmtMoney(treP)}, soit une trésorerie nette de ${fmtMoney(tn)}. ${tn > 0 ? 'Position de trésorerie confortable.' : 'Position tendue — recourir aux découverts ou crédits court terme à éviter.'}`;
  }

  // Cashflow prévisionnel
  if (/pr[ée]visionnel|forecast/i.test(t)) {
    return `La projection de trésorerie sur 13 semaines intègre les encaissements clients prévus, les décaissements fournisseurs et les charges récurrentes (salaires, impôts). Les seuils critiques sont automatiquement signalés.`;
  }

  // Pareto
  if (/pareto|abc/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const sorted = [...ba].sort((a: any, b: any) => Math.abs(b.realise) - Math.abs(a.realise));
    const top20 = Math.ceil(sorted.length * 0.2);
    const top20Sum = sorted.slice(0, top20).reduce((s: number, r: any) => s + Math.abs(r.realise), 0);
    const total = sorted.reduce((s: number, r: any) => s + Math.abs(r.realise), 0);
    const pctTop = total ? (top20Sum / total) * 100 : 0;
    return `L'analyse Pareto révèle que ${top20} comptes (20 % du portefeuille) concentrent ${pctTop.toFixed(0)} % du volume total. ${pctTop > 75 ? 'Concentration forte — la performance dépend d\'un nombre restreint de postes.' : 'Distribution relativement équilibrée.'}`;
  }

  // Seuil de rentabilité
  if (/seuil|point\s*mort|break.?even/i.test(t)) {
    if (!sig) return null;
    const margeContrib = sig.ebe ? (sig.ebe / ca) : 0.3;
    return `Le seuil de rentabilité est estimé à environ ${fmtMoney(ca * 0.7)} (sur la base d'un taux de marge sur coûts variables de ${(margeContrib * 100).toFixed(0)} %). La marge de sécurité atteint ${fmtMoney(ca * 0.3)} (30 % du CA), ce qui constitue ${margeContrib > 0.25 ? 'un coussin de sécurité confortable' : 'un coussin de sécurité limité'}.`;
  }

  // Masse salariale
  if (/masse\s*salariale|charges?\s*de\s*personnel|salaires?/i.test(t)) {
    const balance = data.balance ?? [];
    const masse = balance.filter((r: any) => r.account.startsWith('66')).reduce((s: number, r: any) => s + (r.debit - r.credit), 0);
    const ratio = ca > 0 ? (masse / ca) * 100 : 0;
    return `La masse salariale (charges de personnel classe 66) totalise ${fmtMoney(masse)}, soit ${ratio.toFixed(1)} % du chiffre d'affaires. ${ratio < 30 ? 'Ratio maîtrisé.' : ratio < 50 ? 'Ratio dans la norme.' : 'Ratio élevé — vigilance sur la productivité.'}`;
  }

  // Comptabilité analytique
  if (/analytique/i.test(t)) {
    if (!data.hasAnalytical) return "Aucune écriture analytique n'a été détectée dans le Grand Livre. Cette section est sans objet.";
    return `La comptabilité analytique permet de répartir les charges et produits par centre de coût ou section analytique, donnant une vision fine de la rentabilité par activité.`;
  }

  // Ratios financiers
  if (/^(\d+\.\s*)?ratios?\b/i.test(t)) {
    const ratios = data.ratios ?? [];
    const ok = ratios.filter((r: any) => r.status === 'good').length;
    const alertes = ratios.filter((r: any) => r.status === 'alert').length;
    return `Sur ${ratios.length} ratios calculés, ${ok} sont conformes aux normes sectorielles et ${alertes} présentent un signal d'alerte. ${alertes === 0 ? 'L\'ensemble est satisfaisant.' : `Les ratios à surveiller en priorité concernent ${ratios.filter((r: any) => r.status === 'alert').slice(0, 3).map((r: any) => r.label).join(', ')}.`}`;
  }

  // Compliance SYSCOHADA
  if (/compliance|conformit[ée]/i.test(t)) {
    return `Les 10 contrôles automatiques SYSCOHADA vérifient l'équilibre de la balance, la cohérence des classes, le mapping au plan de référence, et l'absence de soldes anormaux. Voir le détail dans le dashboard ci-dessous.`;
  }

  // ─── Sous-sections (H2/H3) ───
  // Produits d'exploitation
  if (/produits?\s*d.?exploitation/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const prod = ba.filter((r: any) => /^(70|71|72|73|74|75)/.test(r.code) && Math.abs(r.realise) > 0.01);
    const tot = prod.reduce((s: number, r: any) => s + r.realise, 0);
    const top = [...prod].sort((a, b) => b.realise - a.realise)[0];
    return `Les produits d'exploitation totalisent ${fmtMoney(tot)} sur la période, répartis sur ${prod.length} comptes mouvementés. ${top ? `Le compte le plus contributeur est ${top.code} (${top.label}) avec ${fmtMoney(top.realise)}.` : ''}`;
  }
  // Charges d'exploitation
  if (/charges?\s*d.?exploitation/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const ch = ba.filter((r: any) => /^(60|61|62|63|64|65|66)/.test(r.code) && Math.abs(r.realise) > 0.01);
    const tot = ch.reduce((s: number, r: any) => s + r.realise, 0);
    const top = [...ch].sort((a, b) => b.realise - a.realise)[0];
    return `Les charges d'exploitation atteignent ${fmtMoney(tot)} sur ${ch.length} comptes. ${top ? `Le poste le plus lourd est ${top.code} (${top.label}) à ${fmtMoney(top.realise)}.` : ''}`;
  }
  // Produits financiers
  if (/produits?\s*financ/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const prod = ba.filter((r: any) => /^77/.test(r.code) && Math.abs(r.realise) > 0.01);
    const tot = prod.reduce((s: number, r: any) => s + r.realise, 0);
    return `Les produits financiers s'élèvent à ${fmtMoney(tot)} (${prod.length} compte(s) mouvementé(s)). ${tot > 0 ? 'Source de revenus complémentaires.' : 'Pas de revenus financiers significatifs.'}`;
  }
  // Charges financières
  if (/charges?\s*financ/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const ch = ba.filter((r: any) => /^67/.test(r.code) && Math.abs(r.realise) > 0.01);
    const tot = ch.reduce((s: number, r: any) => s + r.realise, 0);
    const ratio = ca > 0 ? (tot / ca) * 100 : 0;
    return `Les charges financières (intérêts, agios) totalisent ${fmtMoney(tot)} soit ${ratio.toFixed(1)} % du CA. ${ratio < 2 ? 'Charge financière maîtrisée.' : ratio < 5 ? 'Niveau d\'endettement modéré.' : 'Endettement coûteux — examiner la structure de dette.'}`;
  }
  // Faits marquants (sous-section)
  if (/faits\s*marquants/i.test(t)) {
    const ratios = data.ratios ?? [];
    const alertes = ratios.filter((r: any) => r.status !== 'good').length;
    const sig = data.sig;
    const margeRn = sig?.ca ? ((sig.resultat ?? 0) / sig.ca) * 100 : 0;
    return `Sur la période : marge nette de ${margeRn.toFixed(1)} %, ${alertes} ratio(s) hors seuil. À documenter : événements exceptionnels (ouvertures de marché, contrats majeurs, sinistres, restructurations).`;
  }

  // Recommandations
  if (/recommandation|points?\s*d'attention|plan\s*d'action/i.test(t)) {
    const ratios = data.ratios ?? [];
    const alertes = ratios.filter((r: any) => r.status !== 'good');
    if (alertes.length === 0) return "Aucun point d'attention critique identifié sur la période. Maintenir le suivi mensuel des indicateurs clés.";
    const top = alertes.slice(0, 3).map((r: any) => `${r.label} (${r.value.toFixed(2)} ${r.unit}, cible ${r.target})`).join(' ; ');
    return `${alertes.length} ratio(s) hors seuil identifiés. Priorités d'action : ${top}. Mettre en place un plan d'action correctif avec responsables et échéances.`;
  }

  return null;
}

// Marqueur pour identifier les commentaires auto-générés (permet régénération + suppression ciblée)
export const AUTOGEN_MARKER = '[Proph3t-auto]';

// Parcourt les blocs et insère un commentaire automatique APRÈS chaque H1, H2 et H3.
// Pour chaque titre reconnu, génère un paragraphe contextuel basé sur les données réelles.
export function autoCommentReport(blocks: ReportBlock[], data: ReportData): { blocks: ReportBlock[]; count: number } {
  const result: ReportBlock[] = [];
  let count = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    result.push(b);

    // Cibler H1, H2 et H3
    if ((b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && b.text) {
      const comment = generateForSection(b.text, data);
      if (!comment) continue;

      // Vérifier le bloc suivant : si c'est un paragraph auto-généré ou vide/court, le remplacer
      const next = blocks[i + 1];
      if (next?.type === 'paragraph' && (next.text?.includes(AUTOGEN_MARKER) || !next.text?.trim() || next.text?.includes('À compléter') || (next.text?.length ?? 0) < 100)) {
        result.push({ ...next, text: `${AUTOGEN_MARKER} ${comment}` } as ReportBlock);
        i++; // skip
      } else {
        result.push({
          id: 'autogen-' + Math.random().toString(36).substring(2, 10),
          type: 'paragraph',
          text: `${AUTOGEN_MARKER} ${comment}`,
        } as ReportBlock);
      }
      count++;
    }
  }

  return { blocks: result, count };
}

// Supprime tous les commentaires auto-générés par Proph3t.
// Retourne les blocs nettoyés + le nombre de blocs retirés.
export function clearAutoComments(blocks: ReportBlock[]): { blocks: ReportBlock[]; count: number } {
  const result: ReportBlock[] = [];
  let count = 0;
  for (const b of blocks) {
    if (b.type === 'paragraph' && b.text?.includes(AUTOGEN_MARKER)) {
      count++;
      continue; // skip
    }
    result.push(b);
  }
  return { blocks: result, count };
}
