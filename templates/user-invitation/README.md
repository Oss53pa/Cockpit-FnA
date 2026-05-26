# Template — Invitation d'utilisateurs multi-tenant (Supabase)

Flux d'invitation réutilisable, extrait et dé-spécifié de Cockpit FnA. À copier
dans n'importe quelle app Supabase + frontend (React ici, mais transposable).

## Architecture

```
Admin (UI)  ──inviteUser()──►  Edge Function "invite-user"  ──►  Resend (email)
                                      │
                                      ├─ AUTHN appelant (JWT)
                                      ├─ AUTHZ : admin de chaque org ? (service-role ignore la RLS)
                                      ├─ generateLink (hashed_token, anti-prefetch)
                                      └─ upsert user_orgs + org_members
                                                                   │
Invité ──clic email──► /auth/accept-invite ──verifyOtp()──► session ──updateUser(password)──► app
```

- **`user_orgs (user_id, org_id, role)`** = source de vérité de l'accès → lue par la RLS.
- **`org_members (org_id, email, …)`** = roster d'affichage (avant acceptation).

## Contenu

| Fichier | Où le déployer |
|---|---|
| `sql/user_invitation.sql` | Migration Postgres (Supabase) : tables, RLS, helper `auth_org_ids`, RPC `create_org_with_admin`. |
| `supabase/functions/invite-user/index.ts` | `supabase functions deploy invite-user` |
| `web/AcceptInvite.tsx` | Page front, route `/auth/accept-invite` |
| `web/inviteUser.ts` | Helper appelé depuis votre écran admin |

## Mise en place (5 étapes)

1. **SQL** — appliquez `sql/user_invitation.sql`. Puis, sur **chaque table métier**
   (ayant une colonne `org_id`), collez le patron RLS du §5 du fichier.
2. **Secrets Edge Function** :
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx \
     RESEND_FROM="MonApp <no-reply@mondomaine.com>" APP_NAME="MonApp"
   # SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.
   supabase functions deploy invite-user   # garder la vérif JWT ACTIVE
   ```
   Vérifiez le domaine d'envoi dans Resend (SPF/DKIM).
3. **Front** — copiez `web/`, branchez votre client supabase-js (`./supabaseClient`),
   montez la route `/auth/accept-invite` → `<AcceptInvite/>`.
4. **Écran admin** — sur clic « Inviter » (après confirmation), appelez `inviteUser({…})`.
   En cas d'échec d'email, `res.magicLink` permet une copie manuelle.
5. **Création d'org** — depuis le client, appelez la RPC `create_org_with_admin(orgId, name)`
   (le créateur devient admin) au lieu d'écrire `user_orgs` directement.

## Les 3 points non négociables (sinon ça casse)

1. **Anti-prefetch** : on envoie `hashed_token` + `type` (pas `action_link`) et on
   consomme via `verifyOtp()` côté client. Sans ça, les scanners email (Outlook
   SafeLinks, Proofpoint, Gmail) consomment le lien → « lien expiré » au 1er clic.
2. **Authz dans l'Edge Function** : la service-role **ignore la RLS**, donc on
   re-vérifie que l'appelant est `admin` de chaque org ciblée. Indispensable.
3. **`user_orgs` non écrivable côté client** : aucune policy INSERT/UPDATE/DELETE.
   Les écritures passent par l'Edge Function (service-role) ou les RPC SECURITY
   DEFINER → pas d'auto-escalade de droits.

## Personnalisation rapide

- **Préfixe tables** : `user_orgs` → `app_user_orgs`, etc. (adapter SQL + requêtes).
- **Rôles** : modifier le `check (role in …)` + la logique de `auth_org_ids`.
- **Branding email** : `APP_NAME`, `BRAND_COLOR`, template dans `inviteUser.ts`.
- **Fournisseur email** : remplacer le bloc `fetch('https://api.resend.com/emails')`
  par SendGrid/Postmark/SES (même principe).
