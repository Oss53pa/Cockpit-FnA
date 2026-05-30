/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ─── DASHBOARD SNIPPET — mini-rendu enrichi par type ─────────────
import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { DASHBOARD_CATALOG } from './reportData';
import { fmtMoney } from '../../lib/format';
import { UnclassifiedAccountsModal } from '../../components/ui/UnclassifiedAccountsModal';

export function DashboardSnippet({ id, data, palette }: any) {
  const dash = DASHBOARD_CATALOG.find((d) => d.id === id);
  const [showEcartModal, setShowEcartModal] = useState(false);
  const vatRate = useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { computeVatRate } = require('../../engine/ratios');
      return computeVatRate(data.balance ?? []);
    } catch { return 0.18; }
  }, [data.balance]);

  const kpis = (() => {
    if (id === 'is_bvsa' || id === 'is_bvsa_monthly') {
      const ba = data.budgetActual ?? [];
      const charges = ba.filter((r: any) => r.isCharge);
      const produits = ba.filter((r: any) => !r.isCharge);
      const realiseProd = produits.reduce((s: number, r: any) => s + (Number(r.realise) || 0), 0);
      const realiseCharges = charges.reduce((s: number, r: any) => s + (Number(r.realise) || 0), 0);
      const budgetProd = produits.reduce((s: number, r: any) => s + (Number(r.budget) || 0), 0);
      const budgetCharges = charges.reduce((s: number, r: any) => s + (Number(r.budget) || 0), 0);
      const resultatReel = realiseProd - realiseCharges;
      const resultatBudget = budgetProd - budgetCharges;
      const execProd = budgetProd ? ((realiseProd / budgetProd) * 100).toFixed(1) + ' %' : '—';
      const execCharges = budgetCharges ? ((realiseCharges / budgetCharges) * 100).toFixed(1) + ' %' : '—';
      return [
        { label: 'Produits réalisés', value: fmtMoney(realiseProd), subValue: `Budget : ${fmtMoney(budgetProd)} · Exéc. ${execProd}` },
        { label: 'Charges réalisées', value: fmtMoney(realiseCharges), subValue: `Budget : ${fmtMoney(budgetCharges)} · Exéc. ${execCharges}` },
        { label: 'Résultat réel', value: fmtMoney(resultatReel) },
        { label: 'Écart vs budget', value: fmtMoney(resultatReel - resultatBudget) },
      ];
    }
    if (id === 'home' || id === 'cp' || id === 'crblock' || id?.startsWith('crblock_')) return [
      { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
      { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
      { label: 'EBE', value: fmtMoney(data.sig?.ebe ?? 0) },
      { label: 'Marge brute', value: fmtMoney(data.sig?.margeBrute ?? 0) },
    ];
    if (id === 'cashflow') {
      const tresoActive = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const tresoPassive = data.bilanPassif?.find((l: any) => l.code === 'DV')?.value ?? 0;
      const treso = tresoActive - tresoPassive;
      const cf = (data as any).cashflowMonthly as { encaissements: number[]; decaissements: number[] } | null;
      const totalIn = cf?.encaissements?.reduce((s: number, v: number) => s + v, 0) ?? 0;
      const totalOut = cf?.decaissements?.reduce((s: number, v: number) => s + v, 0) ?? 0;
      const netCash = totalIn - totalOut;
      return [
        { label: 'Total encaissé', value: fmtMoney(totalIn) },
        { label: 'Total décaissé', value: fmtMoney(totalOut) },
        { label: 'Trésorerie nette de clôture', value: fmtMoney(treso) },
        { label: 'Cash flow net', value: fmtMoney(netCash), subValue: totalIn > 0 ? `${((netCash / totalIn) * 100).toFixed(1)} % des encaissements` : '' },
      ];
    }
    if (id === 'receivables') {
      const ar = data.bilanActif?.find((l: any) => l.code === 'BH')?.value ?? 0;
      const ap = data.bilanPassif?.find((l: any) => l.code === 'DJ')?.value ?? 0;
      const balance = data.balance ?? [];
      const totalPurchases = balance
        .filter((r: any) => /^(60|61|62|63)/.test(r.account) && !r.account?.startsWith('603'))
        .reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      return [
        { label: 'Ventes (CA HT)', value: fmtMoney(data.sig?.ca ?? 0) },
        { label: 'Créances clients', value: fmtMoney(ar) },
        { label: 'Achats consommés', value: fmtMoney(totalPurchases), subValue: 'Comptes 60-63 (hors var. stocks)' },
        { label: 'Dettes fournisseurs', value: fmtMoney(ap) },
      ];
    }
    if (id?.startsWith('crsec_') && data.budgetActual) {
      const sec = id.replace('crsec_', '');
      const prefixMap: Record<string, string[]> = {
        produits_expl: ['70','71','72','73','74','75'], charges_expl: ['60','61','62','63','64','65','66'],
        produits_fin: ['77'], charges_fin: ['67'],
        produits_hao: ['82','84','86','88'], charges_hao: ['81','83','85'],
        impots: ['87','89'],
      };
      const pfx = prefixMap[sec] ?? [];
      const subset = data.budgetActual.filter((r: any) => pfx.some((p) => r.code.startsWith(p)));
      const totR = subset.reduce((s: number, r: any) => s + r.realise, 0);
      const totB = subset.reduce((s: number, r: any) => s + r.budget, 0);
      return [
        { label: 'Réalisé', value: fmtMoney(totR) },
        { label: 'Budget', value: fmtMoney(totB) },
        { label: 'Écart', value: fmtMoney(totR - totB) },
        { label: 'Comptes', value: String(subset.length) },
      ];
    }
    if (id === 'ratios') return data.ratios.slice(0, 4).map((r: any) => ({ label: r.label, value: r.unit === '%' ? `${r.value.toFixed(1)} %` : `${r.value.toFixed(2)}` }));
    if (id === 'exec') {
      const tresoActive = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const tresoPassive = data.bilanPassif?.find((l: any) => l.code === 'DV')?.value ?? 0;
      const treso = tresoActive - tresoPassive;
      const alertes = (data.ratios || []).filter((r: any) => r.status !== 'good').length;
      return [
        { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
        { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Alertes', value: `${alertes} ratio(s)` },
      ];
    }
    if (id === 'compliance') return [];
    if (id === 'breakeven') {
      const ca = data.sig?.ca ?? 0;
      const balance = data.balance ?? [];
      const sumDebMoinsCre = (regex: RegExp) => balance
        .filter((r: any) => regex.test(r.account))
        .reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const personnel  = sumDebMoinsCre(/^66/);
      const loyers     = sumDebMoinsCre(/^622/);
      const assurances = sumDebMoinsCre(/^625/);
      const dotations  = sumDebMoinsCre(/^68/);
      const chargesFixes = personnel + loyers + assurances + dotations;
      const achatsConsommes = sumDebMoinsCre(/^60/) - sumDebMoinsCre(/^603/);
      const varStocks       = sumDebMoinsCre(/^603/);
      const transports = sumDebMoinsCre(/^61/);
      const servExtA   = sumDebMoinsCre(/^62/) - loyers - assurances;
      const servExtB   = sumDebMoinsCre(/^63/);
      const chargesVariables = achatsConsommes + varStocks + transports + servExtA + servExtB;
      const margeCV = ca - chargesVariables;
      const tauxMargeCV = ca > 0 ? margeCV / ca : 0;
      const seuil = tauxMargeCV > 0 ? Math.round(chargesFixes / tauxMargeCV) : 0;
      const margeSec = ca - seuil;
      return [
        { label: 'CA', value: fmtMoney(ca), subValue: `Marge sur CV ${(tauxMargeCV * 100).toFixed(1)} %` },
        { label: 'Charges fixes', value: fmtMoney(chargesFixes), subValue: 'Pers + Loy + Ass + Dot (hors fin.)' },
        { label: 'Seuil rentabilité', value: fmtMoney(seuil), subValue: 'CF / Taux marge CV' },
        { label: 'Marge sécurité', value: fmtMoney(margeSec), subValue: ca > 0 ? `${((margeSec / ca) * 100).toFixed(1)} % du CA` : '—' },
      ];
    }
    if (id === 'pareto') return [];
    if (id === 'client') {
      const ca = data.sig?.ca ?? 0;
      const periodDays = (data as any).periodDays ?? 360;
      const balance = data.balance ?? [];
      const sainesD = balance.filter((r: any) => /^41[1-58]/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const douteusesD = balance.filter((r: any) => r.account?.startsWith('416')).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const provisions = balance.filter((r: any) => r.account?.startsWith('491')).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);
      const encoursBrut = sainesD + douteusesD;
      const encoursNet = encoursBrut - provisions;
      const pertesIrrec = balance.filter((r: any) => /^(6541|6594|654)/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const caTTC = ca * (1 + vatRate);
      const dso = caTTC > 0 ? Math.round((encoursNet / caTTC) * periodDays) : 0;
      return [
        { label: 'Encours net (411 − 491)', value: fmtMoney(encoursNet), subValue: `Brut ${fmtMoney(encoursBrut)} − prov ${fmtMoney(provisions)}` },
        { label: 'DSO', value: caTTC > 0 ? `${dso} j` : 'n.a.' },
        { label: 'Dont douteux (416)', value: fmtMoney(douteusesD), subValue: encoursBrut > 0 ? `${((douteusesD / encoursBrut) * 100).toFixed(1)} % du brut` : '—' },
        { label: 'Pertes sur créances', value: fmtMoney(pertesIrrec), subValue: 'Comptes 654/6594 (charge)' },
      ];
    }
    if (id === 'fr') {
      const balance = data.balance ?? [];
      const periodDays = (data as any).periodDays ?? 360;
      const dettesNettes = balance.filter((r: any) => /^40/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);
      const fnp = balance.filter((r: any) => /^408/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);
      const effetsAPayer = balance.filter((r: any) => /^403/.test(r.account)).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);
      const achatsHT = balance
        .filter((r: any) => /^(60|61|62|63)/.test(r.account) && !r.account?.startsWith('603'))
        .reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const achatsTTC = achatsHT * (1 + vatRate);
      const dpo = achatsTTC > 0 ? Math.round((dettesNettes / achatsTTC) * periodDays) : 0;
      return [
        { label: 'Dettes fournisseurs (40x)', value: fmtMoney(dettesNettes), subValue: `dont effets ${fmtMoney(effetsAPayer)}` },
        { label: 'DPO', value: achatsTTC > 0 ? `${dpo} j` : 'n.a.' },
        { label: 'Achats N (60-63 HT)', value: fmtMoney(achatsHT), subValue: `TTC ${fmtMoney(achatsTTC)}` },
        { label: 'Factures non parvenues (408)', value: fmtMoney(fnp), subValue: 'Provision charges courues' },
      ];
    }
    if (id === 'cashforecast') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const cf = (data as any).cashflowMonthly as { encaissements: number[]; decaissements: number[] } | null;
      const monthsActifs = (cf?.encaissements ?? []).filter((v: number) => v > 0).length || 1;
      const moyEnc = (cf?.encaissements?.reduce((s: number, v: number) => s + v, 0) ?? 0) / monthsActifs;
      const moyDec = (cf?.decaissements?.reduce((s: number, v: number) => s + v, 0) ?? 0) / monthsActifs;
      return [
        { label: 'Cash actuel', value: fmtMoney(treso) },
        { label: 'Horizon', value: '13 semaines' },
        { label: 'Encaissements prévus', value: fmtMoney(moyEnc * 3), subValue: 'Moyenne 3 mois × 3' },
        { label: 'Décaissements prévus', value: fmtMoney(moyDec * 3), subValue: 'Moyenne 3 mois × 3' },
      ];
    }
    if (id === 'waterfall') return [
      { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
      { label: 'Marge brute', value: fmtMoney(data.sig?.margeBrute ?? 0) },
      { label: 'EBE', value: fmtMoney(data.sig?.ebe ?? 0) },
      { label: 'Résultat net', value: fmtMoney(data.sig?.resultat ?? 0) },
    ];
    if (id === 'sal') {
      const balance = data.balance || [];
      const compte66 = balance.filter((r: any) => r.account?.startsWith('66'));
      const masse = compte66.reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const charges66 = balance.filter((r: any) => r.account?.startsWith('663') || r.account?.startsWith('664')).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const remBrutes = balance.filter((r: any) => r.account?.startsWith('661') || r.account?.startsWith('662')).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const ratio = data.sig?.ca ? (masse / data.sig.ca) * 100 : 0;
      const tauxCharges = remBrutes > 0 ? (charges66 / remBrutes) * 100 : 0;
      return [
        { label: 'Masse salariale (66)', value: fmtMoney(masse), subValue: `${compte66.length} comptes` },
        { label: 'Ratio masse / CA', value: `${ratio.toFixed(1)} %`, subValue: 'Indicateur productivité' },
        { label: 'Rém. brutes (661-662)', value: fmtMoney(remBrutes) },
        { label: 'Charges sociales', value: fmtMoney(charges66), subValue: `${tauxCharges.toFixed(1)} % des brutes` },
      ];
    }
    if (id === 'bfr') {
      const a = data.bilanActif ?? [];
      const p = data.bilanPassif ?? [];
      const get = (lines: any[], c: string) => lines.find((l: any) => l.code === c)?.value ?? 0;
      const actifCirc = get(a, '_BK');
      const passifCirc = get(p, '_DP');
      const fr = get(p, '_DF') - get(a, '_AZ');
      const bfr = actifCirc - passifCirc;
      const tn = get(a, '_BT') - get(p, 'DV');
      return [
        { label: 'FR (Fonds roulement)', value: fmtMoney(fr), subValue: 'Ress. stables − Actif immo' },
        { label: 'BFR', value: fmtMoney(bfr), subValue: 'Actif circ. − Passif circ.' },
        { label: 'TN (Trésorerie nette)', value: fmtMoney(tn), subValue: 'Trés. active − Trés. passive' },
        { label: 'Vérification', value: Math.abs(fr - bfr - tn) < 1 ? '✓ FR = BFR + TN' : `⚠ écart ${fmtMoney(fr - bfr - tn)}` },
      ];
    }
    if (id === 'analytical') return [
      { label: 'Status', value: data.hasAnalytical ? 'Données disponibles' : 'Aucune donnée' },
      { label: 'CA', value: fmtMoney(data.sig?.ca ?? 0) },
      { label: 'Résultat', value: fmtMoney(data.sig?.resultat ?? 0) },
      { label: 'Voir page Analytique', value: '→' },
    ];

    const balance = data.balance ?? [];
    const sumD = (...prefixes: string[]) => balance.filter((r: any) => prefixes.some((p) => r.account?.startsWith(p))).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
    const sumC = (...prefixes: string[]) => balance.filter((r: any) => prefixes.some((p) => r.account?.startsWith(p))).reduce((s: number, r: any) => s + (r.soldeC - r.soldeD), 0);

    if (id === 'stk') {
      const stocksMP = sumD('32'); const stocksProd = sumD('33', '34', '35'); const stocksMarch = sumD('31'); const provStk = sumC('39');
      const total = stocksMP + stocksProd + stocksMarch; const ca = data.sig?.ca ?? 0;
      const rotation = total > 0 ? Math.round((ca / total) * 1) : 0;
      return [
        { label: 'Stocks marchandises', value: fmtMoney(stocksMarch), subValue: 'Compte 31' },
        { label: 'Stocks MP & fournitures', value: fmtMoney(stocksMP), subValue: 'Compte 32' },
        { label: 'Stocks produits', value: fmtMoney(stocksProd), subValue: 'Comptes 33-35' },
        { label: 'Provisions stocks', value: fmtMoney(provStk), subValue: `Rotation ${rotation}× / an` },
      ];
    }
    if (id === 'immo') {
      const immoBrut = sumD('20','21','22','23','24','25'); const immoFin = sumD('26','27');
      const amorts = sumC('28'); const provImmo = sumC('29');
      const vnc = immoBrut + immoFin - amorts - provImmo;
      const tauxAmort = immoBrut > 0 ? (amorts / immoBrut) * 100 : 0;
      return [
        { label: 'Immo. brutes', value: fmtMoney(immoBrut + immoFin), subValue: 'Comptes 20-27' },
        { label: 'Amortissements', value: fmtMoney(amorts), subValue: `${tauxAmort.toFixed(1)} % vétusté` },
        { label: 'VNC', value: fmtMoney(vnc), subValue: 'Net brut − amorts − prov' },
        { label: 'Provisions', value: fmtMoney(provImmo), subValue: 'Compte 29' },
      ];
    }
    if (id === 'tre') {
      const banques = sumD('52','53','54'); const caisse = sumD('57'); const decouvert = sumC('56');
      const treso = banques + caisse - decouvert; const ca = data.sig?.ca ?? 0;
      const joursTreso = ca > 0 ? Math.round((treso / ca) * 360) : 0;
      return [
        { label: 'Trésorerie nette', value: fmtMoney(treso), subValue: 'Banques + caisse − découvert' },
        { label: 'Banques (52-54)', value: fmtMoney(banques) },
        { label: 'Caisse (57)', value: fmtMoney(caisse) },
        { label: 'Découverts (56)', value: fmtMoney(decouvert), subValue: `Trés. = ${joursTreso}j de CA` },
      ];
    }
    if (id === 'fis') {
      const tvaCol = sumC('443'); const tvaDed = sumD('445'); const tvaAPayer = tvaCol - tvaDed;
      const isDu = sumC('441'); const taxes = sumD('64'); const ca = data.sig?.ca ?? 0;
      const pressionFis = ca > 0 ? ((tvaAPayer + isDu + taxes) / ca) * 100 : 0;
      return [
        { label: 'TVA collectée (443)', value: fmtMoney(tvaCol) },
        { label: 'TVA déductible (445)', value: fmtMoney(tvaDed), subValue: `À payer ${fmtMoney(tvaAPayer)}` },
        { label: 'IS dû (441)', value: fmtMoney(isDu) },
        { label: 'Impôts & taxes (64)', value: fmtMoney(taxes), subValue: `Pression ${pressionFis.toFixed(1)} %` },
      ];
    }

    const ca = data.sig?.ca ?? 0;
    const rn = data.sig?.resultat ?? 0;
    if (id === 'ind') {
      const achatsMP = sumD('602','604','605'); const prodImmob = sumC('72'); const margeIndus = ca - achatsMP;
      return [
        { label: 'CA industriel', value: fmtMoney(ca) },
        { label: 'Achats MP', value: fmtMoney(achatsMP), subValue: ca > 0 ? `${((achatsMP/ca)*100).toFixed(1)} % du CA` : '—' },
        { label: 'Marge industrielle', value: fmtMoney(margeIndus), subValue: ca > 0 ? `${((margeIndus/ca)*100).toFixed(1)} %` : '—' },
        { label: 'Production immobilisée', value: fmtMoney(prodImmob), subValue: 'Compte 72' },
      ];
    }
    if (id === 'btp') {
      const sousTraitance = sumD('604','611'); const travauxEnCours = sumD('335');
      const ratioSousTr = ca > 0 ? (sousTraitance / ca) * 100 : 0;
      return [
        { label: 'CA travaux', value: fmtMoney(ca) },
        { label: 'Sous-traitance', value: fmtMoney(sousTraitance), subValue: `${ratioSousTr.toFixed(1)} % du CA` },
        { label: 'Travaux en cours', value: fmtMoney(travauxEnCours), subValue: 'Compte 335' },
        { label: 'Résultat chantiers', value: fmtMoney(rn), subValue: ca > 0 ? `${((rn/ca)*100).toFixed(1)} % marge` : '—' },
      ];
    }
    if (id === 'com') {
      const ventesMarch = sumC('701'); const achatsMarch = sumD('601'); const margeCom = ventesMarch - achatsMarch;
      const tauxMarque = ventesMarch > 0 ? (margeCom/ventesMarch)*100 : 0;
      const tauxMarge = achatsMarch > 0 ? (margeCom/achatsMarch)*100 : 0;
      return [
        { label: 'Ventes marchandises', value: fmtMoney(ventesMarch), subValue: 'Compte 701' },
        { label: 'Achats marchandises', value: fmtMoney(achatsMarch), subValue: 'Compte 601' },
        { label: 'Marge commerciale', value: fmtMoney(margeCom) },
        { label: 'Taux marque / marge', value: `${tauxMarque.toFixed(1)} % / ${tauxMarge.toFixed(1)} %`, subValue: 'Marque/Vente · Marge/Achat' },
      ];
    }
    if (id === 'mfi') {
      const interets = sumC('77'); const encours = sumD('41','42','46'); const provDouteux = sumC('491','496');
      const par = encours > 0 ? (provDouteux/encours)*100 : 0;
      return [
        { label: 'PNB (intérêts perçus)', value: fmtMoney(interets), subValue: 'Compte 77' },
        { label: 'Encours total', value: fmtMoney(encours), subValue: 'Comptes 41, 42, 46' },
        { label: 'Provisions douteux', value: fmtMoney(provDouteux), subValue: 'Comptes 491, 496' },
        { label: 'PAR (Portfolio at Risk)', value: `${par.toFixed(2)} %`, subValue: 'Provisions / Encours' },
      ];
    }
    if (id === 'imco') {
      const loyers = sumC('706','707'); const chargesLoc = sumD('614','615'); const valImmo = sumD('22','23');
      const renta = valImmo > 0 ? (loyers/valImmo)*100 : 0;
      return [
        { label: 'Loyers perçus', value: fmtMoney(loyers), subValue: 'Comptes 706/707' },
        { label: 'Charges locatives', value: fmtMoney(chargesLoc), subValue: 'Comptes 614/615' },
        { label: 'Valeur immobilière', value: fmtMoney(valImmo), subValue: 'Terrains + bâtiments' },
        { label: 'Rentabilité brute', value: `${renta.toFixed(2)} %`, subValue: 'Loyers / Val. immo' },
      ];
    }
    if (id === 'hot') {
      const ventesHeb = sumC('706'); const ventesFB = sumC('707'); const ratioFB = ca > 0 ? (ventesFB/ca)*100 : 0;
      return [
        { label: 'Ventes hébergement', value: fmtMoney(ventesHeb), subValue: 'Compte 706' },
        { label: 'Ventes F&B', value: fmtMoney(ventesFB), subValue: `${ratioFB.toFixed(1)} % du CA` },
        { label: 'CA total', value: fmtMoney(ca) },
        { label: 'GOP (RN)', value: fmtMoney(rn), subValue: ca > 0 ? `${((rn/ca)*100).toFixed(1)} % CA` : '—' },
      ];
    }
    if (id === 'agri') {
      const intrants = sumD('602','604','605'); const subvAgri = sumC('71'); const margeAgri = ca - intrants;
      return [
        { label: 'CA récoltes', value: fmtMoney(ca) },
        { label: 'Intrants', value: fmtMoney(intrants), subValue: 'Semences, engrais, phyto' },
        { label: 'Marge agricole', value: fmtMoney(margeAgri) },
        { label: "Subventions d'exploitation", value: fmtMoney(subvAgri), subValue: 'Compte 71' },
      ];
    }
    if (id === 'sante') {
      const honoraires = sumC('706'); const personnel = sumD('66'); const ratioPers = ca > 0 ? (personnel/ca)*100 : 0;
      return [
        { label: 'Honoraires & actes', value: fmtMoney(honoraires), subValue: 'Compte 706' },
        { label: 'Personnel soignant', value: fmtMoney(personnel), subValue: `${ratioPers.toFixed(1)} % du CA` },
        { label: 'CA total', value: fmtMoney(ca) },
        { label: 'Marge nette', value: fmtMoney(rn), subValue: ca > 0 ? `${((rn/ca)*100).toFixed(1)} %` : '—' },
      ];
    }
    if (id === 'transp') {
      const carburant = sumD('6051','6052'); const flotte = sumD('245'); const ratioCarb = ca > 0 ? (carburant/ca)*100 : 0;
      return [
        { label: 'CA transport', value: fmtMoney(ca) },
        { label: 'Carburant', value: fmtMoney(carburant), subValue: `${ratioCarb.toFixed(1)} % du CA` },
        { label: 'Valeur flotte', value: fmtMoney(flotte), subValue: 'Compte 245 matériel transport' },
        { label: 'Marge', value: fmtMoney(rn) },
      ];
    }
    if (id === 'serv') {
      const honoraires = sumC('706','708'); const personnel = sumD('66');
      const tauxFact = personnel > 0 ? (honoraires/personnel) : 0;
      return [
        { label: 'Honoraires', value: fmtMoney(honoraires), subValue: 'Comptes 706, 708' },
        { label: 'Personnel facturable', value: fmtMoney(personnel) },
        { label: 'Taux facturable', value: `${tauxFact.toFixed(2)}×`, subValue: 'Honoraires / Personnel' },
        { label: 'Marge projets', value: fmtMoney(rn), subValue: ca > 0 ? `${((rn/ca)*100).toFixed(1)} %` : '—' },
      ];
    }
    if (id === 'ana_centres' || id === 'ana_projets' || id === 'ana_axes') return [
      { label: 'CA total', value: fmtMoney(ca) },
      { label: 'Résultat', value: fmtMoney(rn) },
      { label: 'Données analytiques', value: data.hasAnalytical ? '✓ Disponibles' : '⚠ Non saisies' },
      { label: 'Voir page Analytique', value: '→ /analytical' },
    ];
    if (id === 'tafire') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const caf = (data.sig?.resultat ?? 0) + sumD('68') - sumC('78');
      return [
        { label: 'CAF', value: fmtMoney(caf), subValue: 'RN + dotations - reprises' },
        { label: 'Résultat net', value: fmtMoney(rn) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Référence', value: 'Art. 29-37 SYSCOHADA' },
      ];
    }
    if (id === 'bilan_monthly') {
      const totA = data.bilanActif?.find((l: any) => l.code === '_BZ')?.value ?? 0;
      const totP = data.bilanPassif?.find((l: any) => l.code === '_DZ')?.value ?? 0;
      const cp = data.bilanPassif?.find((l: any) => l.code === '_CP')?.value ?? 0;
      return [
        { label: 'Total Actif', value: fmtMoney(totA) },
        { label: 'Total Passif', value: fmtMoney(totP) },
        { label: 'Capitaux propres', value: fmtMoney(cp), subValue: totA > 0 ? `${((cp/totA)*100).toFixed(1)}% du total` : '—' },
        { label: 'Équilibre', value: Math.abs(totA - totP) < 1 ? '✓ OK' : '⚠ écart' },
      ];
    }
    if (id === 'caf') {
      const caf = (data.sig?.resultat ?? 0) + sumD('68') - sumC('78');
      const tauxCAF = ca > 0 ? (caf/ca)*100 : 0;
      return [
        { label: 'CAF exercice', value: fmtMoney(caf), subValue: 'RN + dotations - reprises' },
        { label: 'CA', value: fmtMoney(ca) },
        { label: 'Taux CAF / CA', value: `${tauxCAF.toFixed(1)} %` },
        { label: 'Résultat net', value: fmtMoney(rn) },
      ];
    }
    if (id === 'multi_year') return [
      { label: 'CA N', value: fmtMoney(ca) },
      { label: 'RN N', value: fmtMoney(rn) },
      { label: 'EBE N', value: fmtMoney(data.sig?.ebe ?? 0) },
      { label: 'Comparaison', value: 'N / N-1 / N-2 / N-3' },
    ];
    if (id === 'bank_recon') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const banques = sumD('52');
      return [
        { label: 'Solde GL banques (52)', value: fmtMoney(banques) },
        { label: 'Trésorerie active', value: fmtMoney(treso) },
        { label: 'Suspens à régulariser', value: fmtMoney(treso - banques) },
        { label: 'Statut', value: Math.abs(treso - banques) < 1 ? '✓ Rapproché' : '⚠ Écart' },
      ];
    }
    if (id === 'closing_just') {
      const provisions = sumC('19'); const cca = sumD('476'); const pca = sumC('477'); const fae = sumD('418');
      return [
        { label: 'Provisions risques (19)', value: fmtMoney(provisions) },
        { label: 'CCA (476)', value: fmtMoney(cca), subValue: "Charges constatées d'avance" },
        { label: 'PCA (477)', value: fmtMoney(pca), subValue: "Produits constatés d'avance" },
        { label: 'FAE (418)', value: fmtMoney(fae), subValue: 'Factures à établir' },
      ];
    }
    if (id === 'audit_visu') {
      const total = (data.glCount ?? data.balance?.length ?? 0);
      return [
        { label: 'Écritures GL', value: String(total) },
        { label: 'Hash chain', value: 'SHA-256' },
        { label: 'Méthode', value: 'Web Crypto API' },
        { label: 'Voir intégrité', value: '→ /dashboard/audit-trail' },
      ];
    }
    if (id === 'anomalies') {
      const ratios = data.ratios ?? [];
      const alertes = ratios.filter((r: any) => r.status === 'alert').length;
      const warn = ratios.filter((r: any) => r.status === 'warn').length;
      return [
        { label: 'Alertes critiques', value: String(alertes) },
        { label: 'Vigilance', value: String(warn) },
        { label: 'Conformes', value: String(ratios.length - alertes - warn) },
        { label: 'Voir heatmap', value: '→ /dashboard/anomalies' },
      ];
    }
    if (id === 'lettrage') {
      const clients = sumD('41'); const fournisseurs = sumC('40');
      return [
        { label: 'Encours clients (41)', value: fmtMoney(clients) },
        { label: 'Encours fournisseurs (40)', value: fmtMoney(fournisseurs) },
        { label: 'Voir taux', value: '→ /dashboard/lettrage' },
        { label: 'Vieillissement', value: '0-30 / 30-60 / 60-90 / 90+ j' },
      ];
    }
    if (id === 'zscore') {
      const a = data.bilanActif ?? []; const p = data.bilanPassif ?? [];
      const get = (lines: any[], c: string) => lines.find((l: any) => l.code === c)?.value ?? 0;
      const totA = get(a, '_BZ'); const cp = get(p, '_CP');
      const ratioCP = totA > 0 ? (cp/totA)*100 : 0;
      return [
        { label: 'Autonomie financière', value: `${ratioCP.toFixed(1)} %`, subValue: 'CP / Total Actif' },
        { label: 'Marge nette', value: ca > 0 ? `${((rn/ca)*100).toFixed(1)} %` : '—' },
        { label: 'Score Cockpit', value: '0-100', subValue: 'Voir détail' },
        { label: 'Famille', value: 'Rentabilité, Liquidité, Structure, Activité' },
      ];
    }
    if (id === 'forecast') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      return [
        { label: 'Cash actuel', value: fmtMoney(treso) },
        { label: 'Horizon 30 j', value: 'Projection' },
        { label: 'Horizon 60 j', value: 'Projection' },
        { label: 'Horizon 90 j', value: 'Projection' },
      ];
    }
    if (id === 'wcd') {
      const periodDays = (data as any).periodDays ?? 360;
      const stocks = data.bilanActif?.find((l: any) => l.code === 'BB')?.value ?? 0;
      const creances = data.bilanActif?.find((l: any) => l.code === 'BH')?.value ?? 0;
      const dettes = sumC('40');
      const achats = balance.filter((r: any) => /^(60|61|62|63)/.test(r.account) && !r.account?.startsWith('603')).reduce((s: number, r: any) => s + (r.soldeD - r.soldeC), 0);
      const dso = ca > 0 ? Math.round((creances / (ca * (1 + vatRate))) * periodDays) : 0;
      const dio = ca > 0 ? Math.round((stocks / ca) * periodDays) : 0;
      const dpo = achats > 0 ? Math.round((dettes / (achats * (1 + vatRate))) * periodDays) : 0;
      return [
        { label: 'DSO', value: `${dso} j`, subValue: 'Délai clients' },
        { label: 'DIO', value: `${dio} j`, subValue: 'Délai stocks' },
        { label: 'DPO', value: `${dpo} j`, subValue: 'Délai fournisseurs' },
        { label: 'CCC', value: `${dso + dio - dpo} j`, subValue: 'Cash Conversion Cycle' },
      ];
    }
    if (id === 'tft_monthly') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      return [
        { label: 'Trésorerie clôture', value: fmtMoney(treso) },
        { label: 'Période', value: '12 mois' },
        { label: 'Sections', value: 'Exploit / Invest / Financ' },
        { label: 'Référence', value: 'SYSCOHADA art. 38' },
      ];
    }
    if (id === 'cap_var') {
      const cp = data.bilanPassif?.find((l: any) => l.code === '_CP')?.value ?? 0;
      return [
        { label: 'Capitaux propres', value: fmtMoney(cp) },
        { label: "Résultat de l'exercice", value: fmtMoney(rn) },
        { label: 'Mouvements', value: 'Apports + Distributions + Affectation' },
        { label: 'État obligatoire', value: 'SYSCOHADA' },
      ];
    }
    if (id === 'closing_pack') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const alertes = (data.ratios || []).filter((r: any) => r.status === 'alert').length;
      return [
        { label: 'CA', value: fmtMoney(ca) },
        { label: 'Résultat net', value: fmtMoney(rn) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Alertes', value: String(alertes) },
      ];
    }
    if (id === 'seasonality') {
      const monthly = (data as any).monthlyCA ?? [];
      const avg = monthly.length > 0 ? monthly.reduce((s: number, m: any) => s + (m.realise ?? 0), 0) / monthly.length : 0;
      const max = monthly.length > 0 ? Math.max(...monthly.map((m: any) => m.realise ?? 0)) : 0;
      const min = monthly.length > 0 ? Math.min(...monthly.map((m: any) => m.realise ?? 0)) : 0;
      return [
        { label: 'CA moyen mensuel', value: fmtMoney(avg) },
        { label: 'Pic max', value: fmtMoney(max), subValue: avg > 0 ? `Index ${((max/avg)*100).toFixed(0)}` : '—' },
        { label: 'Creux min', value: fmtMoney(min), subValue: avg > 0 ? `Index ${((min/avg)*100).toFixed(0)}` : '—' },
        { label: 'Amplitude', value: avg > 0 ? `${(((max-min)/avg)*100).toFixed(0)} %` : '—' },
      ];
    }
    if (id === 'whatif') return [
      { label: 'CA actuel', value: fmtMoney(ca) },
      { label: 'Marge actuelle', value: ca > 0 ? `${((rn/ca)*100).toFixed(1)} %` : '—' },
      { label: 'Charges actuelles', value: fmtMoney(ca - rn) },
      { label: 'Simulation', value: '→ /dashboard/whatif' },
    ];
    if (id === 'provisions') {
      const dotations = sumD('68'); const reprises = sumC('78');
      return [
        { label: 'Dotations (68)', value: fmtMoney(dotations) },
        { label: 'Reprises (78)', value: fmtMoney(reprises) },
        { label: 'Solde net', value: fmtMoney(dotations - reprises) },
        { label: 'Impact résultat', value: fmtMoney(-(dotations - reprises)), subValue: 'Charge nette' },
      ];
    }
    if (id === 'intercos') {
      const avances = sumC('167'); const titres = sumD('267'); const cca = sumD('4561'); const intra = sumD('462') - sumC('463');
      return [
        { label: 'Avances reçues (167)', value: fmtMoney(avances) },
        { label: 'Titres participation (267)', value: fmtMoney(titres) },
        { label: 'Apports CCA (4561)', value: fmtMoney(cca) },
        { label: 'Solde net intra-groupe', value: fmtMoney(intra) },
      ];
    }
    if (id === 'weekly') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const alertes = (data.ratios || []).filter((r: any) => r.status !== 'good').length;
      return [
        { label: 'CA YTD', value: fmtMoney(ca) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Résultat', value: fmtMoney(rn) },
        { label: 'Alertes', value: `${alertes} / ${(data.ratios || []).length}` },
      ];
    }
    if (id === 'mda') return [
      { label: 'CA', value: fmtMoney(ca) },
      { label: 'Résultat net', value: fmtMoney(rn) },
      { label: 'Marge nette', value: ca > 0 ? `${((rn/ca)*100).toFixed(1)} %` : '—' },
      { label: 'Narratif', value: 'Auto-généré' },
    ];
    if (id === 'board_pack') {
      const treso = data.bilanActif?.find((l: any) => l.code === '_BT')?.value ?? 0;
      const cp = data.bilanPassif?.find((l: any) => l.code === '_CP')?.value ?? 0;
      return [
        { label: 'CA', value: fmtMoney(ca) },
        { label: 'Résultat net', value: fmtMoney(rn) },
        { label: 'Trésorerie', value: fmtMoney(treso) },
        { label: 'Capitaux propres', value: fmtMoney(cp) },
      ];
    }
    if (id === 'sector_bench') {
      const ratios = data.ratios ?? [];
      const conformes = ratios.filter((r: any) => r.status === 'good').length;
      return [
        { label: 'Score sectoriel', value: `${conformes} / ${ratios.length}` },
        { label: 'Secteur', value: data.org?.sector ?? 'Commerce' },
        { label: 'Référentiel', value: 'UEMOA OHADA' },
        { label: 'Voir détail', value: '→ /dashboard/sector-benchmark' },
      ];
    }
    return [{ label: 'CA', value: fmtMoney(ca) }, { label: 'RN', value: fmtMoney(rn) }];
  })();

  // ─── Rendu enrichi avec mini-graphiques ───────────────────────

  if (id === 'struct_actif') {
    const a = data.bilanActif ?? [];
    const get = (c: string) => a.find((l: any) => l.code === c)?.value ?? 0;
    const totA = get('_BZ') || a.reduce((s: number, l: any) => l.code?.startsWith('_') ? s : s + (l.value || 0), 0);
    const items = [
      { label: 'Actif immobilisé', value: get('_AZ'), color: palette.primary },
      { label: 'Stocks', value: get('BB'), color: '#d97706' },
      { label: 'Créances clients', value: get('BH'), color: '#0891b2' },
      { label: 'Autres créances', value: get('BI'), color: '#7c3aed' },
      { label: 'Trésorerie active', value: get('_BT'), color: '#16a34a' },
      { label: '⚠ Écart de balance', value: get('_EC'), color: '#dc2626' },
    ].filter((it) => Math.abs(it.value) > 0.01);
    const totalCalc = items.reduce((s, it) => s + it.value, 0) || totA || 1;
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1 flex flex-col items-center justify-center">
            {(() => {
              let cumPct = 0; const r = 50, cx = 70, cy = 70;
              return (
                <svg width="140" height="140" viewBox="0 0 140 140">
                  {items.map((it, i) => {
                    const pct = it.value / totalCalc;
                    const startAngle = cumPct * 2 * Math.PI - Math.PI / 2;
                    cumPct += pct;
                    const endAngle = cumPct * 2 * Math.PI - Math.PI / 2;
                    const x1 = cx + r * Math.cos(startAngle); const y1 = cy + r * Math.sin(startAngle);
                    const x2 = cx + r * Math.cos(endAngle); const y2 = cy + r * Math.sin(endAngle);
                    const largeArc = pct > 0.5 ? 1 : 0;
                    return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={it.color} stroke="#fff" strokeWidth="1" />;
                  })}
                  <circle cx={cx} cy={cy} r={26} fill="#fff" />
                  <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill={palette.primary} fontWeight="bold">TOTAL</text>
                  <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9" fill={palette.primary}>{Math.round(totalCalc / 1_000_000)}M</text>
                </svg>
              );
            })()}
          </div>
          <div className="col-span-2">
            <table className="w-full text-[10px]">
              <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
                <th className="text-left py-1 px-1.5 first:rounded-l">Poste</th>
                <th className="text-right py-1 px-1.5">Montant</th>
                <th className="text-right py-1 px-1.5 last:rounded-r">% Actif</th>
              </tr></thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
                {items.map((it, i) => {
                  const isEcart = it.label.startsWith('⚠');
                  return (
                    <tr key={i} className={isEcart ? 'cursor-pointer hover:bg-error/5' : ''} onClick={isEcart ? () => setShowEcartModal(true) : undefined} title={isEcart ? 'Cliquez pour voir le détail des comptes responsables' : undefined}>
                      <td className="py-1 px-1.5 flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />{it.label}{isEcart && <span className="text-error text-[9px] ml-1">→ détail</span>}</td>
                      <td className="py-1 px-1.5 text-right num">{fmtMoney(it.value)}</td>
                      <td className="py-1 px-1.5 text-right num font-semibold">{((it.value / totalCalc) * 100).toFixed(1)} %</td>
                    </tr>
                  );
                })}
                <tr className="font-bold border-t-2" style={{ borderColor: palette.primary }}>
                  <td className="py-1 px-1.5">TOTAL ACTIF</td>
                  <td className="py-1 px-1.5 text-right num">{fmtMoney(totalCalc)}</td>
                  <td className="py-1 px-1.5 text-right num">100,0 %</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <UnclassifiedAccountsModal open={showEcartModal} onClose={() => setShowEcartModal(false)} accounts={data.unclassifiedAccounts ?? []} ecartTotal={get('_EC')} />
      </div>
    );
  }

  if (id === 'struct_passif') {
    const p = data.bilanPassif ?? [];
    const get = (c: string) => p.find((l: any) => l.code === c)?.value ?? 0;
    const items = [
      { label: 'Capitaux propres', value: get('_CP'), color: palette.primary },
      { label: 'Dettes financières', value: get('DA'), color: '#dc2626' },
      { label: 'Provisions risques', value: get('DP'), color: '#a16207' },
      { label: 'Dettes circulantes', value: get('_DP'), color: '#d97706' },
      { label: 'Trésorerie passive', value: get('DV'), color: '#7c3aed' },
      { label: '⚠ Écart de balance', value: get('_ECP'), color: '#dc2626' },
    ].filter((it) => Math.abs(it.value) > 0.01).map((it) => ({ ...it, value: Math.abs(it.value) }));
    const totalCalc = items.reduce((s, it) => s + it.value, 0) || 1;
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1 flex flex-col items-center justify-center">
            {(() => {
              let cumPct = 0; const r = 50, cx = 70, cy = 70;
              return (
                <svg width="140" height="140" viewBox="0 0 140 140">
                  {items.map((it, i) => {
                    const pct = it.value / totalCalc;
                    const startAngle = cumPct * 2 * Math.PI - Math.PI / 2;
                    cumPct += pct;
                    const endAngle = cumPct * 2 * Math.PI - Math.PI / 2;
                    const x1 = cx + r * Math.cos(startAngle); const y1 = cy + r * Math.sin(startAngle);
                    const x2 = cx + r * Math.cos(endAngle); const y2 = cy + r * Math.sin(endAngle);
                    const largeArc = pct > 0.5 ? 1 : 0;
                    return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={it.color} stroke="#fff" strokeWidth="1" />;
                  })}
                  <circle cx={cx} cy={cy} r={26} fill="#fff" />
                  <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill={palette.primary} fontWeight="bold">TOTAL</text>
                  <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9" fill={palette.primary}>{Math.round(totalCalc / 1_000_000)}M</text>
                </svg>
              );
            })()}
          </div>
          <div className="col-span-2">
            <table className="w-full text-[10px]">
              <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
                <th className="text-left py-1 px-1.5 first:rounded-l">Poste</th>
                <th className="text-right py-1 px-1.5">Montant</th>
                <th className="text-right py-1 px-1.5 last:rounded-r">% Passif</th>
              </tr></thead>
              <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
                {items.map((it, i) => {
                  const isEcart = it.label.startsWith('⚠');
                  return (
                    <tr key={i} className={isEcart ? 'cursor-pointer hover:bg-error/5' : ''} onClick={isEcart ? () => setShowEcartModal(true) : undefined} title={isEcart ? 'Cliquez pour voir le détail des comptes responsables' : undefined}>
                      <td className="py-1 px-1.5 flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />{it.label}{isEcart && <span className="text-error text-[9px] ml-1">→ détail</span>}</td>
                      <td className="py-1 px-1.5 text-right num">{fmtMoney(it.value)}</td>
                      <td className="py-1 px-1.5 text-right num font-semibold">{((it.value / totalCalc) * 100).toFixed(1)} %</td>
                    </tr>
                  );
                })}
                <tr className="font-bold border-t-2" style={{ borderColor: palette.primary }}>
                  <td className="py-1 px-1.5">TOTAL PASSIF</td>
                  <td className="py-1 px-1.5 text-right num">{fmtMoney(totalCalc)}</td>
                  <td className="py-1 px-1.5 text-right num">100,0 %</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <UnclassifiedAccountsModal open={showEcartModal} onClose={() => setShowEcartModal(false)} accounts={data.unclassifiedAccounts ?? []} ecartTotal={Math.abs(get('_ECP'))} />
      </div>
    );
  }

  if (id === 'pyramide_perf') {
    const sig = data.sig; const a = data.bilanActif ?? [], pas = data.bilanPassif ?? [];
    const aN1 = data.bilanN1Actif as any[] | null, paN1 = data.bilanN1Passif as any[] | null;
    const ca = sig?.ca ?? 0; const rn = sig?.resultat ?? 0;
    const totA = a.find((l: any) => l.code === '_BZ')?.value ?? 0;
    const cp = pas.find((l: any) => l.code === '_CP')?.value ?? 0;
    const hasN1 = aN1 && paN1;
    const cpOuverture = hasN1 ? (paN1!.find((l: any) => l.code === '_CP')?.value ?? 0) : (cp - rn);
    const totAOuverture = hasN1 ? (aN1!.find((l: any) => l.code === '_BZ')?.value ?? 0) : (totA - rn);
    const cpMoyen = (cp + cpOuverture) / 2; const totAMoyen = (totA + totAOuverture) / 2;
    const marge = ca ? (rn / ca) * 100 : 0;
    const rotation = totAMoyen > 0 ? ca / totAMoyen : 0;
    const cpInvalid = cpMoyen <= 0;
    const levier = cpInvalid ? 0 : totAMoyen / cpMoyen;
    const roa = totAMoyen > 0 ? (rn / totAMoyen) * 100 : 0;
    const roe = cpInvalid ? 0 : (rn / cpMoyen) * 100;
    const Box = ({ label, value, sub, color, big }: any) => (
      <div className="rounded p-2 text-center" style={{ background: color + '15', borderLeft: `3px solid ${color}` }}>
        <p className="text-[9px] uppercase text-primary-500 font-semibold">{label}</p>
        <p className={clsx('num font-bold', big ? 'text-base' : 'text-sm')} style={{ color }}>{value}</p>
        {sub && <p className="text-[8px] text-primary-400">{sub}</p>}
      </div>
    );
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="mb-2"><Box label="ROE — Rentabilité des capitaux propres" value={cpInvalid ? 'n.a.' : `${roe.toFixed(2)} %`} sub={cpInvalid ? '⚠ Capitaux propres moyens ≤ 0' : `= Résultat net / CP moyens · ouverture ${hasN1 ? 'N-1 réelle' : 'proxy (clôture − RN)'}`} color={palette.primary} big /></div>
        <div className="text-center text-xs text-primary-400 my-1">= Marge × Rotation × Levier</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Box label="ROA — Rentabilité de l'actif" value={`${roa.toFixed(2)} %`} sub="= Marge × Rotation" color="#0891b2" />
          <Box label="Levier financier" value={cpInvalid ? 'n.a.' : `${levier.toFixed(2)} ×`} sub={cpInvalid ? 'CP ouverture ≤ 0' : '= Total Actif / CP'} color="#d97706" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Box label="Marge nette" value={`${marge.toFixed(2)} %`} sub="= RN / CA" color="#16a34a" />
          <Box label="Rotation de l'actif" value={`${rotation.toFixed(2)} ×`} sub="= CA / Total Actif" color="#7c3aed" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Box label="Résultat net" value={fmtMoney(rn)} color="#16a34a" />
          <Box label="CA" value={fmtMoney(ca)} color="#0891b2" />
          <Box label="Total Actif" value={fmtMoney(totA)} color="#d97706" />
        </div>
        <p className="text-[9px] text-primary-400 italic mt-2 text-center">Décomposition Du Pont — analyse multiplicative de la performance financière</p>
      </div>
    );
  }

  if (id === 'ratios_table') {
    const ratios = data.ratios ?? [];
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <table className="w-full text-[10px]">
          <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}>
            <th className="text-left py-1 px-1.5 first:rounded-l">Ratio</th><th className="text-left py-1 px-1.5">Catégorie</th>
            <th className="text-right py-1 px-1.5">Valeur</th><th className="text-right py-1 px-1.5">Cible</th>
            <th className="text-center py-1 px-1.5 last:rounded-r">Statut</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {ratios.slice(0, 20).map((r: any, i: number) => {
              const color = r.status === 'good' ? '#16a34a' : r.status === 'warn' ? '#d97706' : '#dc2626';
              const status = r.status === 'good' ? '✓ OK' : r.status === 'warn' ? '⚠ À surveiller' : '✗ Hors seuil';
              return (
                <tr key={i}>
                  <td className="py-1 px-1.5 truncate max-w-[180px]">{r.label}</td>
                  <td className="py-1 px-1.5 text-primary-500 text-[9px]">{r.category ?? '—'}</td>
                  <td className="py-1 px-1.5 text-right num font-semibold">{r.unit === '%' ? `${r.value.toFixed(1)} %` : `${r.value.toFixed(2)}`}</td>
                  <td className="py-1 px-1.5 text-right num text-primary-500">{r.target ?? '—'}</td>
                  <td className="py-1 px-1.5 text-center font-bold" style={{ color }}>{status}</td>
                </tr>
              );
            })}
            {ratios.length === 0 && <tr><td colSpan={5} className="py-2 text-center text-primary-500 italic">Aucun ratio calculé</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  if (id === 'waterfall') {
    const sig = data.sig;
    const steps = [
      { label: 'CA', value: sig?.ca ?? 0 }, { label: 'Marge brute', value: sig?.margeBrute ?? 0 },
      { label: 'Valeur ajoutée', value: sig?.valeurAjoutee ?? 0 }, { label: 'EBE', value: sig?.ebe ?? 0 },
      { label: 'RE', value: sig?.re ?? 0 }, { label: 'Résultat net', value: sig?.resultat ?? 0 },
    ];
    const max = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="space-y-1.5">
          {steps.map((s, i) => {
            const pct = (Math.abs(s.value) / max) * 100; const neg = s.value < 0;
            return (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <div className="w-24 text-right text-primary-600 dark:text-primary-300 font-medium shrink-0">{s.label}</div>
                <div className="flex-1 bg-primary-100 dark:bg-primary-900 h-5 rounded overflow-hidden relative">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, background: neg ? '#dc2626' : palette.primary }} />
                </div>
                <div className="w-28 text-right num font-semibold tabular-nums text-primary-900 dark:text-primary-100 shrink-0">{fmtMoney(s.value)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (id === 'cashflow' || id === 'cashforecast') {
    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const cf = (data as any).cashflowMonthly as { encaissements: number[]; decaissements: number[] } | null;
    const series = months.map((_, mi) => ({ mois: months[mi], in: Math.round(cf?.encaissements?.[mi] ?? 0), out: Math.round(cf?.decaissements?.[mi] ?? 0) }));
    const maxV = Math.max(...series.flatMap((s) => [s.in, s.out]), 1);
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {kpis.map((k: any, i: number) => (
            <div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
              <p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p>
              <p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Cash In (vert) vs Cash Out (rouge) — Mensuel · valeurs en milliers XOF</p>
        <div className="flex items-end gap-1 h-32">
          {series.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex flex-col justify-end h-28 relative">
                <div className="bg-success/90 rounded-t flex items-start justify-center pt-0.5 text-[8px] text-white font-semibold" style={{ height: `${(s.in / maxV) * 50}%` }}>{Math.round(s.in / 1000)}k</div>
                <div className="bg-error/90 rounded-b flex items-end justify-center pb-0.5 text-[8px] text-white font-semibold" style={{ height: `${(s.out / maxV) * 50}%` }}>{Math.round(s.out / 1000)}k</div>
              </div>
              <span className="text-[8px] text-primary-500">{s.mois}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-around text-[9px] text-primary-500 mt-1">
          <span>Total In : <strong className="num text-success">{fmtMoney(series.reduce((s, m) => s + m.in, 0))}</strong></span>
          <span>Total Out : <strong className="num text-error">{fmtMoney(series.reduce((s, m) => s + m.out, 0))}</strong></span>
          <span>Net : <strong className="num">{fmtMoney(series.reduce((s, m) => s + m.in - m.out, 0))}</strong></span>
        </div>
      </div>
    );
  }

  if (id === 'bfr') {
    const a = data.bilanActif ?? [], p = data.bilanPassif ?? [];
    const get = (l: any[], c: string) => l.find((x: any) => x.code === c)?.value ?? 0;
    const fr = get(p, '_DF') - get(a, '_AZ'); const bfr = get(a, '_BK') - get(p, '_DP'); const tn = get(a, '_BT') - get(p, 'DV');
    const max = Math.max(Math.abs(fr), Math.abs(bfr), Math.abs(tn), 1);
    const items = [{ label: 'FR', value: fr, color: palette.primary }, { label: 'BFR', value: bfr, color: '#d97706' }, { label: 'TN', value: tn, color: tn >= 0 ? '#16a34a' : '#dc2626' }];
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-3" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-3 gap-3 mb-2">
          {items.map((it, i) => {
            const pct = (Math.abs(it.value) / max) * 100;
            return (
              <div key={i} className="text-center">
                <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">{it.label}</p>
                <div className="bg-primary-100 dark:bg-primary-900 h-24 rounded relative overflow-hidden flex items-end">
                  <div className="w-full transition-all flex items-start justify-center pt-1 text-[10px] font-bold text-white" style={{ height: `${pct}%`, background: it.color }}>{pct > 25 ? fmtMoney(it.value) : ''}</div>
                </div>
                <p className="num text-xs font-bold mt-1" style={{ color: it.color }}>{fmtMoney(it.value)}</p>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-primary-400 italic text-center">Équation : FR − BFR = TN</p>
      </div>
    );
  }

  if (id === 'exec') {
    const ratios = data.ratios ?? []; const top6 = ratios.slice(0, 6);
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {kpis.map((k: any, i: number) => (<div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p><p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p></div>))}
        </div>
        {top6.length > 0 && (
          <><p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Top 6 ratios</p>
          <div className="grid grid-cols-3 gap-1">
            {top6.map((r: any, i: number) => {
              const color = r.status === 'good' ? '#16a34a' : r.status === 'warn' ? '#d97706' : '#dc2626';
              return (<div key={i} className="text-[9px] flex justify-between gap-1 px-1.5 py-1 rounded" style={{ background: color + '20', color }}><span className="truncate">{r.label}</span><span className="font-bold num">{r.unit === '%' ? `${r.value.toFixed(1)}%` : r.value.toFixed(2)}</span></div>);
            })}
          </div></>
        )}
      </div>
    );
  }

  if (id === 'client') {
    const auxClient = (data.auxClient ?? []) as Array<{ tier: string; label: string; account: string; solde: number }>;
    const sorted = [...auxClient].sort((a, b) => b.solde - a.solde);
    const total = auxClient.reduce((s, r) => s + r.solde, 0);
    const aged = data.agedClient as { buckets: string[]; rows: Array<{ buckets: number[] }> } | null;
    const colors = ['#16a34a', palette.primary, '#d97706', '#ea580c', '#dc2626'];
    const aggBuckets = [0, 0, 0, 0, 0];
    if (aged?.rows) { for (const r of aged.rows) { for (let i = 0; i < 5; i++) aggBuckets[i] += r.buckets[i] || 0; } }
    const totalAged = aggBuckets.reduce((s, v) => s + v, 0) || 1;
    const buckets = (aged?.buckets ?? ['Non échu','0-30j','31-60j','61-90j','> 90j']).map((label, i) => ({ label, montant: aggBuckets[i], pct: aggBuckets[i] / totalAged, color: colors[i] }));
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">{kpis.map((k: any, i: number) => (<div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p><p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p></div>))}</div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Balance âgée — Répartition (montant + %)</p>
        <div className="flex gap-0.5 h-7 rounded overflow-hidden mb-1">{buckets.map((b, i) => (<div key={i} className="flex items-center justify-center text-[9px] text-white font-semibold" style={{ width: `${b.pct * 100}%`, background: b.color }} title={`${b.label}: ${fmtMoney(b.montant)} (${(b.pct * 100).toFixed(0)}%)`}>{b.pct >= 0.15 ? `${(b.pct * 100).toFixed(0)}%` : ''}</div>))}</div>
        <div className="grid grid-cols-5 gap-1 text-[9px] mb-3">{buckets.map((b, i) => (<div key={i} className="text-center"><p className="text-primary-500">{b.label}</p><p className="num font-semibold" style={{ color: b.color }}>{fmtMoney(b.montant)}</p></div>))}</div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Top 10 débiteurs</p>
        <table className="w-full text-[10px]">
          <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}><th className="text-left py-1 px-1.5 first:rounded-l">Compte</th><th className="text-left py-1 px-1.5">Libellé</th><th className="text-right py-1 px-1.5">Solde</th><th className="text-right py-1 px-1.5 last:rounded-r">% portefeuille</th></tr></thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {sorted.slice(0, 10).map((r, i) => (<tr key={i}><td className="py-1 px-1.5 num font-mono">{r.tier}</td><td className="py-1 px-1.5 truncate max-w-[200px]">{r.label}</td><td className="py-1 px-1.5 text-right num">{fmtMoney(r.solde)}</td><td className="py-1 px-1.5 text-right num">{total ? ((r.solde / total) * 100).toFixed(1) : 0} %</td></tr>))}
            {sorted.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-primary-500 italic">Aucune créance client significative</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  if (id === 'fr') {
    const auxFr = (data.auxFournisseur ?? []) as Array<{ tier: string; label: string; account: string; solde: number }>;
    const sorted = [...auxFr].sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
    const total = auxFr.reduce((s, r) => s + Math.abs(r.solde), 0);
    const aged = data.agedFournisseur as { buckets: string[]; rows: Array<{ buckets: number[] }> } | null;
    const colors = ['#16a34a', palette.primary, '#d97706', '#ea580c', '#dc2626'];
    const aggBuckets = [0, 0, 0, 0, 0];
    if (aged?.rows) { for (const r of aged.rows) { for (let i = 0; i < 5; i++) aggBuckets[i] += Math.abs(r.buckets[i] || 0); } }
    const totalAged = aggBuckets.reduce((s, v) => s + v, 0) || 1;
    const buckets = (aged?.buckets ?? ['Non échu','0-30j','31-60j','61-90j','> 90j']).map((label, i) => ({ label, montant: aggBuckets[i], pct: aggBuckets[i] / totalAged, color: colors[i] }));
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">{kpis.map((k: any, i: number) => (<div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p><p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p></div>))}</div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Échéancier — Répartition à payer (montant + %)</p>
        <div className="flex gap-0.5 h-7 rounded overflow-hidden mb-1">{buckets.map((b, i) => (<div key={i} className="flex items-center justify-center text-[9px] text-white font-semibold" style={{ width: `${b.pct * 100}%`, background: b.color }} title={`${b.label}: ${fmtMoney(b.montant)} (${(b.pct * 100).toFixed(0)}%)`}>{b.pct >= 0.15 ? `${(b.pct * 100).toFixed(0)}%` : ''}</div>))}</div>
        <div className="grid grid-cols-5 gap-1 text-[9px] mb-3">{buckets.map((b, i) => (<div key={i} className="text-center"><p className="text-primary-500">{b.label}</p><p className="num font-semibold" style={{ color: b.color }}>{fmtMoney(b.montant)}</p></div>))}</div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Top 10 fournisseurs (concentration)</p>
        <table className="w-full text-[10px]">
          <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}><th className="text-left py-1 px-1.5 first:rounded-l">Compte</th><th className="text-left py-1 px-1.5">Libellé</th><th className="text-right py-1 px-1.5">Solde dû</th><th className="text-right py-1 px-1.5 last:rounded-r">% dépendance</th></tr></thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {sorted.slice(0, 10).map((r, i) => (<tr key={i}><td className="py-1 px-1.5 num font-mono">{r.tier}</td><td className="py-1 px-1.5 truncate max-w-[200px]">{r.label}</td><td className="py-1 px-1.5 text-right num">{fmtMoney(Math.abs(r.solde))}</td><td className="py-1 px-1.5 text-right num">{total ? ((Math.abs(r.solde) / total) * 100).toFixed(1) : 0} %</td></tr>))}
            {sorted.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-primary-500 italic">Aucune dette fournisseur significative</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  if (id === 'compliance') {
    const balance = data.balance ?? [];
    const bilan = { actif: data.bilanActif ?? [], passif: data.bilanPassif ?? [], totalActif: 0, totalPassif: 0 };
    bilan.totalActif = bilan.actif.find((l: any) => l.code === '_BZ')?.value ?? 0;
    bilan.totalPassif = bilan.passif.find((l: any) => l.code === '_DZ')?.value ?? bilan.totalActif;
    const sig = data.sig; const movements = balance;
    type Check = { id: string; label: string; status: 'ok' | 'warn' | 'fail'; severity: 'critical'|'major'|'minor'; detail: string; reco?: string };
    const checks: Check[] = [];
    const totD = balance.reduce((s: number, r: any) => s + r.debit, 0);
    const totC = balance.reduce((s: number, r: any) => s + r.credit, 0);
    const deltaBal = Math.abs(totD - totC);
    checks.push({ id: 'balance_eq', label: 'Balance équilibrée (D = C)', severity: 'critical', status: deltaBal < 1 ? 'ok' : 'fail', detail: deltaBal < 1 ? 'Équilibrée' : `Écart ${fmtMoney(totD - totC)}`, reco: deltaBal < 1 ? '' : 'Identifier les écritures déséquilibrées dans le GL et corriger à la source.' });
    const deltaBilan = Math.abs(bilan.totalActif - bilan.totalPassif);
    checks.push({ id: 'bilan_eq', label: 'Bilan équilibré (Actif = Passif)', severity: 'critical', status: deltaBilan < 1 ? 'ok' : 'fail', detail: deltaBilan < 1 ? `Total ${fmtMoney(bilan.totalActif)}` : `Écart ${fmtMoney(bilan.totalActif - bilan.totalPassif)}`, reco: deltaBilan < 1 ? '' : "Vérifier l'affectation du résultat et la complétude des classes 1-5." });
    if (sig) {
      const resBilan = bilan.passif.find((l: any) => l.code === 'CF')?.value ?? 0;
      const delta = Math.abs(resBilan - sig.resultat);
      checks.push({ id: 'res', label: 'Résultat Bilan ↔ SIG cohérent', severity: 'major', status: delta < 2 ? 'ok' : 'warn', detail: delta < 2 ? 'Cohérent' : `Écart ${fmtMoney(resBilan - sig.resultat)}`, reco: delta < 2 ? '' : 'Réconcilier le résultat passif (CF) avec le résultat SIG (classes 6/7).' });
    }
    const hasCapital = balance.some((r: any) => r.account?.startsWith('101'));
    checks.push({ id: 'capital', label: 'Capital social (101) présent', severity: 'major', status: hasCapital ? 'ok' : 'warn', detail: hasCapital ? 'Présent' : 'Absent', reco: hasCapital ? '' : 'Créer le compte 101 et y porter le capital social libéré.' });
    const class8Fail = balance.filter((r: any) => r.account?.length === 1).length;
    checks.push({ id: 'racine', label: 'Pas de comptes racine seule', severity: 'minor', status: class8Fail === 0 ? 'ok' : 'warn', detail: class8Fail === 0 ? 'Aucune racine' : `${class8Fail} compte(s) racine`, reco: class8Fail === 0 ? '' : 'Reclasser les écritures sur des sous-comptes détaillés.' });
    const unmapped = balance.filter((r: any) => !r.syscoCode).length;
    checks.push({ id: 'mapping', label: 'Mapping SYSCOHADA complet', severity: 'major', status: unmapped === 0 ? 'ok' : (unmapped < 5 ? 'warn' : 'fail'), detail: unmapped === 0 ? 'Tous mappés' : `${unmapped} non mappé(s)`, reco: unmapped === 0 ? '' : 'Importer/compléter le Plan Comptable avec mapping SYSCOHADA.' });
    const c6Cred = balance.filter((r: any) => r.account?.startsWith('6') && !r.account.startsWith('603') && !r.account.startsWith('619') && !r.account.startsWith('629') && !r.account.startsWith('639') && r.soldeC > 1000).length;
    checks.push({ id: 'c6', label: 'Classe 6 : sens débiteur normal', severity: 'major', status: c6Cred === 0 ? 'ok' : 'warn', detail: c6Cred === 0 ? 'Tous en débit (hors 603, 619, 629, 639)' : `${c6Cred} en crédit anormal`, reco: c6Cred === 0 ? '' : 'Vérifier les comptes de charges en solde créditeur (rétrocessions, RRR, erreurs).' });
    const c7Deb = balance.filter((r: any) => r.account?.startsWith('7') && !r.account.startsWith('709') && !/^70[1-7]9/.test(r.account) && r.soldeD > 1000).length;
    checks.push({ id: 'c7', label: 'Classe 7 : sens créditeur normal', severity: 'major', status: c7Deb === 0 ? 'ok' : 'warn', detail: c7Deb === 0 ? 'Tous en crédit (hors 709, 7Xx9)' : `${c7Deb} en débit anormal`, reco: c7Deb === 0 ? '' : 'Examiner les comptes de produits en débit (avoirs, annulations).' });
    const tva443 = balance.filter((r: any) => r.account?.startsWith('443') && r.soldeD > 100).length;
    const tva445 = balance.filter((r: any) => r.account?.startsWith('445') && r.soldeC > 100).length;
    checks.push({ id: 'tva', label: 'TVA cohérente (443 C / 445 D)', severity: 'minor', status: tva443 + tva445 === 0 ? 'ok' : 'warn', detail: tva443 + tva445 === 0 ? 'Cohérent' : 'Anomalies sur 443/445', reco: tva443 + tva445 === 0 ? '' : 'Réviser les écritures TVA pour respecter le sens normal.' });
    const emptyLabels = movements.filter((r: any) => !r.label || r.label === '—').length;
    checks.push({ id: 'labels', label: 'Libellés des écritures renseignés', severity: 'minor', status: emptyLabels === 0 ? 'ok' : 'warn', detail: emptyLabels === 0 ? 'Tous renseignés' : `${emptyLabels} sans libellé`, reco: emptyLabels === 0 ? '' : 'Ajouter un libellé descriptif à chaque écriture pour traçabilité.' });
    const ok = checks.filter((c) => c.status === 'ok').length;
    const fail = checks.filter((c) => c.status === 'fail').length;
    const warn = checks.filter((c) => c.status === 'warn').length;
    const score = Math.round((ok / checks.length) * 100);
    const scoreColor = score >= 90 ? '#16a34a' : score >= 70 ? '#d97706' : '#dc2626';
    const failedChecks = checks.filter((c) => c.status !== 'ok');
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded" style={{ borderLeft: `3px solid ${scoreColor}` }}><p className="text-[9px] uppercase text-primary-500 font-semibold">Score conformité</p><p className="num text-base font-bold" style={{ color: scoreColor }}>{score} %</p></div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">Contrôles OK</p><p className="num text-base font-bold text-success">{ok} / {checks.length}</p></div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">Avertissements</p><p className="num text-base font-bold" style={{ color: '#d97706' }}>{warn}</p></div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">Critiques</p><p className="num text-base font-bold text-error">{fail}</p></div>
        </div>
        <p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Détail des 10 contrôles SYSCOHADA</p>
        <table className="w-full text-[10px] mb-3">
          <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}><th className="text-center py-1 px-1.5 first:rounded-l w-8">#</th><th className="text-left py-1 px-1.5">Contrôle</th><th className="text-left py-1 px-1.5">Sévérité</th><th className="text-left py-1 px-1.5">Détail</th><th className="text-center py-1 px-1.5 last:rounded-r w-16">Statut</th></tr></thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {checks.map((c, i) => {
              const color = c.status === 'ok' ? '#16a34a' : c.status === 'warn' ? '#d97706' : '#dc2626';
              const label = c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
              const sevColor = c.severity === 'critical' ? '#dc2626' : c.severity === 'major' ? '#d97706' : '#6b7280';
              return (<tr key={c.id}><td className="py-1 px-1.5 text-center text-primary-500">{i + 1}</td><td className="py-1 px-1.5">{c.label}</td><td className="py-1 px-1.5"><span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: sevColor + '20', color: sevColor }}>{c.severity}</span></td><td className="py-1 px-1.5 text-primary-600">{c.detail}</td><td className="py-1 px-1.5 text-center font-bold" style={{ color }}>{label}</td></tr>);
            })}
          </tbody>
        </table>
        {failedChecks.length > 0 && (<><p className="text-[10px] uppercase text-primary-500 font-semibold mb-1">Recommandations prioritaires</p><ul className="space-y-1 text-[10px]">{failedChecks.map((c) => (<li key={c.id} className="flex gap-2 p-1.5 rounded" style={{ background: (c.status === 'fail' ? '#dc2626' : '#d97706') + '10' }}><span className="font-bold" style={{ color: c.status === 'fail' ? '#dc2626' : '#d97706' }}>{c.status === 'fail' ? '⛔' : '⚠'}</span><div><strong>{c.label}</strong> — <span className="text-primary-600">{c.reco}</span></div></li>))}</ul></>)}
        {failedChecks.length === 0 && (<p className="text-[10px] text-success font-semibold p-2 rounded bg-success/10">✓ Conformité parfaite — aucune anomalie détectée sur les 10 contrôles SYSCOHADA.</p>)}
      </div>
    );
  }

  if (id === 'pareto') {
    const ba = (data.budgetActual ?? []).filter((r: any) => Math.abs(r.realise) > 0.01);
    const sorted = ba.slice().sort((a: any, b: any) => Math.abs(b.realise) - Math.abs(a.realise));
    const total = sorted.reduce((s: number, r: any) => s + Math.abs(r.realise), 0);
    const top20 = Math.ceil(sorted.length * 0.2);
    const top20Sum = sorted.slice(0, top20).reduce((s: number, r: any) => s + Math.abs(r.realise), 0);
    const pctTop = total ? (top20Sum / total) * 100 : 0;
    let cumul = 0;
    const top15 = sorted.slice(0, 15).map((r: any) => {
      cumul += Math.abs(r.realise);
      const pctIndiv = total ? (Math.abs(r.realise) / total) * 100 : 0;
      const pctCumul = total ? (cumul / total) * 100 : 0;
      const cls = pctCumul <= 80 ? 'A' : pctCumul <= 95 ? 'B' : 'C';
      return { code: r.code, label: r.label, montant: r.realise, pct: pctIndiv, cumul: pctCumul, cls };
    });
    return (
      <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
        <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">Comptes total</p><p className="num text-xs font-bold" style={{ color: palette.primary }}>{sorted.length}</p></div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">Top 20 % comptes</p><p className="num text-xs font-bold" style={{ color: palette.primary }}>{top20}</p></div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">Pèsent</p><p className="num text-xs font-bold" style={{ color: palette.primary }}>{pctTop.toFixed(1)} %</p></div>
          <div className="bg-primary-50 dark:bg-primary-950 p-2 rounded"><p className="text-[9px] uppercase text-primary-500 font-semibold">Volume top 20%</p><p className="num text-xs font-bold" style={{ color: palette.primary }}>{fmtMoney(top20Sum)}</p></div>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold mb-1">Top 15 comptes — Classement ABC</p>
        <table className="w-full text-[10px]">
          <thead><tr style={{ background: palette.tableHeader, color: palette.tableHeaderText }}><th className="text-left py-1 px-1.5 first:rounded-l">Compte</th><th className="text-left py-1 px-1.5">Libellé</th><th className="text-right py-1 px-1.5">Montant</th><th className="text-right py-1 px-1.5">% indiv</th><th className="text-right py-1 px-1.5">% cumulé</th><th className="text-center py-1 px-1.5 last:rounded-r">Classe</th></tr></thead>
          <tbody className="divide-y divide-primary-100 dark:divide-primary-900">
            {top15.map((r: any, i: number) => (
              <tr key={i}><td className="py-1 px-1.5 num font-mono">{r.code}</td><td className="py-1 px-1.5 truncate max-w-[180px]">{r.label}</td><td className="py-1 px-1.5 text-right num">{fmtMoney(r.montant)}</td><td className="py-1 px-1.5 text-right num">{r.pct.toFixed(1)} %</td><td className="py-1 px-1.5 text-right num font-semibold">{r.cumul.toFixed(1)} %</td><td className="py-1 px-1.5 text-center font-bold" style={{ color: r.cls === 'A' ? '#dc2626' : r.cls === 'B' ? '#d97706' : '#16a34a' }}>{r.cls}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-[9px] text-primary-400 italic mt-1">A = 80 % · B = 80-95 % · C = 95-100 % du volume cumulé</p>
      </div>
    );
  }

  return (
    <div className="border border-primary-200 dark:border-primary-800 rounded p-3" style={{ borderLeft: `4px solid ${palette.primary}` }}>
      <p className="text-xs font-semibold mb-2" style={{ color: palette.primary }}>{dash?.name ?? id}</p>
      <div className="grid grid-cols-4 gap-2">
        {kpis.map((k: any, i: number) => (
          <div key={i} className="bg-primary-50 dark:bg-primary-950 p-2 rounded">
            <p className="text-[9px] uppercase text-primary-500 font-semibold">{k.label}</p>
            <p className="num text-xs font-bold" style={{ color: palette.primary }}>{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
