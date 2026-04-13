import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useBalance, useRatios } from '../hooks/useFinancials';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Alert = { id: string; sev: Severity; title: string; msg: string; category: string };

const THRESHOLDS_KEY = 'alert-thresholds';
const ACK_KEY = 'alert-ack';

type Thresholds = {
  liquiditeGenerale: number;
  endettement: number;
  autonomie: number;
  dsoMax: number;
  tresoMin: number;
};
const defaults: Thresholds = { liquiditeGenerale: 1.5, endettement: 1.0, autonomie: 0.5, dsoMax: 60, tresoMin: 0 };

function loadAck(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ACK_KEY) ?? '[]')); } catch { return new Set(); }
}
function saveAck(s: Set<string>) { localStorage.setItem(ACK_KEY, JSON.stringify([...s])); }
function loadThresholds(): Thresholds {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(THRESHOLDS_KEY) ?? '{}') }; } catch { return defaults; }
}

export default function Alerts() {
  const balance = useBalance();
  const ratios = useRatios();
  const [ack, setAck] = useState<Set<string>>(() => loadAck());
  const [openSettings, setOpenSettings] = useState(false);
  const [th, setTh] = useState<Thresholds>(() => loadThresholds());

  useEffect(() => saveAck(ack), [ack]);

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    balance.forEach((r) => {
      if (r.account.startsWith('6') && r.soldeC > 1000) {
        out.push({ id: `abn-c-${r.account}`, sev: 'high', title: `Solde anormal — compte ${r.account}`,
          msg: `Compte de charge en solde créditeur de ${new Intl.NumberFormat('fr-FR').format(r.soldeC)} XOF`, category: 'Comptable' });
      }
      if (r.account.startsWith('7') && r.soldeD > 1000) {
        out.push({ id: `abn-p-${r.account}`, sev: 'medium', title: `Solde anormal — compte ${r.account}`,
          msg: `Compte de produit en solde débiteur de ${new Intl.NumberFormat('fr-FR').format(r.soldeD)} XOF`, category: 'Comptable' });
      }
    });
    ratios.forEach((r) => {
      if (r.status === 'alert') {
        out.push({ id: `rat-${r.code}`, sev: r.family === 'Liquidité' ? 'critical' : 'high',
          title: `Ratio sous le seuil — ${r.label}`,
          msg: `${r.label} à ${r.value.toFixed(2)} ${r.unit} (cible ${r.target} ${r.unit})`, category: r.family });
      } else if (r.status === 'warn') {
        out.push({ id: `rat-${r.code}`, sev: 'medium',
          title: `Ratio en zone de vigilance — ${r.label}`,
          msg: `${r.label} à ${r.value.toFixed(2)} ${r.unit}, cible ${r.target}`, category: r.family });
      }
    });
    return out.filter((a) => !ack.has(a.id));
  }, [balance, ratios, ack]);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  alerts.forEach((a) => counts[a.sev]++);

  const handleAck = (id: string) => setAck(new Set([...ack, id]));
  const resetAck = () => { setAck(new Set()); };

  const saveThresholds = () => {
    localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(th));
    setOpenSettings(false);
  };

  return (
    <div>
      <PageHeader
        title="Alertes & notifications"
        subtitle={`${alerts.length} alerte(s) active(s) · ${ack.size} traitée(s)`}
        action={<div className="flex gap-2">
          {ack.size > 0 && <button className="btn-outline" onClick={resetAck}>Réinitialiser traitées</button>}
          <button className="btn-outline" onClick={() => setOpenSettings(true)}>
            <Settings2 className="w-4 h-4" /> Configurer les seuils
          </button>
        </div>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
          <Card key={sev}>
            <div className="flex items-center gap-3">
              <AlertTriangle className={`w-5 h-5 text-primary-600`} />
              <div>
                <p className="text-xs text-primary-500 capitalize">{sev}</p>
                <p className="num text-2xl font-bold">{counts[sev]}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Alertes actives">
        {alerts.length === 0 ? (
          <div className="py-12 text-center text-primary-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-primary-500" />
            <p className="text-success font-medium">Aucune alerte active</p>
            <p className="text-xs mt-1">Les contrôles n'ont détecté aucune anomalie non traitée</p>
          </div>
        ) : (
          <ul className="divide-y divide-primary-200 dark:divide-primary-800 -my-2">
            {alerts.map((a) => (
              <li key={a.id} className="py-3 flex items-start gap-3">
                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 text-primary-600`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{a.title}</p>
                    <Badge variant={a.sev}>{a.sev}</Badge>
                    <Badge>{a.category}</Badge>
                  </div>
                  <p className="text-xs text-primary-500 mt-0.5">{a.msg}</p>
                </div>
                <button className="btn-outline !py-1 text-xs" onClick={() => handleAck(a.id)}>
                  <CheckCircle2 className="w-3 h-3" /> Traiter
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={openSettings}
        onClose={() => setOpenSettings(false)}
        title="Seuils d'alerte"
        subtitle="Définir les seuils au-delà / en-deçà desquels une alerte est levée"
        footer={<>
          <button className="btn-outline" onClick={() => setTh(defaults)}>Valeurs par défaut</button>
          <button className="btn-outline" onClick={() => setOpenSettings(false)}>Annuler</button>
          <button className="btn-primary" onClick={saveThresholds}>Enregistrer</button>
        </>}
      >
        <div className="space-y-4">
          <Num label="Liquidité générale (minimum)" value={th.liquiditeGenerale} step={0.1} onChange={(v) => setTh({ ...th, liquiditeGenerale: v })} hint="Actif circulant / Passif circulant — standard : 1,5" />
          <Num label="Endettement (maximum)" value={th.endettement} step={0.1} onChange={(v) => setTh({ ...th, endettement: v })} hint="Dettes fin. / Capitaux propres — standard : ≤ 1,0" />
          <Num label="Autonomie financière (minimum)" value={th.autonomie} step={0.05} onChange={(v) => setTh({ ...th, autonomie: v })} hint="Capitaux propres / Total Passif — standard : ≥ 0,5" />
          <Num label="DSO maximum (jours)" value={th.dsoMax} step={5} onChange={(v) => setTh({ ...th, dsoMax: v })} hint="Délai moyen clients — standard OHADA : 60 jours" />
          <Num label="Trésorerie minimum (XOF)" value={th.tresoMin} step={1_000_000} onChange={(v) => setTh({ ...th, tresoMin: v })} hint="Seuil plancher en-dessous duquel une alerte critique est levée" />
        </div>
      </Modal>
    </div>
  );
}

function Num({ label, value, onChange, step, hint }: { label: string; value: number; onChange: (v: number) => void; step: number; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-primary-500 font-medium block mb-1">{label}</label>
      <input type="number" step={step} className="input" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-[10px] text-primary-400 mt-1">{hint}</p>}
    </div>
  );
}
