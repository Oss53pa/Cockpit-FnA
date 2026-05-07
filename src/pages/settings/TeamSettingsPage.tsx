/**
 * TeamSettingsPage.tsx — Page "Paramètres → Utilisateurs" générique
 * ==================================================================
 * Composant réutilisable pour gérer l'équipe d'un tenant dans n'importe
 * quelle app Atlas Studio (Cockpit F&A, Atlas F&A, CockpitJourney,
 * TableSmart, Advist, Liass'Pilot).
 *
 * Source de vérité : table licence_seats (système universel Atlas Studio)
 * Edge function pour inviter : invite-user (existante)
 *
 * Permissions :
 *  - app_super_admin : peut tout faire (inviter, changer rôles, supprimer)
 *  - app_admin       : peut inviter et gérer editor/viewer (pas changer un super_admin)
 *  - editor / viewer : lecture seule
 *
 * Route suggérée : /settings/team
 *
 * Dépendances : @supabase/supabase-js, react
 *
 * Variables d'env :
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Role = "app_super_admin" | "app_admin" | "editor" | "viewer";

interface Seat {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: string;
  user_id: string | null;
  invitation_sent_at: string | null;
  invitation_accepted_at: string | null;
  invitation_expires_at: string | null;
  last_login: string | null;
  login_count: number;
  created_at: string;
}

interface TenantInfo {
  licence_id: string;
  tenant_id: string;
  myRole: Role;
  myEmail: string;
}

const ROLE_LABEL: Record<Role, { label: string; color: string; description: string }> = {
  app_super_admin: { label: "Super-admin", color: "#10B981", description: "Accès total, gère l'abonnement et l'équipe" },
  app_admin: { label: "Admin", color: "#3B82F6", description: "Gère l'équipe et les paramètres applicatifs" },
  editor: { label: "Éditeur", color: "#F59E0B", description: "Peut créer et modifier les données" },
  viewer: { label: "Lecteur", color: "#6B7280", description: "Consultation uniquement" },
};

const ASSIGNABLE_ROLES: Role[] = ["app_admin", "editor", "viewer"];

function canManage(myRole: Role, targetRole: Role): boolean {
  if (myRole === "app_super_admin") return targetRole !== "app_super_admin";
  if (myRole === "app_admin") return targetRole === "editor" || targetRole === "viewer";
  return false;
}

function canInvite(myRole: Role): boolean {
  return myRole === "app_super_admin" || myRole === "app_admin";
}

export default function TeamSettingsPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", role: "editor" as Role });
  const [inviting, setInviting] = useState(false);
  const [actioningSeat, setActioningSeat] = useState<string | null>(null);

  async function loadTeam() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Vous devez être connecté."); return; }

      const { data: mySeat, error: seatErr } = await supabase
        .from("licence_seats")
        .select("licence_id, tenant_id, role")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (seatErr) throw seatErr;
      if (!mySeat) {
        setError("Aucune licence active. Contactez votre administrateur.");
        return;
      }

      setTenant({
        licence_id: mySeat.licence_id,
        tenant_id: mySeat.tenant_id,
        myRole: mySeat.role as Role,
        myEmail: user.email!,
      });

      const { data: allSeats, error: seatsErr } = await supabase
        .from("licence_seats")
        .select("*")
        .eq("licence_id", mySeat.licence_id)
        .order("created_at", { ascending: true });
      if (seatsErr) throw seatsErr;
      setSeats(allSeats as Seat[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTeam(); }, []);

  const totalSeats = seats.length;
  const activeSeats = seats.filter((s) => s.status === "active" && s.invitation_accepted_at).length;
  const pendingInvites = seats.filter((s) => s.status === "active" && !s.invitation_accepted_at).length;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setInviting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expirée");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            licence_id: tenant.licence_id,
            tenant_id: tenant.tenant_id,
            email: inviteForm.email,
            full_name: inviteForm.full_name,
            role: inviteForm.role,
            send_email: true,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setShowInvite(false);
      setInviteForm({ email: "", full_name: "", role: "editor" });
      await loadTeam();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(seat: Seat, newRole: Role) {
    if (!tenant || !canManage(tenant.myRole, seat.role) || !canManage(tenant.myRole, newRole)) {
      setError("Vous n'avez pas les permissions pour cette action.");
      return;
    }
    setActioningSeat(seat.id);
    const { error } = await supabase
      .from("licence_seats")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", seat.id);
    if (error) setError(error.message);
    else await loadTeam();
    setActioningSeat(null);
  }

  async function suspendSeat(seat: Seat) {
    if (!tenant || !canManage(tenant.myRole, seat.role)) {
      setError("Vous n'avez pas les permissions pour cette action.");
      return;
    }
    if (!confirm(`Suspendre ${seat.email} ?`)) return;
    setActioningSeat(seat.id);
    const { error } = await supabase
      .from("licence_seats")
      .update({ status: "suspended", updated_at: new Date().toISOString() })
      .eq("id", seat.id);
    if (error) setError(error.message);
    else await loadTeam();
    setActioningSeat(null);
  }

  async function reactivateSeat(seat: Seat) {
    if (!tenant || !canInvite(tenant.myRole)) return;
    setActioningSeat(seat.id);
    const { error } = await supabase
      .from("licence_seats")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", seat.id);
    if (error) setError(error.message);
    else await loadTeam();
    setActioningSeat(null);
  }

  if (loading) return <div style={styles.center}>Chargement de l'équipe…</div>;
  if (!tenant) return <div style={styles.center}>{error || "Aucune licence trouvée."}</div>;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={{ margin: 0 }}>Équipe</h1>
          <p style={{ color: "#94A3B8", margin: "6px 0 0", fontSize: 14 }}>
            {totalSeats} membres · {activeSeats} actifs · {pendingInvites} en attente
          </p>
        </div>
        {canInvite(tenant.myRole) && (
          <button onClick={() => setShowInvite(true)} style={styles.btnPrimary}>
            + Inviter un membre
          </button>
        )}
      </header>

      {error && (
        <div style={styles.errorBox}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}>✕</button>
        </div>
      )}

      <div style={styles.legend}>
        Votre rôle :{" "}
        <span style={{ ...styles.roleBadge, background: ROLE_LABEL[tenant.myRole].color }}>
          {ROLE_LABEL[tenant.myRole].label}
        </span>{" "}
        — {ROLE_LABEL[tenant.myRole].description}
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} style={styles.inviteForm}>
          <h3 style={{ margin: "0 0 16px" }}>Inviter un nouveau membre</h3>
          <div style={styles.formRow}>
            <label style={styles.label}>Email</label>
            <input
              type="email" required value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              style={styles.input} placeholder="collaborateur@entreprise.com"
            />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Nom complet</label>
            <input
              type="text" required value={inviteForm.full_name}
              onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
              style={styles.input} placeholder="Jean Dupont"
            />
          </div>
          <div style={styles.formRow}>
            <label style={styles.label}>Rôle</label>
            <select
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Role })}
              style={styles.input}
            >
              {ASSIGNABLE_ROLES.filter((r) => canManage(tenant.myRole, r)).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r].label} — {ROLE_LABEL[r].description}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" disabled={inviting} style={styles.btnPrimary}>
              {inviting ? "Envoi en cours…" : "Envoyer l'invitation"}
            </button>
            <button type="button" onClick={() => setShowInvite(false)} style={styles.btnSecondary}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Membre</th>
              <th style={styles.th}>Rôle</th>
              <th style={styles.th}>Statut</th>
              <th style={styles.th}>Dernière connexion</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {seats.map((seat) => {
              const isPending = !seat.invitation_accepted_at && seat.status === "active";
              const isMe = seat.email === tenant.myEmail;
              const canIManage = canManage(tenant.myRole, seat.role) && !isMe;
              return (
                <tr key={seat.id} style={{ opacity: seat.status === "suspended" ? 0.5 : 1 }}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>
                      {seat.full_name || seat.email.split("@")[0]}
                      {isMe && <span style={styles.youTag}>vous</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>{seat.email}</div>
                  </td>
                  <td style={styles.td}>
                    {canIManage ? (
                      <select
                        value={seat.role}
                        disabled={actioningSeat === seat.id}
                        onChange={(e) => changeRole(seat, e.target.value as Role)}
                        style={{ ...styles.select, color: ROLE_LABEL[seat.role].color, borderColor: ROLE_LABEL[seat.role].color }}
                      >
                        {ASSIGNABLE_ROLES.filter((r) => canManage(tenant.myRole, r)).map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r].label}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ ...styles.roleBadge, background: ROLE_LABEL[seat.role].color }}>
                        {ROLE_LABEL[seat.role].label}
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {seat.status === "suspended" ? (
                      <span style={{ color: "#EF4444", fontSize: 13 }}>● Suspendu</span>
                    ) : isPending ? (
                      <span style={{ color: "#F59E0B", fontSize: 13 }}>● Invitation envoyée</span>
                    ) : (
                      <span style={{ color: "#10B981", fontSize: 13 }}>● Actif</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>
                      {seat.last_login
                        ? new Date(seat.last_login).toLocaleDateString("fr-FR")
                        : "—"}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {canIManage && (
                      <div style={{ display: "flex", gap: 4 }}>
                        {seat.status === "active" ? (
                          <button onClick={() => suspendSeat(seat)} disabled={actioningSeat === seat.id} style={styles.btnDanger}>
                            Suspendre
                          </button>
                        ) : (
                          <button onClick={() => reactivateSeat(seat)} disabled={actioningSeat === seat.id} style={styles.btnSecondary}>
                            Réactiver
                          </button>
                        )}
                      </div>
                    )}
                    {isMe && <span style={{ fontSize: 11, color: "#64748B" }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: 24 },
  center: { textAlign: "center", padding: 80, color: "#94A3B8" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  errorBox: { background: "#FEE2E2", color: "#991B1B", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 },
  legend: { padding: 12, background: "#F8FAFC", borderRadius: 8, fontSize: 13, color: "#64748B", marginBottom: 16 },
  inviteForm: { background: "#F8FAFC", padding: 24, borderRadius: 12, marginBottom: 24, border: "1px solid #E2E8F0" },
  formRow: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: 600, color: "#475569" },
  input: { padding: "10px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14 },
  tableWrap: { background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #E2E8F0" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" },
  td: { padding: "14px 16px", borderBottom: "1px solid #F1F5F9", verticalAlign: "middle", fontSize: 14 },
  roleBadge: { display: "inline-block", padding: "4px 10px", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600 },
  select: { padding: "6px 10px", border: "1px solid", borderRadius: 6, fontSize: 13, fontWeight: 600, background: "#fff", cursor: "pointer" },
  youTag: { fontSize: 10, padding: "2px 6px", background: "#10B981", color: "#fff", borderRadius: 4, marginLeft: 8, fontWeight: 700 },
  btnPrimary: { padding: "10px 20px", background: "#10B981", color: "#042F1F", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  btnSecondary: { padding: "8px 14px", background: "#fff", color: "#475569", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 12, cursor: "pointer" },
  btnDanger: { padding: "8px 14px", background: "#fff", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 6, fontSize: 12, cursor: "pointer" },
};
