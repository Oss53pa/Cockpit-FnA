// Auto-commentaire intelligent du rapport — Proph3t parcourt les blocs et
// génère pour chaque section H1/H2/H3 un commentaire d'expert : analyse des
// chiffres, comparaison aux normes sectorielles, identification des risques,
// recommandations actionnables. Multi-paragraphes pour chaque section.
// Intégrations : mémoire permanente (apprentissage) + connaissance SYSCOHADA
// + prédictions par régression linéaire sur historique observé.
import { fmtMoney } from '../../lib/format';
import { recordSnapshot, predictMetric, getInsights } from './memory';
import { getNormSectorielle, SYSCOHADA_KEY_RATIOS } from './syscohada-knowledge';
import { searchKnowledge } from './knowledge/search';

// Enregistre un snapshot des KPIs courants dans la mémoire permanente.
// À appeler avant la génération des commentaires.
export function feedMemory(orgId: string, data: any, context?: string) {
  if (!orgId) return;
  const sig = data.sig;
  const ca = sig?.ca ?? 0;
  const get = (l: any[], c: string) => (l ?? []).find((x: any) => x.code === c)?.value ?? 0;
  recordSnapshot(orgId, {
    ca,
    ebe: sig?.ebe ?? 0,
    rn: sig?.resultat ?? 0,
    treso: get(data.bilanActif, '_BT') - get(data.bilanPassif, 'DV'),
    bfr: get(data.bilanActif, '_BK') - get(data.bilanPassif, '_DP'),
    dso: ca > 0 ? Math.round((get(data.bilanActif, 'BH') / ca) * 360) : 0,
    capPropres: get(data.bilanPassif, '_CP'),
    totActif: get(data.bilanActif, '_BZ'),
    ratiosAlertes: (data.ratios ?? []).filter((r: any) => r.status !== 'good').length,
    context,
  });
}

// Phrase de tendance basée sur l'historique mémoire
function trendPhrase(orgId: string | undefined, metric: string, currentValue: number, unit = ''): string {
  if (!orgId) return '';
  const insights = getInsights(orgId);
  const pattern = insights.patterns.find((p) => p.metric === metric);
  if (!pattern || pattern.lastValue === currentValue) return '';
  const arrow = pattern.trend === 'up' ? '↗' : pattern.trend === 'down' ? '↘' : '→';
  const trendWord = pattern.trend === 'up' ? 'progression' : pattern.trend === 'down' ? 'recul' : 'stabilité';
  return ` ${arrow} Tendance observée sur les périodes précédentes : ${trendWord} (vs ${fmtMoney(pattern.lastValue)}${unit}).`;
}

// Phrase de prédiction basée sur l'historique
function predictionPhrase(orgId: string | undefined, metric: string, label: string): string {
  if (!orgId) return '';
  const pred = predictMetric(orgId, metric, 1);
  if (!pred || pred.confidence < 0.3) return '';
  const conf = pred.confidence > 0.7 ? 'haute' : pred.confidence > 0.5 ? 'moyenne' : 'faible';
  return ` Projection période suivante (${label}) : ${fmtMoney(pred.value)} — confiance ${conf} (R²=${(pred.confidence * 100).toFixed(0)}%).`;
}

// Comparaison aux normes sectorielles SYSCOHADA
function benchmarkPhrase(secteur: string | undefined, metric: 'dso' | 'dpo' | 'rotationStocks' | 'margeEbe' | 'autonomie', value: number): string {
  const norms = getNormSectorielle(secteur || 'Industrie');
  const norm = (norms as any)[metric];
  if (typeof norm !== 'number' || norm === 0) return '';
  const diff = value - norm;
  const pctDiff = norm ? (diff / norm) * 100 : 0;
  const status = Math.abs(pctDiff) < 10 ? 'conforme à' : pctDiff > 0 ? 'au-dessus de' : 'en deçà de';
  return ` Norme sectorielle ${secteur || 'Industrie'} : ${norm}${metric.includes('marge') || metric.includes('autonomie') ? ' %' : metric === 'rotationStocks' || metric === 'dso' || metric === 'dpo' ? ' j' : ''} — votre valeur est ${status} la norme (écart ${pctDiff > 0 ? '+' : ''}${pctDiff.toFixed(0)} %).`;
}

// Récupère les références légales SYSCOHADA pertinentes pour une section
function legalRefs(query: string): string {
  const results = searchKnowledge(query, 1);
  if (results.length === 0 || !results[0].legal_references?.length) return '';
  return ` (Réf. légales : ${results[0].legal_references.join(', ')})`;
}

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
  auxClient?: any[];
  auxFournisseur?: any[];
  agedClient?: any;
  agedFournisseur?: any;
  hasAnalytical?: boolean;
  hasStocks?: boolean;
  org?: { name?: string; sector?: string };
  year?: number;
  period?: string;
}

const pct = (num: number, denom: number): string => denom !== 0 ? ((num / denom) * 100).toFixed(1) : '0';
const get = (l: any[] | undefined, c: string): number => (l ?? []).find((x: any) => x.code === c)?.value ?? 0;

// Diagnostic qualitatif d'une marge en %
function diagMarge(p: number, type: 'mb' | 'va' | 'ebe' | 'rn'): { qualif: string; reco: string } {
  if (type === 'mb') {
    if (p > 40) return { qualif: 'excellente', reco: 'Maintenir la stratégie de prix et de sourcing.' };
    if (p > 25) return { qualif: 'satisfaisante', reco: 'Examiner les leviers de réduction des coûts directs (négociation fournisseurs, optimisation production).' };
    if (p > 15) return { qualif: 'correcte', reco: 'Analyser la structure des achats et envisager des regroupements pour augmenter le pouvoir de négociation.' };
    return { qualif: 'faible', reco: 'Action urgente : revoir la politique d\'achat, identifier les comptes les plus coûteux, négocier ou changer de fournisseurs.' };
  }
  if (type === 'va') {
    if (p > 50) return { qualif: 'forte création de valeur', reco: 'L\'entreprise transforme efficacement ses inputs.' };
    if (p > 30) return { qualif: 'création de valeur correcte', reco: 'Réduire les consommations intermédiaires (services extérieurs, sous-traitance).' };
    return { qualif: 'faible', reco: 'Forte dépendance aux consommations intermédiaires — internaliser certaines activités.' };
  }
  if (type === 'ebe') {
    if (p > 20) return { qualif: 'performance opérationnelle solide', reco: 'Capitaliser pour financer la croissance ou réduire l\'endettement.' };
    if (p > 10) return { qualif: 'rentabilité opérationnelle acceptable', reco: 'Optimiser la masse salariale et les charges externes pour améliorer le ratio.' };
    if (p > 0) return { qualif: 'marge opérationnelle serrée', reco: 'Examiner urgemment la productivité, les sureffectifs éventuels et les charges fixes.' };
    return { qualif: 'EBE négatif', reco: 'CRITIQUE : exploitation déficitaire. Plan de redressement opérationnel immédiat requis.' };
  }
  // rn
  if (p > 10) return { qualif: 'rentabilité finale solide', reco: 'Capacité d\'autofinancement élevée — réinvestir ou distribuer.' };
  if (p > 5) return { qualif: 'rentabilité acceptable', reco: 'Bénéfice modeste, surveiller les charges financières et exceptionnelles.' };
  if (p > 0) return { qualif: 'rentabilité limite', reco: 'Marge nette faible — un choc externe peut basculer en perte.' };
  return { qualif: 'résultat déficitaire', reco: 'CRITIQUE : pertes accumulées affecteront les capitaux propres. Plan de retour à l\'équilibre prioritaire.' };
}

