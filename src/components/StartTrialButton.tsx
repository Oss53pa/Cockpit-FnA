/**
 * StartTrialButton.tsx — Bouton "Essayer gratuitement" pour la marketplace
 *
 * À placer sur chaque carte d'app dans la marketplace publique
 * (ex: /portal/apps ou /apps).
 *
 * L'user doit être connecté. S'il ne l'est pas, redirigez-le vers /login d'abord.
 */

import { useState } from "react";
import { supabase } from "../lib/supabase";

interface Props {
  appId: string;
  appName: string;
  defaultPlan?: string;
  trialDays?: number;
  onSuccess?: (data: any) => void;
}

export default function StartTrialButton({
  appId,
  appName,
  defaultPlan,
  trialDays = 14,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        // Rediriger vers login avec retour
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-trial`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ appId, plan: defaultPlan, trial_days: trialDays }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setSuccess(data);
      onSuccess?.(data);

      // Redirection automatique vers le portal après 2s
      setTimeout(() => {
        window.location.href = data.redirectUrl || "/portal";
      }, 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ padding: 12, background: "#10B98120", border: "1px solid #10B981", borderRadius: 8, color: "#10B981", fontSize: 14 }}>
        ✓ {success.message}
        <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>Redirection en cours…</div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: "12px 24px",
          background: loading ? "#6B7280" : "#10B981",
          color: "#042F1F",
          border: "none",
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {loading ? "Activation…" : `Essayer ${appName} gratuitement (${trialDays} jours)`}
      </button>
      {error && (
        <div style={{ marginTop: 8, padding: 8, background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}
