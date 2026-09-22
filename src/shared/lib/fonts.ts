import localFont from "next/font/local";

// SF Pro Display — police signature Notion Club, reprise à l'identique depuis
// le dépôt de référence (DA imposée par le brief). Self-hostée via
// next/font/local : embarquée au build, aucune requête réseau au runtime.
export const sfProDisplay = localFont({
  src: [
    { path: "../fonts/SF-Pro-Display-Regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/SF-Pro-Display-Medium.otf", weight: "500", style: "normal" },
    { path: "../fonts/SF-Pro-Display-Semibold.otf", weight: "600", style: "normal" },
    { path: "../fonts/SF-Pro-Display-Bold.otf", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-sf-pro-display",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "system-ui",
    "sans-serif",
  ],
});
