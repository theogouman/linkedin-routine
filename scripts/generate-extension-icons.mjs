#!/usr/bin/env node
/**
 * Icônes de l'extension Chrome.
 *
 * Même marque que la PWA — fond rouge Notion Club — mais une bulle et non les
 * trois barres : dans une barre d'outils, à 16 pixels, il faut une forme qui
 * dise ce que fait l'outil, et l'outil commente.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { encodePng, roundedRectCoverage, triangleCoverage } from "./lib/png.mjs";

const BRAND = [224, 98, 90];
const WHITE = [255, 255, 255];

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const pad = size * 0.06;
  const radius = size * 0.22;

  // Corps de la bulle, puis sa queue en bas à gauche.
  const bubble = [size * 0.2, size * 0.24, size * 0.8, size * 0.62];
  const tail = [
    [size * 0.33, size * 0.6],
    [size * 0.33, size * 0.8],
    [size * 0.52, size * 0.6],
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const bg = roundedRectCoverage(px, py, pad, pad, size - pad, size - pad, radius);

      const ink = Math.max(
        roundedRectCoverage(px, py, bubble[0], bubble[1], bubble[2], bubble[3], size * 0.11),
        triangleCoverage(px, py, tail[0], tail[1], tail[2]),
      );

      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(
          BRAND[channel] + (WHITE[channel] - BRAND[channel]) * ink,
        );
      }
      pixels[offset + 3] = Math.round(bg * 255);
    }
  }
  return encodePng(size, size, pixels);
}

const outDir = path.join(process.cwd(), "extension", "icons");
mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  writeFileSync(path.join(outDir, `icon-${size}.png`), drawIcon(size));
  console.log(`✓ extension/icons/icon-${size}.png (${size}×${size})`);
}
