/**
 * UnclassifiedAccountsModal — diagnostic d'écart de balance.
 *
 * Liste les comptes responsables d'un déséquilibre du bilan avec :
 *   - Le code & libellé du compte
 *   - Le solde anormal
 *   - La cause probable + recommandation de correction
 *   - Un bouton "Voir dans le GL" qui filtre le grand livre sur ce compte
 *
 * Utilisé depuis le rendu du Bilan / Structure Actif-Passif quand un écart
 * est détecté (cf. `findUnclassifiedAccounts` dans engine/statements.ts).
 */
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Info } from 'lucide-react';
import type { UnclassifiedAccount } from '../../engine/statements';
import { Modal } from './Modal';
import { fmtFull } from '../../lib/format';

const REASON_LABELS: Record<UnclassifiedAccount['reason'], { label: string; color: string }> = {
  gestion_with_an: { label: 'À-nouveau erroné sur classe 6/7/8', color: 'text-error bg-error/10' },
  sign_inverted_amort: { label: 'Amortissement à signe inversé', color: 'text-warning bg-warning/10' },
  sign_inverted_provision: { label: 'Provision à signe inversé', color: 'text-warning bg-warning/10' },
  unmapped_account: { label: 'Compte hors plan SYSCOHADA', color: 'text-primary-700 bg-primary-100 dark:text-primary-300 dark:bg-primary-800' },
  partial_an: { label: 'À-nouveau partiel', color: 'text-warning bg-warning/10' },
};

export function UnclassifiedAccountsModal({
  open,
  onClose,
  accounts,
  ecartTotal,
}: {
  open: boolean;
  onClose: () => void;
  accounts: UnclassifiedAccount[];
  ecartTotal: number;
}) {
  const navigate = useNavigate();

  const goToGL = (code: string) => {
    // Navigue vers le Grand Livre et préfiltre sur le code de compte
    navigate(`/grand-livre?account=${encodeURIComponent(code)}`);
    onClose();
  };

  // Groupement par cause pour faciliter la lecture
  const grouped = new Map<UnclassifiedAccount['reason'], UnclassifiedAccount[]>();
  for (const a of accounts) {
    const arr = grouped.get(a.reason) ?? [];
    arr.push(a);
    grouped.set(a.reason, arr);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Diagnostic de l'écart de balance"
      subtitle={`${accounts.length} compte(s) à analyser · Écart total : ${fmtFull(ecartTotal)}`}
      footer={<button className="btn-primary" onClick={onClose}>Fermer</button>}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/30">
          <Info className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Pourquoi un écart ?</p>
            <p className="text-xs text-primary-500 mt-1">
              En partie double, Σ(débit) doit toujours être égal à Σ(crédit). Si le bilan
              ne s'équilibre pas, c'est qu'au moins un des cas suivants se produit dans le GL :
            </p>
            <ul className="text-xs text-primary-500 mt-2 space-y-0.5 list-disc list-inside">
              <li>Pièces déséquilibrées dans les RAN exportés par votre ERP source.</li>
              <li>À-nouveaux passés par erreur sur des comptes de classe 6/7/8.</li>
              <li>Comptes correcteurs (28x, 29x, 49x) au signe inversé.</li>
              <li>Comptes hors du plan SYSCOHADA (classes 0, 9, ou personnalisés).</li>
            </ul>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="p-4 text-center text-sm text-primary-500">
            Aucun compte identifié. L'écart vient probablement de pièces déséquilibrées au niveau global
            (Σ débit ≠ Σ crédit dans les écritures du Grand Livre). Vérifiez l'export depuis votre ERP source.
          </div>
        ) : (
          <>
            {Array.from(grouped.entries()).map(([reason, items]) => (
              <div key={reason}>
                <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium mb-2 ${REASON_LABELS[reason].color}`}>
                  <AlertTriangle className="w-3 h-3" />
                  {REASON_LABELS[reason].label} · {items.length}
                </div>
                <div className="border border-primary-200 dark:border-primary-800 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-primary-50 dark:bg-primary-900/30">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Compte</th>
                        <th className="text-left px-3 py-2 font-medium">Libellé</th>
                        <th className="text-right px-3 py-2 font-medium">Solde</th>
                        <th className="text-right px-3 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 50).map((a) => (
                        <tr key={a.account} className="border-t border-primary-100 dark:border-primary-800/50">
                          <td className="px-3 py-2 font-mono num">{a.account}</td>
                          <td className="px-3 py-2 truncate max-w-xs">{a.label}</td>
                          <td className={`px-3 py-2 text-right num font-semibold ${a.solde < 0 ? 'text-error' : 'text-warning'}`}>
                            {fmtFull(a.solde)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              className="btn-outline !py-1 !px-2 !text-[10px] inline-flex items-center gap-1"
                              onClick={() => goToGL(a.account)}
                              title="Ouvrir ce compte dans le Grand Livre"
                            >
                              <ExternalLink className="w-3 h-3" /> Voir GL
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Hint sous chaque groupe */}
                {items[0]?.hint && (
                  <p className="text-[11px] text-primary-500 mt-2 px-1 italic">
                    💡 {items[0].hint.split('. ').slice(1).join('. ') || items[0].hint}
                  </p>
                )}
              </div>
            ))}
            {accounts.length > 50 && (
              <p className="text-xs text-primary-500 text-center italic">
                Affichage limité aux 50 premiers comptes (sur {accounts.length}). Corrigez ceux-ci puis re-générez le rapport.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
