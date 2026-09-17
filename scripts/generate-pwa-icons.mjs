/**
 * Render the PWA icon set from public/logo.svg.
 *
 * Run after changing the logo: `node scripts/generate-pwa-icons.mjs`.
 * The PNGs are committed, because the production build copies public/ as-is
 * and installability must not depend on a generator running first.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = path.join(ROOT, 'public', 'logo.svg');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

/** The app's own background, so the icon never shows a white plate. */
const BACKGROUND = { r: 6, g: 10, b: 14, alpha: 1 };

/**
 * Fraction of the canvas the artwork may occupy.
 *
 * A maskable icon can be cropped to a circle inscribed in the middle 80%, so
 * its artwork stays inside a smaller box than the plain one.
 */
const INSET = { any: 0.78, maskable: 0.56 };

const TARGETS = [
  { size: 192, purpose: 'any', name: 'icon-192.png' },
  { size: 512, purpose: 'any', name: 'icon-512.png' },
  { size: 192, purpose: 'maskable', name: 'icon-192-maskable.png' },
  { size: 512, purpose: 'maskable', name: 'icon-512-maskable.png' },
  { size: 180, purpose: 'any', name: 'apple-touch-icon.png' },
];

const svg = await readFile(SOURCE);
await mkdir(OUT_DIR, { recursive: true });

for (const { size, purpose, name } of TARGETS) {
  const box = Math.round(size * INSET[purpose]);
  // Render the SVG at the inset box first: rasterising at the final size and
  // then downscaling loses the thin strokes in the logo's linework.
  const artwork = await sharp(svg, { density: 512 })
    .resize(box, box, { fit: 'contain', background: { ...BACKGROUND, alpha: 0 } })
    .png()
    .toBuffer();

  const offset = Math.round((size - box) / 2);
  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: artwork, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, name));

  process.stdout.write(`${name}  ${size}x${size} (${purpose})\n`);
}

// A monochrome mask for browsers that ask for one (Safari pinned tabs).
await writeFile(
  path.join(OUT_DIR, 'README.md'),
  '# PWA icons\n\nGenerated from `public/logo.svg` by `scripts/generate-pwa-icons.mjs`.\nDo not edit by hand — re-run the script instead.\n',
);
