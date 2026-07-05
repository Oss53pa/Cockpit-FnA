// Échéancier fiscal & social (OHADA / UEMOA)
// Calendrier des obligations déclaratives : TVA, IS (acomptes + solde/DSF),
// ITS, cotisations sociales (CNPS/CNSS), patente. Montants estimés depuis la
// balance + statut (à venir / imminent / échu). Comble le trou « conformité ».
import { useMemo } from 'react';
import { CalendarClock, AlertTriangle, Receipt, Coins } from 'lucide-react';
import { DashboardTopBar } from '../components/ui/DashboardTopBar';
import { DashHeader } from '../components/ui/DashHeader';
import { KPICard } from '../components/ui/KPICardV2';
import { ChartCard } from '../components/ui/ChartCard';
import { useApp } from '../store/app';
import { useCurrentOrg, useStatements } from '../hooks/useFinancials';
import { useChartTheme } from '../lib/chartTheme';
import { fmtK } from '../lib/format';

const n = (v: number) => (Number.isFinite(v) ? v : 0);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

type Obligation = {
  type: string;
  desc: string;
  periodicite: string;
  montant: number;
  echeance: Date;
};

export default function EcheancierFiscal() {
  const { currentYear } = useApp();
  const org = useCurrentOrg();
  const { sig, balance } = useStatements();
  const ct = useChartTheme();

  const model = useMemo(() => {
    if (!sig) return null;
    const netC = (re: RegExp) => balance.filter((r) => re.test(r.account)).reduce((s, r) => s + (r.soldeC - r.soldeD), 0);
    const netD = (re: RegExp) => balance.filter((r) => re.test(r.account)).reduce((s, r) => s + (r.soldeD - r.soldeC), 0);

    const tvaCollectee = Math.max(0, netC(/^443/));
    const tvaDeductible = Math.max(0, netD(/^445/));
    const tvaNette = Math.max(0, tvaCollectee - tvaDeductible);          // à décaisser
    const its = Math.max(0, netC(/^447/));                                 // impôt sur salaires
    const cnps = Math.max(0, netC(/^43/));                                 // cotisations sociales
    const isEstime = Math.max(0, n(sig.resultat)) * 0.27;                  // IS ≈ 27 % (UEMOA moyen)
    const patente = Math.max(0, netC(/^446/));

    const now = new Date();
    const thisYear = now.getFullYear();
    // Prochaine échéance mensuelle : le 15 du mois suivant (déclarations M-1).
    const nextMonth15 = () => {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      return d;
    };
    // Prochain 15 d'un mois cible dans l'année (pour acomptes IS trimestriels).
    const at = (monthIndex: number, day: number) => new Date(thisYear + (monthIndex < now.getMonth() ? 1 : 0), monthIndex, day);

    const obligations: Obligation[] = [
      { type: 'TVA', desc: 'Déclaration & paiement TVA du mois précédent', periodicite: 'Mensuelle', montant: tvaNette, echeance: nextMonth15() },
      { type: 'ITS', desc: 'Impôt sur traitements & salaires (retenues)', periodicite: 'Mensuelle', montant: its, echeance: nextMonth15() },
      { type: 'CNPS / CNSS', desc: 'Cotisations sociales (part patronale + salariale)', periodicite: 'Mensuelle', montant: cnps, echeance: nextMonth15() },
      { type: 'Acompte IS', desc: "Acompte provisionnel d'impôt sur les sociétés (1/4)", periodicite: 'Trimestrielle', montant: isEstime / 4, echeance: [at(3, 20), at(5, 20), at(8, 20), at(11, 20)].find((d) => d >= now) ?? at(3, 20) },
      { type: 'Solde IS + DSF', desc: 'Solde IS & Déclaration Statistique et Fiscale', periodicite: 'Annuelle', montant: isEstime, echeance: new Date(thisYear + 1, 3, 30) },
      { type: 'Patente / CFE', desc: 'Contribution des patentes', periodicite: 'Annuelle', montant: patente, echeance: new Date(thisYear, 2, 31) < now ? new Date(thisYear + 1, 2, 31) : new Date(thisYear, 2, 31) },
    ];

    obligations.sort((a, b) => a.echeance.getTime() - b.echeance.getTime());

    const status = (d: Date): 'echu' | 'imminent' | 'avenir' => {
      const days = Math.round((d.getTime() - now.getTime()) / 86400000);
      if (days < 0) return 'echu';
      if (days <= 15) return 'imminent';
      return 'avenir';
    };

    const withStatus = obligations.map((o) => ({ ...o, st: status(o.echeance), jours: Math.round((o.echeance.getTime() - now.getTime()) / 86400000) }));
    const totalMois = withStatus.filter((o) => o.periodicite === 'Mensuelle').reduce((s, o) => s + o.montant, 0);
    const prochaine = withStatus.find((o) => o.st !== 'echu') ?? withStatus[0];
    const nbImminent = withStatus.filter((o) => o.st === 'imminent').length;

    return { withStatus, totalMois, prochaine, nbImminent, tvaCollectee, tvaDeductible };
  }, [sig, balance]);

  if (!sig) {
    return (
      <div>
        <DashboardTopBar currentRoute="/dashboard/echeancier-fiscal" />
        <DashHeader icon="EF" title="Échéancier fiscal & social" subtitle="Chargement des états financiers…" />
      </div>
    );
  }

  const m = model!;
  const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

  return (
    <div>
      <DashboardTopBar currentRoute="/dashboard/echeancier-fiscal" />
      <DashHeader
        icon="EF"
        title="Échéancier fiscal & social"
        subtitle={`Obligations déclaratives OHADA / UEMOA — montants estimés & échéances — ${org?.name ?? '—'} · Exercice ${currentYear}`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard title="Charges mensuelles récurrentes" value={fmtK(m.totalMois)} unit="XOF" subValue="TVA + ITS + CNPS" icon={<Receipt className="w-4 h-4" />} color={ct.at(1)} />
        <KPICard title="Prochaine échéance" value={m.prochaine ? fmtDate(m.prochaine.echeance) : '—'} subValue={m.prochaine ? `${m.prochaine.type} · ${fmtK(m.prochaine.montant)}` : '—'} icon={<CalendarClock className="w-4 h-4" />} color={ct.at(0)} />
        <KPICard title="Échéances imminentes" value={String(m.nbImminent)} subValue="Dans les 15 prochains jours" icon={<AlertTriangle className="w-4 h-4" />} color={m.nbImminent > 0 ? ct.at(3) : ct.at(0)} />
        <KPICard title="TVA nette du mois" value={fmtK(Math.max(0, m.tvaCollectee - m.tvaDeductible))} unit="XOF" subValue={`Collectée ${fmtK(m.tvaCollectee)} − déductible ${fmtK(m.tvaDeductible)}`} icon={<Coins className="w-4 h-4" />} color={ct.at(4)} />
      </div>

      <ChartCard title="Calendrier des obligations" subtitle="Trié par échéance — montants estimés depuis la balance (indicatifs)" accent={ct.at(0)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary-200 dark:border-primary-700 text-xs uppercase text-primary-500">
                <th className="text-left py-2 px-3">Obligation</th>
                <th className="text-left py-2 px-3 hidden md:table-cell">Périodicité</th>
                <th className="text-right py-2 px-3">Montant estimé</th>
                <th className="text-left py-2 px-3">Échéance</th>
                <th className="text-left py-2 px-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 dark:divide-primary-800">
              {m.withStatus.map((o, i) => (
                <tr key={i} className="hover:bg-primary-50/60 dark:hover:bg-primary-900/40">
                  <td className="py-2.5 px-3">
                    <p className="font-medium">{o.type}</p>
                    <p className="text-[11px] text-primary-400">{o.desc}</p>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-primary-500 hidden md:table-cell">{o.periodicite}</td>
                  <td className="py-2.5 px-3 text-right num font-semibold">{fmtK(o.montant)}</td>
                  <td className="py-2.5 px-3 text-xs">{fmtDate(o.echeance)}</td>
                  <td className="py-2.5 px-3">
                    <StatusBadge st={o.st} jours={o.jours} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-primary-400 mt-3 leading-relaxed">
          Montants indicatifs : IS estimé à 27 % du résultat net (taux moyen UEMOA — ajustez selon votre pays), TVA/ITS/CNPS depuis les soldes 443/445/447/43. Vérifiez toujours les échéances exactes de votre administration fiscale nationale.
        </p>
      </ChartCard>
    </div>
  );
}

function StatusBadge({ st, jours }: { st: 'echu' | 'imminent' | 'avenir'; jours: number }) {
  if (st === 'echu') return <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-error/15 text-error">Échu · {Math.abs(jours)} j</span>;
  if (st === 'imminent') return <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-warning/15 text-warning">Dans {jours} j</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-success/15 text-success">Dans {jours} j</span>;
}
