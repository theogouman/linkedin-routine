#!/usr/bin/env node
/**
 * Génère les icônes PWA sans dépendance graphique.
 *
 * Un encodeur PNG tient en trente lignes avec zlib ; ajouter sharp ou canvas
 * pour trois carrés arrondis coûterait un binaire natif à installer sur
 * chaque machine et dans le CI.
 *
 * Marque : fond rouge Notion Club (#e0625a), trois barres blanches de largeur
 * décroissante — une file qui se vide, ce que fait l'app.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BRAND = [224, 98, 90];
const WHITE = [255, 255, 255];

function crc32(buffer) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filtre None
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Distance signée à un rectangle arrondi — sert à antialiaser les bords. */
function roundedRectCoverage(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.sqrt(dx * dx + dy * dy) - radius;
  return Math.max(0, Math.min(1, 0.5 - distance));
}

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
