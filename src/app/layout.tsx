import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { sfProDisplay } from "@/shared/lib/fonts";
import { ServiceWorkerRegistrar } from "@/shared/components/ServiceWorkerRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Routine",
  description: "Fil LinkedIn curé et inbox d'engagement.",
  manifest: "/manifest.webmanifest",
  applicationName: "Routine",
  appleWebApp: {
    capable: true,
    title: "Routine",
    // `black-translucent` étend la page jusqu'au bord haut du téléphone ;
    // la compensation d'encoche est portée par `.nc-page`.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Bloque le zoom automatique d'iOS au focus d'un champ : sans lui, ouvrir
  // le composer décale toute la page.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Pose le thème AVANT la première peinture. Sans ce script inline, l'app
 * s'affiche une frame en clair avant de basculer en sombre.
 */
const THEME_INIT = `(function(){try{var p=localStorage.getItem('theme');var t=p==='light'||p==='dark'?p:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');var m=document.createElement('meta');m.setAttribute('name','theme-color');m.setAttribute('content',t==='dark'?'#141211':'#f5f2f2');document.head.appendChild(m);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${sfProDisplay.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full font-sans">
        {/* Calque de fond unique, monté une seule fois : le contenu défile
            par-dessus en transparent, aucune couche ne se décolle au scroll. */}
        <div className="nc-app-bg" aria-hidden />
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "var(--color-surface-card)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
              borderRadius: "var(--nc-radius-xs)",
            },
          }}
        />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
