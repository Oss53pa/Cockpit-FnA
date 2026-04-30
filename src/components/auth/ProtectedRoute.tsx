// Auth temporairement neutralisee pendant la refonte design Twisty.
// Toutes les routes "protegees" laissent passer (mode public) afin de pouvoir
// tester l'app visuellement sans login.
//
// Pour reactiver l'auth : restaurer la version d'origine (cf. historique git
// avant le commit `chore(auth): bypass total temporaire`).
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