function generateForSection(title: string, data: ReportData, ctx?: { orgId?: string; secteur?: string }): string | null {
  const t = title.toLowerCase();
  const sig = data.sig;
  const ca = sig?.ca ?? 0;
  const orgId = ctx?.orgId;
  const secteur = ctx?.secteur;

  // ─── 1. SYNTHÈSE EXÉCUTIVE — analyse multi-axes ───
  if (/synth[èe]se\s*ex[ée]cut/i.test(t)) {
    if (!sig) return "Données financières en cours de chargement.";
    const rn = sig.resultat ?? 0;
    const ebe = sig.ebe ?? 0;
    const mb = sig.margeBrute ?? 0;
    const va = sig.valeurAjoutee ?? 0;
    const margeRn = Number(pct(rn, ca));
    const margeEbe = Number(pct(ebe, ca));
    const margeMb = Number(pct(mb, ca));
    const margeVa = Number(pct(va, ca));
    const treso = get(data.bilanActif, '_BT') - get(data.bilanPassif, 'DV');
    const cp = get(data.bilanPassif, '_CP');
    const totA = get(data.bilanActif, '_BZ');
    const autonomie = totA ? (cp / totA) * 100 : 0;
    const ratiosAlertes = (data.ratios ?? []).filter((r: any) => r.status === 'alert').length;

    const tendCa = trendPhrase(orgId, 'ca', ca);
    const tendRn = trendPhrase(orgId, 'rn', rn);
    const predCa = predictionPhrase(orgId, 'ca', 'CA');
    const benchEbe = benchmarkPhrase(secteur, 'margeEbe', margeEbe);
    const benchAuto = benchmarkPhrase(secteur, 'autonomie', autonomie);

    return `Sur la période analysée, ${data.org?.name ?? 'l\'entreprise'} dégage un chiffre d'affaires de ${fmtMoney(ca)}${tendCa} et un résultat net ${rn >= 0 ? 'bénéficiaire' : 'déficitaire'} de ${fmtMoney(rn)}${tendRn}, soit une marge nette de ${margeRn.toFixed(1)} %.${predCa} La performance opérationnelle, mesurée par l'EBE (${fmtMoney(ebe)} - ${margeEbe.toFixed(1)} % du CA), ${margeEbe > 15 ? 'reflète une exploitation efficiente' : margeEbe > 5 ? 'reste dans la moyenne du secteur mais demande une optimisation' : 'révèle une fragilité opérationnelle qui appelle des mesures correctives'}.${benchEbe} La marge brute (${margeMb.toFixed(1)} %) et la valeur ajoutée (${margeVa.toFixed(1)} %) ${margeMb > 30 ? 'témoignent d\'une bonne maîtrise des coûts directs' : 'suggèrent un poids excessif des consommations intermédiaires'}. ` +
      `\n\nSur le plan structurel, le total bilan atteint ${fmtMoney(totA)} avec des capitaux propres représentant ${autonomie.toFixed(0)} % du financement total, ce qui ${autonomie > 50 ? 'traduit une autonomie financière confortable et une bonne capacité de résistance aux chocs' : autonomie > 30 ? 'reste dans la norme mais limite la marge de manœuvre en cas de difficulté' : 'indique une dépendance préoccupante aux financements externes'}.${benchAuto} La trésorerie nette s'établit à ${fmtMoney(treso)}, ${treso > 0 ? 'offrant une certaine sérénité de court terme' : 'plaçant l\'entreprise sous tension avec un risque de difficulté de paiement'}. ` +
      `\n\nLe diagnostic global identifie ${ratiosAlertes} ratio(s) hors seuil sectoriel${ratiosAlertes > 0 ? ', détaillés dans la section dédiée et appelant des actions ciblées' : ', ce qui place l\'entreprise dans une bonne dynamique d\'ensemble'}. Les principaux enjeux pour la période suivante : ${margeEbe < 10 ? 'restaurer la rentabilité opérationnelle, ' : ''}${treso < 0 ? 'redresser la trésorerie, ' : ''}${autonomie < 30 ? 'renforcer les capitaux propres, ' : ''}piloter les écarts budgétaires et optimiser le BFR.${orgId ? ` Cette analyse s'enrichit à chaque génération grâce à la mémoire permanente de Proph3t (basée sur SYSCOHADA révisé 2017 — ${SYSCOHADA_KEY_RATIOS.length} ratios de référence, ${secteur || 'générique'} comme secteur).` : ''}`;
  }

  // ─── 2. COMPTE DE RÉSULTAT — décomposition complète ───
  if (/compte\s*de\s*r[ée]sultat/i.test(t) && !/cr\s*par\s*bloc/i.test(t)) {
    if (!sig) return "Compte de résultat non disponible.";
    const mb = sig.margeBrute ?? 0;
    const va = sig.valeurAjoutee ?? 0;
    const ebe = sig.ebe ?? 0;
    const re = sig.re ?? 0;
    const rn = sig.resultat ?? 0;
    const margeMb = Number(pct(mb, ca));
    const margeVa = Number(pct(va, ca));
    const margeEbe = Number(pct(ebe, ca));
    const dMb = diagMarge(margeMb, 'mb');
    const dEbe = diagMarge(margeEbe, 'ebe');
    const dRn = diagMarge(Number(pct(rn, ca)), 'rn');

    return `Le compte de résultat SYSCOHADA présente un chiffre d'affaires de ${fmtMoney(ca)}, qui constitue le point de départ de l'analyse de performance${legalRefs('compte résultat SIG')}. La cascade SIG décompose ce CA en plusieurs étages successifs révélant la création et la destruction de valeur tout au long du cycle d'exploitation. ` +
      `\n\nLa marge brute s'établit à ${fmtMoney(mb)} (${margeMb.toFixed(1)} %), reflétant ${dMb.qualif}. ${dMb.reco} La valeur ajoutée atteint ${fmtMoney(va)} (${margeVa.toFixed(1)} %), correspondant à la richesse réellement créée par l'entreprise après déduction des consommations intermédiaires (achats hors marchandises, services extérieurs, transports). ` +
      `\n\nL'excédent brut d'exploitation (EBE), mesure pure de la rentabilité opérationnelle indépendante des choix d'amortissement et de financement, ressort à ${fmtMoney(ebe)} soit ${margeEbe.toFixed(1)} % du CA. Cette ${dEbe.qualif} indique que ${dEbe.reco} Après prise en compte des dotations aux amortissements et provisions, le résultat d'exploitation s'élève à ${fmtMoney(re)}. ` +
      `\n\nIntégrant le résultat financier (charges d'intérêts, produits de placement) et le résultat hors activités ordinaires, le résultat net atteint finalement ${fmtMoney(rn)} (${pct(rn, ca)} %). ${dRn.reco}`;
  }

  // ─── 3. WATERFALL — interprétation cascade SIG ───
  if (/waterfall|cascade/i.test(t)) {
    if (!sig) return null;
    const mb = sig.margeBrute ?? 0;
    const va = sig.valeurAjoutee ?? 0;
    const ebe = sig.ebe ?? 0;
    const re = sig.re ?? 0;
    const rn = sig.resultat ?? 0;
    const consoInter = mb - va; // négatif
    const persoEtTaxes = va - ebe; // charges 64+65+66
    const dotProvisions = ebe - re;
    const charFinExceImp = re - rn;

    return `La cascade visuelle des soldes intermédiaires de gestion (SIG) permet d'identifier précisément où la valeur se crée et où elle se détruit le long du cycle d'exploitation. Sur la période, le chiffre d'affaires de ${fmtMoney(ca)} se transforme en résultat net de ${fmtMoney(rn)} après plusieurs étapes successives. ` +
      `\n\nLes principales étapes de destruction de valeur sont : (1) les achats hors marchandises et consommations intermédiaires absorbent ${fmtMoney(Math.abs(consoInter))} (passage de la marge brute à la valeur ajoutée), (2) les charges de personnel, impôts et taxes consomment ${fmtMoney(persoEtTaxes)} (passage de la VA à l'EBE), (3) les dotations aux amortissements et provisions retiennent ${fmtMoney(dotProvisions)} (passage de l'EBE au résultat d'exploitation), (4) les charges financières, exceptionnelles et impôts sur les bénéfices déduisent ${fmtMoney(charFinExceImp)} (passage du RE au RN). ` +
      `\n\nLe poste le plus impactant ${persoEtTaxes > Math.abs(consoInter) ? 'est la masse salariale et les charges connexes — un levier d\'optimisation prioritaire si la productivité peut être améliorée' : 'sont les achats et consommations intermédiaires — examiner les marges de négociation avec les fournisseurs principaux'}.`;
  }

  // ─── 4. ANALYSE CR PAR BLOC — top contributeurs ───
  if (/analyse\s*du\s*cr|cr\s*par\s*bloc/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const prodExpl = ba.filter((r: any) => /^(70|71|72|73|74|75)/.test(r.code));
    const chExpl = ba.filter((r: any) => /^(60|61|62|63|64|65|66)/.test(r.code));
    const totProd = prodExpl.reduce((s: number, r: any) => s + r.realise, 0);
    const totCh = chExpl.reduce((s: number, r: any) => s + r.realise, 0);
    const topProd = [...prodExpl].sort((a, b) => b.realise - a.realise).slice(0, 3);
    const topCh = [...chExpl].sort((a, b) => b.realise - a.realise).slice(0, 3);
    const resExpl = totProd - totCh;

    return `Cette section décompose le compte de résultat en blocs SYSCOHADA standards (Produits / Charges d'exploitation, financières, hors activités ordinaires) afin d'identifier les sources de performance et les principaux postes de dépenses. La granularité au compte permet d'identifier les contributeurs majeurs. ` +
      `\n\nProduits d'exploitation : ${fmtMoney(totProd)} sur ${prodExpl.length} comptes mouvementés. ${topProd.length > 0 ? `Les trois premiers contributeurs sont : ${topProd.map((r: any) => `${r.code} ${r.label} (${fmtMoney(r.realise)})`).join(', ')}.` : ''} La concentration sur peu de comptes ${topProd.length > 0 && topProd[0].realise / totProd > 0.5 ? 'crée un risque de dépendance' : 'est équilibrée'}. ` +
      `\n\nCharges d'exploitation : ${fmtMoney(totCh)} sur ${chExpl.length} comptes. ${topCh.length > 0 ? `Les trois postes les plus lourds : ${topCh.map((r: any) => `${r.code} ${r.label} (${fmtMoney(r.realise)})`).join(', ')}.` : ''} ${topCh.length > 0 && topCh[0].realise / totCh > 0.4 ? 'Une part importante des charges est concentrée sur un seul poste — leviers d\'optimisation à explorer.' : 'Charges réparties sur plusieurs natures.'} ` +
      `\n\nLe résultat d'exploitation brut ressort à ${fmtMoney(resExpl)}, ${resExpl > 0 ? 'positif' : 'négatif'}. Les sous-tableaux mensuels permettent de suivre les évolutions et de détecter les anomalies de saisonnalité.`;
  }

  // ─── 5. BILAN — analyse structurelle ───
  if (/bilan|position\s*financ/i.test(t) && !/structure/i.test(t)) {
    const totA = get(data.bilanActif, '_BZ');
    const cp = get(data.bilanPassif, '_CP');
    const ai = get(data.bilanActif, '_AZ');
    const ac = get(data.bilanActif, '_BK');
    const dt = get(data.bilanPassif, '_DF');
    const dc = get(data.bilanPassif, '_DP');
    const treA = get(data.bilanActif, '_BT');
    const treP = get(data.bilanPassif, 'DV');
    const fr = (dt) - (ai);
    const bfr = ac - dc;
    const tn = treA - treP;
    const autonomie = totA ? (cp / totA) * 100 : 0;
    const liquidite = dc ? (ac / dc) : 0;

    return `Le bilan présente la photographie patrimoniale de l'entreprise à la date de clôture. Le total bilan atteint ${fmtMoney(totA)}, traduisant ${totA > 1_000_000_000 ? 'une structure de taille significative' : 'une structure adaptée à l\'activité'}. ` +
      `\n\nÀ l'actif, les immobilisations représentent ${fmtMoney(ai)} (${pct(ai, totA)} % du bilan) et l'actif circulant ${fmtMoney(ac)} (${pct(ac, totA)} %). ${ai / totA > 0.5 ? 'La forte proportion d\'immobilisations indique une activité capitalistique nécessitant un financement long.' : 'L\'actif circulant prédomine, typique des activités de service ou de négoce.'} La trésorerie active s'élève à ${fmtMoney(treA)}. ` +
      `\n\nAu passif, les capitaux propres totalisent ${fmtMoney(cp)} soit ${autonomie.toFixed(1)} % de la structure financière. ${autonomie > 50 ? 'Cette autonomie financière élevée traduit une faible dépendance aux financements externes et une bonne capacité de résistance.' : autonomie > 30 ? 'L\'autonomie reste acceptable mais perfectible — l\'entreprise pourrait renforcer ses capitaux propres pour améliorer sa capacité d\'emprunt.' : 'L\'autonomie est insuffisante : risque de surendettement et de difficulté à lever de nouveaux financements.'} Les dettes financières représentent ${fmtMoney(dt - cp - get(data.bilanPassif, 'CV'))} et les dettes circulantes ${fmtMoney(dc)}. ` +
      `\n\nLes équilibres fondamentaux du bilan : Fonds de roulement = ${fmtMoney(fr)}, BFR d'exploitation = ${fmtMoney(bfr)}, Trésorerie nette = ${fmtMoney(tn)}. ${fr >= bfr ? 'Le fonds de roulement couvre largement le BFR, dégageant une trésorerie excédentaire — situation financière saine.' : 'Le fonds de roulement est insuffisant pour couvrir le BFR, ce qui pèse mécaniquement sur la trésorerie. Action requise : renforcer le FR (capitaux propres, emprunts long terme) ou réduire le BFR (DSO, stocks).'} Le ratio de liquidité générale (Actif circulant / Dettes circulantes) s'élève à ${liquidite.toFixed(2)}, ${liquidite > 1.5 ? 'confortable' : liquidite > 1 ? 'limite mais acceptable' : 'préoccupant — risque de défaut de paiement court terme'}.`;
  }

  // ─── Structure de l'Actif ───
  if (/structure\s*de\s*l'?actif/i.test(t)) {
    const totA = get(data.bilanActif, '_BZ');
    const ai = get(data.bilanActif, '_AZ');
    const stocks = get(data.bilanActif, 'BB');
    const creances = get(data.bilanActif, 'BH');
    const treA = get(data.bilanActif, '_BT');
    return `La structure de l'actif révèle la composition du patrimoine : actif immobilisé ${fmtMoney(ai)} (${pct(ai, totA)} %), stocks ${fmtMoney(stocks)} (${pct(stocks, totA)} %), créances clients ${fmtMoney(creances)} (${pct(creances, totA)} %), trésorerie ${fmtMoney(treA)} (${pct(treA, totA)} %). ` +
      `\n\nLe poids des immobilisations (${pct(ai, totA)} %) traduit l'intensité capitalistique de l'activité. Une proportion supérieure à 50 % indique une entreprise industrielle/immobilière, inférieure à 30 % une activité de service ou commerce. La part des créances clients (${pct(creances, totA)} %) doit rester sous 25-30 % pour ne pas obérer la trésorerie ; au-delà, examiner le DSO et la politique de recouvrement. La trésorerie représente ${pct(treA, totA)} % de l'actif — au-delà de 15 %, la liquidité est confortable mais peut indiquer un sous-investissement.`;
  }

  // ─── Structure du Passif ───
  if (/structure\s*du\s*passif/i.test(t)) {
    const cp = get(data.bilanPassif, '_CP');
    const totP = get(data.bilanPassif, '_DZ') || get(data.bilanActif, '_BZ');
    const dl = get(data.bilanPassif, '_DF') - cp - get(data.bilanPassif, 'CV');
    const dc = get(data.bilanPassif, '_DP');
    const tp = get(data.bilanPassif, 'DV');
    const autonomie = totP ? (cp / totP) * 100 : 0;
    return `La structure du passif décompose les sources de financement de l'entreprise : capitaux propres ${fmtMoney(cp)} (${autonomie.toFixed(1)} %), dettes financières long terme ${fmtMoney(dl)} (${pct(dl, totP)} %), dettes circulantes ${fmtMoney(dc)} (${pct(dc, totP)} %), trésorerie passive ${fmtMoney(tp)} (${pct(tp, totP)} %). ` +
      `\n\nL'autonomie financière (CP / Total Passif) est ${autonomie > 50 ? 'forte (> 50 %), gage de solidité et de capacité d\'emprunt' : autonomie > 30 ? 'acceptable (norme sectorielle), mais à consolider' : 'faible (< 30 %), traduisant une dépendance excessive aux dettes'}. Le ratio d'endettement global (Dettes / CP) s'élève à ${cp ? ((dl + dc + tp) / cp).toFixed(2) : 'n.a.'}, ${cp && (dl + dc + tp) / cp < 1 ? 'sous le seuil prudentiel de 1' : cp && (dl + dc + tp) / cp < 2 ? 'modéré' : 'élevé — risque financier'}. La part de la trésorerie passive (${pct(tp, totP)} %) ${tp > 0 ? 'révèle un recours aux financements bancaires court terme (découverts, escomptes) à examiner' : 'est nulle, situation saine'}.`;
  }

  // ─── Variation des capitaux propres ───
  if (/variation\s*des\s*capitaux/i.test(t)) {
    const cp = get(data.bilanPassif, '_CP');
    const rn = data.sig?.resultat ?? 0;
    return `Le tableau de variation des capitaux propres présente l'évolution de chaque composante (capital social, primes, réserves, report à nouveau, résultat de l'exercice) entre l'ouverture et la clôture. C'est un état obligatoire SYSCOHADA permettant de tracer l'origine des mouvements (augmentations de capital, distributions, affectation du résultat, écarts de réévaluation). ` +
      `\n\nÀ la clôture, les capitaux propres atteignent ${fmtMoney(cp)}, intégrant le résultat net de l'exercice (${fmtMoney(rn)}). ${rn > 0 ? 'Le bénéfice viendra abonder le report à nouveau ou être distribué selon décision de l\'assemblée générale.' : 'La perte affectera négativement le report à nouveau ; à surveiller pour éviter une dégradation des fonds propres en deçà du capital social.'}`;
  }

  // ─── TFT ───
  if (/tableau\s*des\s*flux|^tft|flux\s*de\s*tr[ée]sorerie/i.test(t)) {
    const treA = get(data.bilanActif, '_BT');
    const treP = get(data.bilanPassif, 'DV');
    const tn = treA - treP;
    return `Le Tableau des Flux de Trésorerie (TFT) SYSCOHADA, présenté ici en méthode indirecte, retrace l'origine des mouvements de cash sur la période : flux d'exploitation (capacité à générer du cash de l'activité), flux d'investissement (politique d'acquisition/cession d'immobilisations), flux de financement (apports en CP, emprunts, remboursements, dividendes). ` +
      `\n\nLa trésorerie nette de clôture s'établit à ${fmtMoney(tn)}. ${tn > 0 ? 'L\'entreprise dispose d\'une réserve de cash positive permettant de financer la croissance ou de faire face aux imprévus.' : 'La trésorerie est négative — l\'entreprise est en situation de découvert structurel, ce qui génère des frais financiers et limite l\'autonomie de gestion.'} L'analyse des trois cycles (exploitation / investissement / financement) permet d'identifier si le cash est généré par l'activité courante ou si l'entreprise vit sur des emprunts ou des cessions d'actifs.`;
  }

  // ─── Budget vs Réalisé ───
  if (/budget.*r[ée]alis|r[ée]alis.*budget|[ée]carts?\s*budget|budget\s*vs/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const prod = ba.filter((r: any) => /^7/.test(r.code));
    const ch = ba.filter((r: any) => /^6/.test(r.code));
    const totRP = prod.reduce((s: number, r: any) => s + r.realise, 0);
    const totBP = prod.reduce((s: number, r: any) => s + r.budget, 0);
    const totRC = ch.reduce((s: number, r: any) => s + r.realise, 0);
    const totBC = ch.reduce((s: number, r: any) => s + r.budget, 0);
    const ecartProd = totRP - totBP;
    const ecartCh = totRC - totBC;
    const pctP = totBP ? (ecartProd / totBP) * 100 : 0;
    const pctC = totBC ? (ecartCh / totBC) * 100 : 0;

    return `L'analyse Budget vs Réalisé compare l'exécution effective aux objectifs validés en début d'exercice. C'est l'outil de pilotage central permettant de mesurer la maîtrise opérationnelle et d'identifier les besoins d'ajustement budgétaire. ` +
      `\n\nProduits réalisés : ${fmtMoney(totRP)} contre ${fmtMoney(totBP)} budgétés, soit un écart de ${fmtMoney(ecartProd)} (${pctP > 0 ? '+' : ''}${pctP.toFixed(1)} %). ${pctP > 5 ? 'Surperformance commerciale — confirmer la pérennité (effet ponctuel ou tendance ?).' : pctP < -5 ? 'Sous-performance — analyser : pertes de clients, retards de facturation, baisse des prix de vente, conjoncture sectorielle.' : 'Exécution conforme aux prévisions.'} ` +
      `\n\nCharges réalisées : ${fmtMoney(totRC)} contre ${fmtMoney(totBC)} budgétés, écart de ${fmtMoney(ecartCh)} (${pctC > 0 ? '+' : ''}${pctC.toFixed(1)} %). ${pctC > 5 ? 'Dérapage des charges à investiguer poste par poste — identifier les comptes en dépassement et arbitrer.' : pctC < -5 ? 'Sous-consommation possible signe d\'une activité en retrait ou d\'une bonne maîtrise des coûts.' : 'Charges sous contrôle.'} ` +
      `\n\nLe détail par compte ci-dessous permet d'identifier précisément les écarts à expliquer et les actions correctives à engager. Les comptes avec écart > 10 % en valeur absolue méritent une attention prioritaire.`;
  }

  // ─── BFR ───
  if (/bfr|fonds\s*de\s*roulement/i.test(t)) {
    const ai = get(data.bilanActif, '_AZ');
    const dl = get(data.bilanPassif, '_DF') - get(data.bilanPassif, '_CP');
    const ac = get(data.bilanActif, '_BK');
    const dc = get(data.bilanPassif, '_DP');
    const treA = get(data.bilanActif, '_BT');
    const treP = get(data.bilanPassif, 'DV');
    const fr = dl - ai;
    const bfr = ac - dc;
    const tn = treA - treP;
    const bfrJours = ca > 0 ? Math.round((bfr / ca) * 360) : 0;

    return `L'équation fondamentale du bilan financier : Fonds de Roulement (FR) − Besoin en Fonds de Roulement (BFR) = Trésorerie Nette (TN). Cette identité éclaire les choix de financement et révèle les déséquilibres structurels. ` +
      `\n\nLe Fonds de Roulement s'élève à ${fmtMoney(fr)}, calculé comme l'excédent des ressources stables (capitaux propres + dettes financières long terme) sur les emplois stables (immobilisations). ${fr > 0 ? 'Un FR positif signifie que les ressources permanentes financent à la fois les immobilisations et une partie du cycle d\'exploitation.' : 'Un FR négatif est une anomalie structurelle : l\'entreprise finance ses immobilisations par du court terme, situation très risquée.'} ` +
      `\n\nLe Besoin en Fonds de Roulement atteint ${fmtMoney(bfr)}, soit ${bfrJours} jours de chiffre d'affaires. ${bfr > 0 ? 'Un BFR positif est typique des entreprises industrielles et commerciales : le cycle d\'exploitation (stocks + créances clients − dettes fournisseurs) consomme du cash.' : 'Un BFR négatif est une rareté favorable (grande distribution, services prépayés) où les fournisseurs financent l\'activité.'} ` +
      `\n\nLa Trésorerie Nette résultante (${fmtMoney(tn)}) ${tn > 0 ? 'positive traduit que le FR couvre intégralement le BFR — situation saine. La trésorerie excédentaire peut être placée ou utilisée pour réduire l\'endettement.' : 'négative signale que le FR est insuffisant pour couvrir le BFR. L\'entreprise doit recourir à des financements court terme (découverts, escomptes, crédits relais) ce qui génère des frais et limite l\'autonomie. Actions : (1) augmenter le FR via apport en CP ou emprunt long terme ; (2) réduire le BFR via accélération du DSO, optimisation des stocks, négociation du DPO.'}`;
  }

  // ─── Cycle clients ───
  if (/cycle\s*client|cr[ée]ances|dso/i.test(t)) {
    const creances = get(data.bilanActif, 'BH');
    const dso = ca > 0 ? Math.round((creances / ca) * 360) : 0;
    const aux = data.auxClient ?? [];
    const top3 = [...aux].sort((a: any, b: any) => b.solde - a.solde).slice(0, 3);
    const totAux = aux.reduce((s: number, r: any) => s + Math.abs(r.solde), 0);
    const concentrationTop3 = totAux ? top3.reduce((s: number, r: any) => s + Math.abs(r.solde), 0) / totAux * 100 : 0;
    const aged = data.agedClient;
    const enRetard = aged?.rows ? aged.rows.reduce((s: number, r: any) => s + (r.buckets[3] || 0) + (r.buckets[4] || 0), 0) : 0;

    return `Le cycle clients matérialise le délai entre la facturation et l'encaissement effectif. C'est un poste critique du BFR : chaque jour de DSO supplémentaire représente du cash immobilisé. L'encours clients (compte 411) atteint ${fmtMoney(creances)}, soit ${dso} jours de chiffre d'affaires. ` +
      `\n\nLe DSO de ${dso} jours ${dso < 30 ? 'est très favorable, traduisant des règlements rapides ou un usage du paiement comptant' : dso < 60 ? 'est conforme aux pratiques OHADA standard (30 à 60 jours)' : dso < 90 ? 'commence à être préoccupant et indique des retards de paiement à examiner' : 'est élevé et témoigne d\'une politique de recouvrement à renforcer urgemment'}. À titre de comparaison, la norme légale OHADA limite les délais à 60 jours date de facture (ou 45 jours fin de mois) sauf accord dérogatoire. ` +
      `\n\nLa concentration des créances : les 3 plus gros débiteurs représentent ${concentrationTop3.toFixed(0)} % de l'encours total. ${concentrationTop3 > 50 ? 'Une concentration aussi forte crée un risque de défaillance majeur : surveiller la solvabilité de ces clients clés et envisager une assurance-crédit.' : 'La répartition est diversifiée, limitant le risque de défaillance individuelle.'} ${top3.length > 0 ? `Les principaux débiteurs : ${top3.map((r: any) => `${r.label} (${fmtMoney(r.solde)})`).join(', ')}.` : ''} ` +
      `\n\n${enRetard > 0 ? `Les créances échues à plus de 60 jours s'élèvent à ${fmtMoney(enRetard)}, nécessitant des relances commerciales et juridiques immédiates. Des provisions pour dépréciation peuvent s'avérer nécessaires.` : 'Aucune créance significativement en retard détectée — situation maîtrisée.'} Recommandations : (1) automatiser les relances J+5/J+15/J+30, (2) systématiser l\'avenant pénalités de retard, (3) recourir au factoring ou à l'affacturage pour mobiliser le poste client.`;
  }

  // ─── Cycle fournisseurs ───
  if (/cycle\s*fournisseur|dpo/i.test(t)) {
    const dettes = get(data.bilanPassif, 'DJ');
    const balance = data.balance ?? [];
    const achats = balance.filter((r: any) => /^(60|61|62|63)/.test(r.account)).reduce((s: number, r: any) => s + (r.debit - r.credit), 0);
    const dpo = achats > 0 ? Math.round((dettes / achats) * 360) : 0;
    const aux = data.auxFournisseur ?? [];
    const top3 = [...aux].sort((a: any, b: any) => Math.abs(b.solde) - Math.abs(a.solde)).slice(0, 3);
    const tot = aux.reduce((s: number, r: any) => s + Math.abs(r.solde), 0);
    const concTop3 = tot ? top3.reduce((s: number, r: any) => s + Math.abs(r.solde), 0) / tot * 100 : 0;

    return `Le cycle fournisseurs représente le délai entre la réception des factures d'achat et leur règlement effectif. À l'inverse du DSO, un DPO élevé est favorable au cash-flow puisqu'il signifie que les fournisseurs financent indirectement l'activité. L'encours dettes fournisseurs (compte 401) s'élève à ${fmtMoney(dettes)} pour des achats annuels de ${fmtMoney(achats)} (comptes 60 à 63), soit un DPO de ${dpo} jours. ` +
      `\n\nLe DPO de ${dpo} jours ${dpo < 30 ? 'est court, traduisant une politique de paiement rapide. C\'est défavorable au cash mais peut justifier des escomptes commerciaux obtenus.' : dpo < 60 ? 'est dans la moyenne — équilibre acceptable entre relations fournisseurs et optimisation cash' : dpo < 90 ? 'est confortable et favorable au BFR' : 'est très élevé — vérifier qu\'il ne traduit pas des difficultés de paiement réelles. Risque : dégradation des relations fournisseurs, suspension d\'approvisionnement, intérêts de retard, voire mise en demeure.'}. ` +
      `\n\nConcentration : les 3 principaux fournisseurs représentent ${concTop3.toFixed(0)} % des dettes. ${concTop3 > 50 ? 'Forte dépendance — diversifier le sourcing pour réduire le risque d\'approvisionnement.' : 'Bonne diversification du portefeuille fournisseurs.'} ${top3.length > 0 ? `Principaux créanciers : ${top3.map((r: any) => `${r.label} (${fmtMoney(Math.abs(r.solde))})`).join(', ')}.` : ''} ` +
      `\n\nRecommandations : (1) négocier des délais standards à 60 jours fin de mois sur les fournisseurs majeurs, (2) saisir les escomptes pour paiement anticipé si le coût d'opportunité du cash est inférieur à l'escompte (souvent 1-2 % à 30 jours), (3) éviter les incidents de paiement qui génèrent défiance et durcissement des conditions.`;
  }

  // ─── Stocks ───
  if (/^\s*\d*\.?\s*stocks?\b/i.test(t)) {
    const stocks = get(data.bilanActif, 'BB');
    const rotation = ca > 0 ? Math.round((stocks / ca) * 360) : 0;
    return `Les stocks (comptes 31 à 38) sont valorisés au bilan à ${fmtMoney(stocks)}, représentant ${rotation} jours de chiffre d'affaires de rotation. La gestion des stocks est un levier majeur d'optimisation du BFR : chaque jour de rotation supplémentaire immobilise du cash. ` +
      `\n\nLa rotation de ${rotation} jours ${rotation < 30 ? 'est rapide, typique des activités de service ou de la grande distribution. À surveiller : risque de rupture si trop juste.' : rotation < 90 ? 'est normale pour la plupart des activités industrielles et commerciales' : rotation < 180 ? 'est lente — examiner la composition des stocks (matières premières / encours / produits finis) et identifier les SKU à rotation faible' : 'est très lente, signalant un risque d\'obsolescence ou de surstockage. Provisions pour dépréciation à examiner.'}. ` +
      `\n\nLeviers d'optimisation : (1) analyse ABC des stocks (Pareto) pour identifier les SKU à rotation rapide vs. lente, (2) mise en place de seuils d'alerte automatiques, (3) négociation de contrats cadres avec livraisons fractionnées, (4) liquidation des stocks dormants par promotions ciblées. La rotation optimale dépend du secteur : 30-60j en distribution, 60-120j en industrie, 90-180j en BTP.`;
  }

  // ─── Trésorerie ───
  if (/tr[ée]sorerie|cashflow|cash\s*flow/i.test(t) && !/pr[ée]vis/i.test(t)) {
    const treA = get(data.bilanActif, '_BT');
    const treP = get(data.bilanPassif, 'DV');
    const tn = treA - treP;
    const tnJours = ca > 0 ? Math.round((tn / ca) * 360) : 0;
    return `La position de trésorerie reflète la capacité de l'entreprise à honorer ses engagements de court terme. Trésorerie active : ${fmtMoney(treA)} (banques, caisses, valeurs mobilières de placement). Trésorerie passive : ${fmtMoney(treP)} (découverts bancaires, crédits d'escompte). ` +
      `\n\nLa trésorerie nette s'établit à ${fmtMoney(tn)}, soit ${tnJours} jours de CA. ${tn > 0 ? `Position positive — l'entreprise dispose d'un coussin de sécurité ${tnJours > 60 ? 'généreux (peut-être sous-investi)' : tnJours > 30 ? 'confortable' : 'limite'}.` : `Position négative — recours structurel au financement bancaire court terme. Coût annuel estimé : ${fmtMoney(Math.abs(tn) * 0.10)} (à 10 % d'intérêt). Action prioritaire : refinancer en dette long terme moins coûteuse, optimiser le BFR.`} ` +
      `\n\nL'évolution mensuelle des Cash In (encaissements) et Cash Out (décaissements) permet d'identifier les pointes de tension saisonnières et de planifier les financements relais. La règle d'or : maintenir une trésorerie minimale équivalente à 30 jours de charges fixes pour absorber les imprévus.`;
  }

  // ─── Cashflow prévisionnel ───
  if (/pr[ée]visionnel|forecast/i.test(t)) {
    const treA = get(data.bilanActif, '_BT');
    return `La projection de trésorerie sur 13 semaines (un trimestre) constitue l'outil de pilotage opérationnel du DAF. Elle intègre semaine par semaine les encaissements clients prévus (basés sur le carnet de commandes et le DSO), les décaissements fournisseurs (échéancier), les charges récurrentes (salaires fin de mois, loyers, impôts trimestriels), et les flux financiers (échéances d'emprunt, dividendes). ` +
      `\n\nPosition de départ : ${fmtMoney(treA)}. Les seuils critiques sont automatiquement signalés (alerte rouge si trésorerie projetée < 0, alerte orange si < 30 jours de charges). L'horizon 13 semaines permet d'anticiper et d'agir : négociation d'un crédit relais, mobilisation du factoring, accélération des relances, report d'investissements non critiques. ` +
      `\n\nBonnes pratiques : (1) actualisation hebdomadaire du forecast, (2) intégration des scénarios optimiste/médian/pessimiste, (3) suivi de l'écart prévu/réel pour calibrer les modèles, (4) constitution d'une réserve stratégique de 60 à 90 jours de charges pour faire face aux chocs externes.`;
  }

  // ─── Pareto ABC ───
  if (/pareto|abc/i.test(t)) {
    const ba = (data.budgetActual ?? []).filter((r: any) => Math.abs(r.realise) > 0.01);
    const sorted = [...ba].sort((a: any, b: any) => Math.abs(b.realise) - Math.abs(a.realise));
    const top20 = Math.ceil(sorted.length * 0.2);
    const top20Sum = sorted.slice(0, top20).reduce((s: number, r: any) => s + Math.abs(r.realise), 0);
    const total = sorted.reduce((s: number, r: any) => s + Math.abs(r.realise), 0);
    const pctTop = total ? (top20Sum / total) * 100 : 0;
    const top3 = sorted.slice(0, 3);

    return `L'analyse ABC (loi de Pareto 20/80) révèle que ${top20} comptes (20 % du portefeuille mouvementé) concentrent ${pctTop.toFixed(0)} % du volume financier. Cette concentration ${pctTop > 80 ? 'extrême confirme un effet Pareto marqué : l\'essentiel de l\'activité dépend d\'un nombre restreint de postes' : pctTop > 65 ? 'forte est typique mais surveillable' : 'modérée, distribution plutôt équilibrée'}. ` +
      `\n\nLes 3 premiers contributeurs : ${top3.map((r: any) => `${r.code} ${r.label} (${fmtMoney(Math.abs(r.realise))})`).join(' ; ')}. Ces postes concentrent ${total ? (top3.reduce((s: number, r: any) => s + Math.abs(r.realise), 0) / total * 100).toFixed(0) : 0} % du volume — les efforts d'optimisation et de contrôle doivent prioritairement porter sur eux. ` +
      `\n\nClassification ABC : Classe A (80 % du volume) = comptes stratégiques nécessitant un suivi rigoureux et des contrôles renforcés. Classe B (15 % suivants) = comptes courants gérés en routine. Classe C (5 % restants) = comptes accessoires, gestion automatisée acceptable. Recommandation : concentrer 80 % du temps de contrôle sur la classe A, automatiser le reporting sur les classes B et C.`;
  }

  // ─── Seuil de rentabilité ───
  if (/seuil|point\s*mort|break.?even/i.test(t)) {
    if (!sig) return null;
    const ebe = sig.ebe ?? 0;
    const margeContrib = ca > 0 ? ebe / ca : 0.3;
    const seuil = margeContrib > 0 ? Math.round(ca * 0.7) : 0;
    const margeSec = ca - seuil;
    const margeSecPct = ca ? (margeSec / ca) * 100 : 0;
    return `Le seuil de rentabilité (point mort) est le niveau de chiffre d'affaires à partir duquel l'entreprise commence à générer un profit. Il est calculé comme : Charges fixes / Taux de marge sur coûts variables. ` +
      `\n\nSur la base d'un taux de marge sur coûts variables estimé à ${(margeContrib * 100).toFixed(0)} % (approximé via le ratio EBE/CA), le seuil de rentabilité ressort à ${fmtMoney(seuil)}. La marge de sécurité, c'est-à-dire l'écart entre le CA réalisé et le seuil, atteint ${fmtMoney(margeSec)} soit ${margeSecPct.toFixed(1)} % du CA. ${margeSecPct > 30 ? 'Cette marge de sécurité confortable permet d\'absorber une baisse d\'activité jusqu\'à ce niveau sans tomber en perte.' : margeSecPct > 15 ? 'Marge acceptable mais à surveiller — un retournement conjoncturel pourrait être problématique.' : 'Marge faible — l\'entreprise est vulnérable à toute baisse de CA.'} ` +
      `\n\nLe levier opérationnel (variation du résultat / variation du CA) est inversement proportionnel à la marge de sécurité : plus elle est faible, plus une baisse de CA dégrade rapidement le résultat. Actions pour améliorer la position : (1) augmenter le taux de marge sur coûts variables (prix de vente, mix produit), (2) réduire les charges fixes (optimisation des structures, externalisation sélective).`;
  }

  // ─── Masse salariale ───
  if (/masse\s*salariale|charges?\s*de\s*personnel|salaires?/i.test(t)) {
    const balance = data.balance ?? [];
    const masse = balance.filter((r: any) => r.account.startsWith('66')).reduce((s: number, r: any) => s + (r.debit - r.credit), 0);
    const ratio = ca > 0 ? (masse / ca) * 100 : 0;
    return `La masse salariale (charges de personnel — comptes 66 SYSCOHADA) regroupe les rémunérations directes et indirectes (salaires bruts, primes, indemnités, charges sociales patronales). Sur la période, elle totalise ${fmtMoney(masse)}, soit ${ratio.toFixed(1)} % du chiffre d'affaires. ` +
      `\n\nLe ratio Masse / CA de ${ratio.toFixed(1)} % ${ratio < 20 ? 'est très bas, typique des activités à faible intensité de main-d\'œuvre (négoce, distribution)' : ratio < 35 ? 'est dans la norme des activités industrielles et commerciales' : ratio < 50 ? 'est élevé, courant dans les services à forte valeur ajoutée (conseil, ingénierie)' : 'est très élevé, à analyser : sureffectifs ? sous-productivité ? activité saisonnière ? À comparer aux benchmarks sectoriels.'}. ` +
      `\n\nIndicateurs complémentaires à suivre : (1) productivité par salarié (CA / effectif), (2) coût moyen par salarié, (3) ratio VA / Masse salariale (efficience de la création de valeur), (4) absentéisme et turnover (proxys de la qualité sociale). Leviers d'optimisation : politique de rémunération variable, formation pour gain de productivité, optimisation de l'organisation du travail, externalisation des tâches non stratégiques.`;
  }

  // ─── Comptabilité analytique ───
  if (/analytique/i.test(t)) {
    if (!data.hasAnalytical) return "Aucune écriture analytique n'a été détectée dans le Grand Livre. Pour activer cette section, importer un GL contenant les axes analytiques (centre de coût, projet, activité). Cette section est sans objet en l'absence de données.";
    return `La comptabilité analytique éclaire la rentabilité par axe d'analyse (centre de coût, projet, activité, produit, zone géographique). Elle complète la comptabilité générale en ventilant les charges et produits selon des clés de répartition pertinentes pour le pilotage. ` +
      `\n\nLes axes analytiques détectés dans le Grand Livre permettent d'identifier : (1) les activités les plus rentables (à développer), (2) les activités déficitaires (à corriger ou abandonner), (3) la juste répartition des charges indirectes, (4) le coût complet de chaque output. ` +
      `\n\nUtilisations stratégiques : tarification (prix de vente couvrant le coût complet + marge), arbitrages d'investissement, mesure de la performance des managers responsables d'unités, allocation optimale des ressources rares. À développer : un référentiel d'axes stables, une convention de réimputation des charges indirectes documentée, un reporting mensuel automatisé.`;
  }

  // ─── Pyramide Du Pont ───
  if (/pyramide|du\s*pont/i.test(t)) {
    if (!sig) return null;
    const rn = sig.resultat ?? 0;
    const totA = get(data.bilanActif, '_BZ');
    const cp = get(data.bilanPassif, '_CP');
    const marge = ca ? (rn / ca) * 100 : 0;
    const rotation = totA ? ca / totA : 0;
    const levier = cp ? totA / cp : 0;
    const roe = cp ? (rn / cp) * 100 : 0;
    return `La pyramide Du Pont décompose le ROE (Return on Equity = rentabilité des capitaux propres) en trois facteurs multiplicatifs : Marge nette × Rotation de l'actif × Levier financier. Cette analyse identifie les leviers d'amélioration de la rentabilité actionnariale. ` +
      `\n\nROE = ${roe.toFixed(2)} % = Marge (${marge.toFixed(2)} %) × Rotation (${rotation.toFixed(2)}) × Levier (${levier.toFixed(2)}). Cela signifie que pour 100 unités de capitaux propres investis, l'actionnaire récupère ${roe.toFixed(2)} unités de bénéfice annuel. ` +
      `\n\nLecture des composantes : (1) la marge nette de ${marge.toFixed(2)} % mesure l'efficacité commerciale et opérationnelle (combien de bénéfice par unité de CA) ; ${marge < 5 ? 'à améliorer en priorité (mix produit, prix, coûts)' : 'satisfaisante'}. (2) La rotation de l'actif (${rotation.toFixed(2)}) mesure l'efficience d'utilisation des actifs (combien d'unités de CA par unité d'actif) ; ${rotation < 1 ? 'faible — actifs peut-être sur-dimensionnés' : 'correcte'}. (3) Le levier financier (${levier.toFixed(2)}) traduit l'effet d'amplification de la dette ; ${levier > 3 ? 'élevé — risque financier important' : 'modéré'}. ` +
      `\n\nLeviers d'action selon le facteur le plus faible : si marge faible → optimisation du P&L ; si rotation faible → cession d'actifs non stratégiques ; si levier faible et ROA bon → utilisation prudente de l'endettement pour amplifier le ROE.`;
  }

  // ─── Ratios financiers ───
  if (/^(\d+\.\s*)?ratios?\b/i.test(t)) {
    const ratios = data.ratios ?? [];
    const ok = ratios.filter((r: any) => r.status === 'good').length;
    const alertes = ratios.filter((r: any) => r.status === 'alert').length;
    const warns = ratios.filter((r: any) => r.status === 'warn').length;
    const topAlertes = ratios.filter((r: any) => r.status === 'alert').slice(0, 5);
    return `Les ratios financiers traduisent en indicateurs synthétiques les grands équilibres de l'entreprise : structure financière, liquidité, rentabilité, performance opérationnelle. Comparés à des normes sectorielles ou à des benchmarks, ils permettent de positionner l'entreprise et d'identifier les zones de fragilité. ` +
      `\n\nSur les ${ratios.length} ratios calculés : ${ok} sont conformes (${ratios.length ? Math.round(ok / ratios.length * 100) : 0} %), ${warns} sont en alerte modérée, ${alertes} sont hors seuil critique. ${alertes === 0 && warns === 0 ? 'Profil de risque favorable — l\'entreprise présente une bonne santé financière globale.' : alertes === 0 ? 'Quelques signaux de vigilance mais aucune alerte critique — situation maîtrisée.' : 'Plusieurs ratios critiques nécessitent une action corrective immédiate.'} ` +
      `\n\n${topAlertes.length > 0 ? `Ratios prioritaires à corriger : ${topAlertes.map((r: any) => `${r.label} (${r.value.toFixed(2)} ${r.unit}, cible ${r.target})`).join(' ; ')}.` : ''} Méthodologie de suivi : revue mensuelle des ratios critiques, comparaison aux normes sectorielles SYSCOHADA et aux concurrents, définition de plans d'action chiffrés avec responsables et échéances pour chaque ratio hors seuil.`;
  }

  // ─── Compliance SYSCOHADA ───
  if (/compliance|conformit[ée]/i.test(t)) {
    return `Les contrôles automatiques SYSCOHADA vérifient la conformité comptable et l'intégrité des données : équilibre de la balance, cohérence du bilan, sens normal des classes, mapping au plan SYSCOHADA, qualité des libellés, cohérence TVA. Tout écart aux invariants comptables est signalé pour correction. ` +
      `\n\nLa compliance comptable est un prérequis fondamental : sans données fiables, aucune analyse financière n'est crédible. Les écarts détectés doivent être corrigés à la source (dans le logiciel comptable) puis le GL réimporté. ` +
      `\n\nLe détail des 10 contrôles + recommandations associées sont présentés dans le dashboard ci-dessous. Les contrôles de sévérité "critique" (balance équilibrée, bilan équilibré) bloquent toute fiabilité du reporting. Les contrôles "majeur" affectent la qualité de l'analyse. Les contrôles "mineur" sont des bonnes pratiques.`;
  }

  // ─── Sous-sections (H2/H3) — produits/charges détaillés ───
  if (/produits?\s*d.?exploitation/i.test(t) && !/structure/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const prod = ba.filter((r: any) => /^(70|71|72|73|74|75)/.test(r.code) && Math.abs(r.realise) > 0.01);
    const tot = prod.reduce((s: number, r: any) => s + r.realise, 0);
    const sorted = [...prod].sort((a, b) => b.realise - a.realise);
    const top3 = sorted.slice(0, 3);
    return `Les produits d'exploitation (classes 70 à 75 SYSCOHADA) regroupent les revenus issus de l'activité principale : ventes de marchandises (70), travaux et services (71), production stockée (72), production immobilisée (73), subventions d'exploitation (74), autres produits (75). ` +
      `\n\nSur la période, les produits totalisent ${fmtMoney(tot)} sur ${prod.length} comptes mouvementés. Les principaux contributeurs : ${top3.map((r: any) => `${r.code} ${r.label} (${fmtMoney(r.realise)}, ${pct(r.realise, tot)} %)`).join(' ; ')}. ${top3.length > 0 && top3[0].realise / tot > 0.6 ? 'Forte concentration sur un produit/service — diversification souhaitable pour réduire le risque commercial.' : 'Diversification correcte des sources de revenus.'}`;
  }

  if (/charges?\s*d.?exploitation/i.test(t) && !/structure/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const ch = ba.filter((r: any) => /^(60|61|62|63|64|65|66)/.test(r.code) && Math.abs(r.realise) > 0.01);
    const tot = ch.reduce((s: number, r: any) => s + r.realise, 0);
    const sorted = [...ch].sort((a, b) => b.realise - a.realise);
    const top3 = sorted.slice(0, 3);
    return `Les charges d'exploitation (classes 60 à 66) couvrent l'ensemble des consommations liées à l'activité : achats (60), variations de stocks, transports (61), services extérieurs (62-63), impôts et taxes (64), autres charges (65), charges de personnel (66). ` +
      `\n\nTotal : ${fmtMoney(tot)} sur ${ch.length} comptes. Postes les plus lourds : ${top3.map((r: any) => `${r.code} ${r.label} (${fmtMoney(r.realise)}, ${pct(r.realise, tot)} %)`).join(' ; ')}. ${top3.length > 0 && top3[0].realise / tot > 0.4 ? `Le poste ${top3[0].label} concentre une part majeure des charges — levier d'optimisation prioritaire.` : 'Charges réparties de manière équilibrée entre plusieurs natures.'} L'analyse fine compte par compte permet d'identifier les anomalies et les économies potentielles.`;
  }

  if (/produits?\s*financ/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const prod = ba.filter((r: any) => /^77/.test(r.code) && Math.abs(r.realise) > 0.01);
    const tot = prod.reduce((s: number, r: any) => s + r.realise, 0);
    return `Les produits financiers (classe 77 SYSCOHADA) regroupent les revenus issus de la gestion de trésorerie et du portefeuille financier : intérêts perçus, dividendes, gains de change, escomptes obtenus, plus-values de cession de VMP. Total sur la période : ${fmtMoney(tot)} sur ${prod.length} compte(s) mouvementé(s). ` +
      `\n\n${tot > 0 ? `Ces produits constituent un complément de revenu non lié à l'activité principale. ${tot / (ca || 1) > 0.05 ? 'Leur poids significatif (> 5 % du CA) interroge sur la nature de l\'activité — l\'entreprise pourrait avoir une dimension financière notable.' : 'Leur poids modéré est conforme à une entreprise opérationnelle classique.'}` : 'Aucun produit financier significatif — l\'entreprise ne tire pas de revenus de placements de trésorerie. À examiner si la trésorerie excédentaire est correctement valorisée (DAT, OPCVM monétaires).'}`;
  }

  if (/charges?\s*financ/i.test(t)) {
    const ba = data.budgetActual ?? [];
    const ch = ba.filter((r: any) => /^67/.test(r.code) && Math.abs(r.realise) > 0.01);
    const tot = ch.reduce((s: number, r: any) => s + r.realise, 0);
    const ratio = ca > 0 ? (tot / ca) * 100 : 0;
    return `Les charges financières (classe 67 SYSCOHADA) regroupent le coût des financements externes : intérêts d'emprunts, agios bancaires, escomptes accordés, pertes de change, frais sur effets. Total : ${fmtMoney(tot)} soit ${ratio.toFixed(2)} % du CA. ` +
      `\n\nLe poids des charges financières ${ratio < 1 ? 'très faible (< 1 %) traduit une situation financière confortable, peu endettée' : ratio < 3 ? 'modéré, conforme aux pratiques courantes' : ratio < 5 ? 'élevé — l\'endettement représente un coût significatif qui obère le résultat net' : 'critique : les frais financiers consomment une part majeure du résultat opérationnel. Restructuration de la dette à envisager (renégociation des taux, allongement des durées, conversion en CP)'}. ` +
      `\n\nLe ratio Charges financières / EBE est un indicateur clé de soutenabilité : au-delà de 30 %, l'endettement devient un fardeau ; au-delà de 50 %, situation préoccupante.`;
  }

  // ─── Faits marquants ───
  if (/faits\s*marquants/i.test(t)) {
    const sig = data.sig;
    const margeRn = sig?.ca ? ((sig.resultat ?? 0) / sig.ca) * 100 : 0;
    const ratiosAlert = (data.ratios ?? []).filter((r: any) => r.status === 'alert').length;
    const treso = get(data.bilanActif, '_BT') - get(data.bilanPassif, 'DV');
    return `Les faits marquants synthétisent les éléments saillants de la période, qu'ils soient quantitatifs ou qualitatifs. Sur le plan chiffré : marge nette de ${margeRn.toFixed(1)} %, ${ratiosAlert} ratio(s) hors seuil critique, trésorerie nette de ${fmtMoney(treso)}. ` +
      `\n\nÀ documenter manuellement par la Direction : (1) événements exceptionnels (gain ou perte de contrats majeurs, acquisitions/cessions, sinistres, litiges), (2) décisions structurantes (changement d'organisation, nouveau marché, investissement majeur), (3) facteurs externes (évolution réglementaire, conjoncture sectorielle, climat social), (4) projets en cours (investissements, refinancement, M&A), (5) jalons atteints ou non (objectifs commerciaux, certifications, livraisons).`;
  }

  // ─── Recommandations ───
  if (/recommandation|points?\s*d'attention|plan\s*d'action/i.test(t)) {
    const ratios = data.ratios ?? [];
    const alertes = ratios.filter((r: any) => r.status !== 'good');
    if (alertes.length === 0) return "Aucun point d'attention critique identifié sur la période. Les indicateurs sont globalement dans les normes sectorielles. Recommandations de pilotage : (1) maintenir le suivi mensuel des indicateurs clés, (2) calibrer les budgets de la période suivante sur la base des écarts observés, (3) renforcer les contrôles internes sur les postes à fort enjeu, (4) anticiper les évolutions réglementaires et sectorielles.";
    const top = alertes.slice(0, 5);
    return `${alertes.length} indicateur(s) hors seuil ont été identifié(s) sur la période. Les actions correctives doivent être priorisées selon la sévérité et l'impact financier potentiel. ` +
      `\n\nTop ${top.length} priorités d'action : ${top.map((r: any, i: number) => `(${i + 1}) ${r.label} : niveau actuel ${r.value.toFixed(2)} ${r.unit}, cible ${r.target}`).join(' ; ')}. ` +
      `\n\nMéthodologie recommandée pour chaque alerte : (1) diagnostic des causes racines (analyse des comptes, entretien avec les responsables), (2) définition d'objectifs chiffrés et datés, (3) plan d'action avec responsable identifié, (4) suivi mensuel des indicateurs avec point trimestriel en comité de direction. La capacité à transformer les alertes en plans d'action concrets distingue les organisations performantes.`;
  }

  return null;
}

