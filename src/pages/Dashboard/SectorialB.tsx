/* eslint-disable @typescript-eslint/no-explicit-any -- interop dynamique (parsers, payloads Supabase/Edge Functions, helpers Recharts). À typer finement au cas par cas. */
// ── Sectoral dispatch + SecImmobilierCom + SecHotellerie + SecAgriculture
// ── + SecSante + SecTransport + SecServices
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { KPICard } from '../../components/ui/KPICardV2';
import { ChartCard } from '../../components/ui/ChartCard';
import { useStatements } from '../../hooks/useFinancials';
import { useChartTheme } from '../../lib/chartTheme';
import { ChartGradients, barGradId } from '../../components/charts/ChartGradients';
import { fmtFull, fmtK } from '../../lib/format';
import { Diamond, Percent, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { SecIndustrie, SecBTP, SecCommerce, SecMicrofinance } from './SectorialA';

// ── Sectoral dispatch ─────────────────────────────────────────────────
export function Sectoral({ id }: { id: string }) {
  if (id === 'ind') return <SecIndustrie />;
  if (id === 'btp') return <SecBTP />;
  if (id === 'com') return <SecCommerce />;
  if (id === 'mfi') return <SecMicrofinance />;
  if (id === 'imco') return <SecImmobilierCom />;
  if (id === 'hot') return <SecHotellerie />;
  if (id === 'agri') return <SecAgriculture />;
  if (id === 'sante') return <SecSante />;
  if (id === 'transp') return <SecTransport />;
  if (id === 'serv') return <SecServices />;
  return null;
}

// ── SecImmobilierCom ──────────────────────────────────────────────────
export function SecImmobilierCom() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const loyers = balance.filter(r => r.account.startsWith('706') || r.account.startsWith('708')).reduce((s,r) => s+r.credit-r.debit, 0);
  const chargesLoc = balance.filter(r => r.account.startsWith('614') || r.account.startsWith('615')).reduce((s,r) => s+r.debit-r.credit, 0);
  const entretien = balance.filter(r => r.account.startsWith('624') || r.account.startsWith('625')).reduce((s,r) => s+r.debit-r.credit, 0);
  const taxes = balance.filter(r => r.account.startsWith('64')).reduce((s,r) => s+r.debit-r.credit, 0);
  const assurance = balance.filter(r => r.account.startsWith('616')).reduce((s,r) => s+r.debit-r.credit, 0);
  const amort = balance.filter(r => r.account.startsWith('681')).reduce((s,r) => s+r.debit-r.credit, 0);
  const immosBrutes = balance.filter(r => r.account.startsWith('21') || r.account.startsWith('23')).reduce((s,r) => s+r.soldeD, 0);
  const resultatImmo = loyers - chargesLoc - entretien - taxes - assurance - amort;
  const rendement = immosBrutes ? (loyers / immosBrutes) * 100 : 0;
  const tauxOccup = 85 + Math.random() * 10; // simulation

  const lots = [
    { nom: 'Centre commercial Plateau', surface: 12000, loyer: loyers * 0.35, occup: 92 },
    { nom: 'Galerie Marcory', surface: 5500, loyer: loyers * 0.25, occup: 88 },
    { nom: 'Centre Riviera', surface: 8200, loyer: loyers * 0.22, occup: 78 },
    { nom: 'Bureaux Cocody', surface: 3200, loyer: loyers * 0.18, occup: 95 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Loyers encaissés" value={fmtK(loyers)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Charges locatives" value={fmtK(chargesLoc + entretien)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Résultat immobilier" value={fmtK(resultatImmo)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Taux d'occupation" value={`${tauxOccup.toFixed(1)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Rendement brut" value={`${rendement.toFixed(2)} %`} icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Entretien & réparations" value={fmtK(entretien)} unit="XOF" icon="⚙" />
        <KPICard title="Taxes foncières" value={fmtK(taxes)} unit="XOF" icon={<Target className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Assurance" value={fmtK(assurance)} unit="XOF" icon="◎" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Répartition des charges immobilières">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[
                { name: 'Charges locatives', value: chargesLoc },
                { name: 'Entretien', value: entretien },
                { name: 'Taxes', value: taxes },
                { name: 'Assurance', value: assurance },
                { name: 'Amortissements', value: amort },
              ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                label={(p: any) => `${p.name}`}>
                {[0,1,2,3,4].map(i => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Loyers par site">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={lots} layout="vertical">
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="nom" tick={{ fontSize: 10 }} width={140} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="loyer" fill={`url(#${barGradId(0)})`} radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="Performance par site">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Site</th>
            <th className="text-right py-2 px-3">Surface (m²)</th>
            <th className="text-right py-2 px-3">Loyer annuel</th>
            <th className="text-right py-2 px-3">Loyer / m²</th>
            <th className="text-right py-2 px-3">Taux occup.</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {lots.map((l, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 font-medium">{l.nom}</td>
                <td className="py-2.5 px-3 text-right num">{l.surface.toLocaleString('fr-FR')}</td>
                <td className="py-2.5 px-3 text-right num font-semibold">{fmtFull(l.loyer)}</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(l.loyer / l.surface)}</td>
                <td className="py-2.5 px-3 text-right num">{l.occup} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}

// ── SecHotellerie ─────────────────────────────────────────────────────
export function SecHotellerie() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const hebergement = balance.filter(r => r.account.startsWith('706')).reduce((s,r) => s+r.credit-r.debit, 0);
  const restauration = balance.filter(r => r.account.startsWith('707') || r.account.startsWith('701')).reduce((s,r) => s+r.credit-r.debit, 0);
  const achatsFood = balance.filter(r => r.account.startsWith('601') || r.account.startsWith('602')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const ca = hebergement + restauration;
  const chambres = 120; // simulation
  const tauxOccup = 72 + Math.random() * 15;
  const nuitees = Math.round(chambres * 365 * tauxOccup / 100);
  const adr = nuitees ? hebergement / nuitees : 0;
  const revpar = chambres ? hebergement / (chambres * 365) : 0;
  const fbRatio = ca ? (achatsFood / restauration) * 100 : 0;
  const gop = ca - achatsFood - personnel;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="CA Hébergement" value={fmtK(hebergement)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="CA Restauration" value={fmtK(restauration)} unit="XOF" icon="◈" />
        <KPICard title="RevPAR" value={fmtK(revpar)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} subValue="Revenu par chambre dispo" />
        <KPICard title="Taux d'occupation" value={`${tauxOccup.toFixed(1)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="ADR (prix moyen)" value={fmtK(adr)} unit="XOF" icon="●" subValue="Average Daily Rate" />
        <KPICard title="GOP" value={fmtK(gop)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} subValue="Gross Operating Profit" />
        <KPICard title="F&B Cost ratio" value={`${fbRatio.toFixed(1)} %`} icon="↻" subValue="Achats / CA resto" inverse />
        <KPICard title="Nuitées" value={nuitees.toLocaleString('fr-FR')} icon="▣" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Structure du CA">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[{ name: 'Hébergement', value: hebergement }, { name: 'Restauration', value: restauration }].filter(d => d.value > 0)}
                cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={(p: any) => `${p.name}`}>
                <Cell fill={ct.at(0)} /><Cell fill={ct.at(1)} />
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Indicateurs clés hôtellerie">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
              <th className="text-left py-2 px-3">Indicateur</th><th className="text-right py-2 px-3">Valeur</th><th className="text-left py-2 px-3">Formule</th>
            </tr></thead>
            <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
              <tr><td className="py-2 px-3">RevPAR</td><td className="text-right num font-semibold">{fmtFull(revpar)}</td><td className="text-xs text-primary-500 font-mono">CA Héberg. / (Chambres × 365)</td></tr>
              <tr><td className="py-2 px-3">ADR</td><td className="text-right num font-semibold">{fmtFull(adr)}</td><td className="text-xs text-primary-500 font-mono">CA Héberg. / Nuitées vendues</td></tr>
              <tr><td className="py-2 px-3">Taux d'occupation</td><td className="text-right num font-semibold">{tauxOccup.toFixed(1)} %</td><td className="text-xs text-primary-500 font-mono">Nuitées / Capacité</td></tr>
              <tr><td className="py-2 px-3">F&B Cost</td><td className="text-right num font-semibold">{fbRatio.toFixed(1)} %</td><td className="text-xs text-primary-500 font-mono">Achats F&B / CA Resto</td></tr>
              <tr><td className="py-2 px-3">GOP Margin</td><td className="text-right num font-semibold">{ca ? ((gop/ca)*100).toFixed(1) : 0} %</td><td className="text-xs text-primary-500 font-mono">GOP / CA total</td></tr>
              <tr><td className="py-2 px-3">Personnel / CA</td><td className="text-right num font-semibold">{ca ? ((personnel/ca)*100).toFixed(1) : 0} %</td><td className="text-xs text-primary-500 font-mono">Masse salariale / CA</td></tr>
            </tbody>
          </table>
        </ChartCard>
      </div>
    </>
  );
}

// ── SecAgriculture ────────────────────────────────────────────────────
export function SecAgriculture() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const production = balance.filter(r => r.account.startsWith('70')).reduce((s,r) => s+r.credit-r.debit, 0);
  const intrants = balance.filter(r => r.account.startsWith('602') || r.account.startsWith('604')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const subventions = balance.filter(r => r.account.startsWith('71') || r.account.startsWith('74')).reduce((s,r) => s+r.credit-r.debit, 0);
  const stocks = balance.filter(r => r.account.startsWith('31') || r.account.startsWith('32') || r.account.startsWith('33')).reduce((s,r) => s+r.soldeD, 0);
  const marge = production - intrants;
  const tauxMarge = production ? (marge / production) * 100 : 0;

  const cultures = [
    { nom: 'Cacao', ca: production * 0.40, marge: 28 },
    { nom: 'Café', ca: production * 0.25, marge: 22 },
    { nom: 'Hévéa', ca: production * 0.20, marge: 35 },
    { nom: 'Vivriers', ca: production * 0.15, marge: 18 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Production vendue" value={fmtK(production)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Intrants & semences" value={fmtK(intrants)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Marge brute" value={fmtK(marge)} unit="XOF" subValue={`${tauxMarge.toFixed(1)} %`} icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Subventions" value={fmtK(subventions)} unit="XOF" icon="◈" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Stocks récoltes" value={fmtK(stocks)} unit="XOF" icon="▦" />
        <KPICard title="Personnel" value={fmtK(personnel)} unit="XOF" icon="●" />
        <KPICard title="Ratio intrants/CA" value={`${production ? ((intrants/production)*100).toFixed(1) : 0} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} inverse />
        <KPICard title="Productivité" value={(production && personnel ? (production/personnel) : 0).toFixed(2)} icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} subValue="CA / Masse salariale" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="CA par culture">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={cultures} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="ca"
                label={(p: any) => `${p.nom} ${((p.ca/production)*100).toFixed(0)}%`}>
                {cultures.map((_, i) => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Marge par spéculation">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cultures}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis dataKey="nom" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="ca" name="CA" fill={`url(#${barGradId(0)})`} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}

// ── SecSante ──────────────────────────────────────────────────────────
export function SecSante() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const recettes = balance.filter(r => r.account.startsWith('70')).reduce((s,r) => s+r.credit-r.debit, 0);
  const pharma = balance.filter(r => r.account.startsWith('601') || r.account.startsWith('602')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const equipements = balance.filter(r => r.account.startsWith('24')).reduce((s,r) => s+r.soldeD, 0);
  const ratioPersonnel = recettes ? (personnel / recettes) * 100 : 0;

  const services = [
    { nom: 'Consultations', ca: recettes * 0.30 },
    { nom: 'Hospitalisations', ca: recettes * 0.35 },
    { nom: 'Laboratoire', ca: recettes * 0.15 },
    { nom: 'Imagerie', ca: recettes * 0.10 },
    { nom: 'Pharmacie interne', ca: recettes * 0.10 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Recettes totales" value={fmtK(recettes)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Achats pharma & mat." value={fmtK(pharma)} unit="XOF" icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Masse salariale" value={fmtK(personnel)} unit="XOF" subValue={`${ratioPersonnel.toFixed(1)} % du CA`} icon="●" />
        <KPICard title="Équipements (VB)" value={fmtK(equipements)} unit="XOF" icon="◎" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Recettes par service">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={services} layout="vertical">
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color, #e5e5e5)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="nom" tick={{ fontSize: 10 }} width={120} />
              <Tooltip formatter={(v: any) => fmtFull(v)} />
              <Bar dataKey="ca" fill={`url(#${barGradId(0)})`} radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Structure des charges">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={[
                { name: 'Personnel soignant', value: personnel },
                { name: 'Pharmacie & mat.', value: pharma },
              ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={(p: any) => p.name}>
                {[0,1].map(i => <Cell key={i} fill={ct.at(i)} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmtFull(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}

// ── SecTransport ──────────────────────────────────────────────────────
export function SecTransport() {
  const { sig, balance } = useStatements();
  const ct = useChartTheme();
  if (!sig) return null;

  const ca = balance.filter(r => r.account.startsWith('70')).reduce((s,r) => s+r.credit-r.debit, 0);
  const carburant = balance.filter(r => r.account.startsWith('605') || r.account.startsWith('6068')).reduce((s,r) => s+r.debit-r.credit, 0);
  const entretien = balance.filter(r => r.account.startsWith('624') || r.account.startsWith('625')).reduce((s,r) => s+r.debit-r.credit, 0);
  const assurance = balance.filter(r => r.account.startsWith('616')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const amort = balance.filter(r => r.account.startsWith('681')).reduce((s,r) => s+r.debit-r.credit, 0);
  const flotte = balance.filter(r => r.account.startsWith('24')).reduce((s,r) => s+r.soldeD, 0);
  const ratioCarb = ca ? (carburant / ca) * 100 : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Chiffre d'affaires" value={fmtK(ca)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Carburant & énergie" value={fmtK(carburant)} unit="XOF" subValue={`${ratioCarb.toFixed(1)} % du CA`} icon={<TrendingDown className="w-4 h-4" strokeWidth={2} />} inverse />
        <KPICard title="Entretien flotte" value={fmtK(entretien)} unit="XOF" icon="⚙" />
        <KPICard title="Marge d'exploitation" value={fmtK(sig.re)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Flotte (VB)" value={fmtK(flotte)} unit="XOF" icon="▣" />
        <KPICard title="Assurance" value={fmtK(assurance)} unit="XOF" icon="◎" />
        <KPICard title="Amortissements" value={fmtK(amort)} unit="XOF" icon={<Target className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Personnel" value={fmtK(personnel)} unit="XOF" icon="●" />
      </div>
      <ChartCard title="Structure des coûts transport">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={[
              { name: 'Carburant', value: carburant },
              { name: 'Personnel', value: personnel },
              { name: 'Entretien', value: entretien },
              { name: 'Assurance', value: assurance },
              { name: 'Amortissements', value: amort },
            ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={(p: any) => p.name}>
              {[0,1,2,3,4].map(i => <Cell key={i} fill={ct.at(i)} />)}
            </Pie>
            <Tooltip formatter={(v: any) => fmtFull(v)} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}

// ── SecServices ───────────────────────────────────────────────────────
export function SecServices() {
  const { sig, balance } = useStatements();
  if (!sig) return null;

  const soustraitance = balance.filter(r => r.account.startsWith('611') || r.account.startsWith('621')).reduce((s,r) => s+r.debit-r.credit, 0);
  const personnel = balance.filter(r => r.account.startsWith('66')).reduce((s,r) => s+r.debit-r.credit, 0);
  const ca = balance.filter(r => r.account.startsWith('70')).reduce((s,r) => s+r.credit-r.debit, 0);
  const marge = ca - soustraitance - personnel;
  const tauxFacturable = 75 + Math.random() * 10; // simulation
  const ratioPersonnel = ca ? (personnel / ca) * 100 : 0;

  const projets = [
    { nom: 'Audit SYSCOHADA — Client A', budget: ca * 0.25, realise: ca * 0.22, marge: 32, avancement: 85 },
    { nom: 'Mission conseil — Client B', budget: ca * 0.30, realise: ca * 0.28, marge: 28, avancement: 70 },
    { nom: 'Implémentation ERP — Client C', budget: ca * 0.20, realise: ca * 0.18, marge: 22, avancement: 45 },
    { nom: 'Formation — Client D', budget: ca * 0.15, realise: ca * 0.14, marge: 40, avancement: 95 },
    { nom: 'Autres missions', budget: ca * 0.10, realise: ca * 0.08, marge: 25, avancement: 60 },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="CA Honoraires" value={fmtK(ca)} unit="XOF" icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Sous-traitance" value={fmtK(soustraitance)} unit="XOF" icon="◈" />
        <KPICard title="Marge sur missions" value={fmtK(marge)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Taux facturable" value={`${tauxFacturable.toFixed(0)} %`} icon={<Percent className="w-4 h-4" strokeWidth={2} />} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KPICard title="Masse salariale" value={fmtK(personnel)} unit="XOF" subValue={`${ratioPersonnel.toFixed(1)} % du CA`} icon="●" />
        <KPICard title="CA / collaborateur" value={fmtK(personnel ? ca / (personnel / 500000) : 0)} icon={<TrendingUp className="w-4 h-4" strokeWidth={2} />} subValue="estimation" />
        <KPICard title="Résultat exploit." value={fmtK(sig.re)} unit="XOF" icon={<Diamond className="w-4 h-4" strokeWidth={2} />} />
        <KPICard title="Projets actifs" value={String(projets.length)} icon="▣" />
      </div>
      <ChartCard title="Suivi des missions — avancement et marge">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
            <th className="text-left py-2 px-3">Mission</th>
            <th className="text-left py-2 px-3">Avancement</th>
            <th className="text-right py-2 px-3">Marge</th>
            <th className="text-right py-2 px-3">Budget</th>
            <th className="text-right py-2 px-3">Réalisé</th>
          </tr></thead>
          <tbody className="divide-y divide-primary-200 dark:divide-primary-800">
            {projets.map((p, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 font-medium">{p.nom}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-primary-200 dark:bg-primary-800 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-900 dark:bg-primary-100 rounded-full" style={{ width: `${p.avancement}%` }} />
                    </div>
                    <span className="num text-xs">{p.avancement} %</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right num font-semibold">{p.marge} %</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(p.budget)}</td>
                <td className="py-2.5 px-3 text-right num">{fmtFull(p.realise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </>
  );
}
