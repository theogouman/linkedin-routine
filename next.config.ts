import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les avatars et médias LinkedIn sont servis depuis des CDN à sous-domaines
  // variables (media.licdn.com, media-exp*.licdn.com…). On autorise le motif
  // large plutôt que d'énumérer : la liste bouge côté LinkedIn.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.licdn.com" },
      { protocol: "https", hostname: "**.apify.com" },
      { protocol: "https", hostname: "**.unipile.com" },
    ],
  },
  // Les process de génération (FR-007) sont lus sur le disque au runtime :
  // sans cette inclusion explicite, le tracing de Next les laisserait hors du
  // bundle serveur et la génération retomberait sur un process vide.
  outputFileTracingIncludes: {
    "/api/**": ["./process/**"],
    // Le cerveau du générateur de commentaires est lu au runtime comme les
    // process. Sans inclusion explicite, le tracing le laisse hors du bundle
    // et la génération échoue en production sur un fichier introuvable — pas
    // en local, où le disque contient tout le dépôt.
    // Le cerveau ET le corpus : l'app les porte, et c'est elle qui installe le
    // second en base. Sans inclusion explicite, le tracing les laisse hors du
    // bundle et tout échoue en production sur un fichier introuvable — pas en
    // local, où le disque contient tout le dépôt.
    "/**": ["./src/modules/ai/assets/**", "./data/**"],
  },
};

export default nextConfig;
