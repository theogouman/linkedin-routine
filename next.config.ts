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
  },
};

export default nextConfig;
