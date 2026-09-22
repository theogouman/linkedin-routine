import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Config plate (ESLint 9). `eslint-config-next` 16 exporte directement des
 * configs plates : passer par FlatCompat casse sur une référence circulaire du
 * plugin React.
 */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".claude/**",
      "public/sw.js",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Isolation des modules : un module métier ne dépend jamais d'un autre.
    // Le partage passe par @/shared, l'orchestration par src/app et src/server.
    files: ["src/modules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*"],
              message:
                "Un module ne doit pas importer un autre module. Passe par @/shared, ou orchestre depuis src/server ou src/app.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
