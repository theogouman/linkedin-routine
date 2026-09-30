#!/usr/bin/env node
/**
 * Génère les icônes PWA sans dépendance graphique.
 *
 * L'encodeur PNG vit dans `scripts/lib/png.mjs`, partagé avec les icônes de
 * l'extension Chrome pour que les deux jeux ne divergent pas.
 *
 * Marque : fond rouge Notion Club (#e0625a), trois barres blanches de largeur
 * décroissante — une file qui se vide, ce que fait l'app.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { encodePng, roundedRectCoverage } from "./lib/png.mjs";

const BRAND = [224, 98, 90];
const WHITE = [255, 255, 255];

function drawIcon(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  // Une icône maskable doit survivre à un rognage circulaire : on remplit tout
  // le carré et on resserre le contenu dans la zone sûre.
  const pad = maskable ? 0 : size * 0.08;
  const radius = maskable ? 0 : size * 0.22;
  const inset = maskable ? size * 0.22 : size * 0.26;

  const bars = [
    { w: 0.56, y: 0.30 },
    { w: 0.40, y: 0.47 },
    { w: 0.24, y: 0.64 },
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const bg = roundedRectCoverage(px, py, pad, pad, size - pad, size - pad, radius);

      let ink = 0;
      for (const bar of bars) {
        const barLeft = inset;
        const barRight = inset + (size - inset * 2) * (bar.w / 0.56);
        const barTop = size * bar.y;
        const barBottom = barTop + size * 0.085;
        ink = Math.max(
          ink,
          roundedRectCoverage(px, py, barLeft, barTop, barRight, barBottom, size * 0.042),
        );
      }

      const offset = (y * size + x) * 4;
      const colour = [
        BRAND[0] + (WHITE[0] - BRAND[0]) * ink,
        BRAND[1] + (WHITE[1] - BRAND[1]) * ink,
        BRAND[2] + (WHITE[2] - BRAND[2]) * ink,
      ];
      pixels[offset] = Math.round(colour[0]);
      pixels[offset + 1] = Math.round(colour[1]);
      pixels[offset + 2] = Math.round(colour[2]);
      pixels[offset + 3] = Math.round(bg * 255);
    }
  }
  return encodePng(size, size, pixels);
}

const outDir = path.join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

const targets = [
  ["icon-192.png", 192, { maskable: false }],
  ["icon-512.png", 512, { maskable: false }],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, { maskable: true }],
];

for (const [name, size, options] of targets) {
  writeFileSync(path.join(outDir, name), drawIcon(size, options));
  console.log(`✓ public/icons/${name} (${size}×${size})`);
}
