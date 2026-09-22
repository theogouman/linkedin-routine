export const metadata = { title: "Hors connexion — Routine" };

/**
 * Page servie par le service worker quand une navigation échoue et qu'aucune
 * version en cache n'existe (FR-011).
 */
export default function OfflinePage() {
  return (
    <main className="nc-page flex min-h-dvh items-center justify-center px-6">
      <div className="nc-card nc-content-enter w-full max-w-sm p-7 text-center">
        <h1 className="text-lg font-semibold">Hors connexion</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Les pages déjà consultées restent lisibles. Publier un commentaire,
          liker ou actualiser demande une connexion.
        </p>
      </div>
    </main>
  );
}
