/**
 * ReadOnlyBanner — bandeau persistant affiché quand l'utilisateur a un rôle
 * `viewer` sur l'org courante. Évite la frustration de cliquer sur des
 * boutons qui semblent fonctionnels mais échouent côté RLS.
 *
 * S'affiche en haut des pages applicatives (au-dessus du Header).
 */
import { Eye, X } from 'lucide-react';
import { useState } from 'react';
import { useOrgPermissions } from '../../hooks/useOrgPermissions';

export function ReadOnlyBanner() {
  const { isReadOnly, roleLabel } = useOrgPermissions();
  const [hidden, setHidden] = useState(false);

  if (!isReadOnly || hidden) return null;

  return (
    <div className="sticky top-0 z-30 bg-warning/15 border-b border-warning/30 text-warning-dark dark:text-warning text-xs">
      <div className="px-3 sm:px-4 py-1.5 flex items-center gap-2 flex-wrap">
        <Eye className="w-3.5 h-3.5 shrink-0" />
        <span className="font-semibold">Mode lecture seule</span>
        <span className="opacity-80">·</span>
        <span className="opacity-90">
          Votre rôle ({roleLabel}) ne permet pas la modification des données.
          Les actions d'écriture (import, suppression, édition) sont désactivées.
        </span>
        <button
          onClick={() => setHidden(true)}
          className="ml-auto p-1 rounded hover:bg-warning/20 transition"
          aria-label="Masquer le bandeau"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