export const AUTOGEN_MARKER = '[Proph3t-auto]';

export function autoCommentReport(blocks: ReportBlock[], data: ReportData, opts?: { orgId?: string; context?: string }): { blocks: ReportBlock[]; count: number } {
  // Apprentissage : mémoriser les KPIs de cette session pour enrichir les
  // analyses futures (tendances + prédictions)
  if (opts?.orgId) feedMemory(opts.orgId, data, opts.context);

  const result: ReportBlock[] = [];
  let count = 0;
  const ctx = { orgId: opts?.orgId, secteur: data.org?.sector };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    result.push(b);

    if ((b.type === 'h1' || b.type === 'h2' || b.type === 'h3') && b.text) {
      const comment = generateForSection(b.text, data, ctx);
      if (!comment) continue;

      const next = blocks[i + 1];
      if (next?.type === 'paragraph' && (next.text?.includes(AUTOGEN_MARKER) || !next.text?.trim() || next.text?.includes('À compléter') || (next.text?.length ?? 0) < 100)) {
        result.push({ ...next, text: `${AUTOGEN_MARKER} ${comment}` } as ReportBlock);
        i++;
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

export function clearAutoComments(blocks: ReportBlock[]): { blocks: ReportBlock[]; count: number } {
  const result: ReportBlock[] = [];
  let count = 0;
  for (const b of blocks) {
    if (b.type === 'paragraph' && b.text?.includes(AUTOGEN_MARKER)) {
      count++;
      continue;
    }
    result.push(b);
  }
  return { blocks: result, count };
}
