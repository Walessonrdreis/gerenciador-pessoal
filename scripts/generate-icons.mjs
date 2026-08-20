import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

function svg(size) {
  const s = size * 0.24; // stroke
  const c = size * 0.08; // margin
  const box = size * 0.72;
  const x = (size - box) / 2;
  return `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#0f1110"/>
    <rect x="${x}" y="${x}" width="${box}" height="${box}" rx="${size * 0.06}" fill="none" stroke="#7fd88f" stroke-width="${s}"/>
    <path d="M ${x + box * 0.22} ${size * 0.52} L ${x + box * 0.42} ${size * 0.66} L ${x + box * 0.78} ${size * 0.34}" stroke="#7fd88f" stroke-width="${s}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function maskable(size) {
  const s = size * 0.3;
  return `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#0f1110"/>
    <rect x="${size * 0.3}" y="${size * 0.3}" width="${size * 0.4}" height="${size * 0.4}" rx="${size * 0.05}" fill="none" stroke="#7fd88f" stroke-width="${s * 0.45}"/>
    <path d="M ${size * 0.38} ${size * 0.52} L ${size * 0.46} ${size * 0.6} L ${size * 0.62} ${size * 0.44}" stroke="#7fd88f" stroke-width="${s * 0.45}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(size))).png().toFile(`public/icons/icon-${size}.png`);
}
await sharp(Buffer.from(maskable(512))).png().toFile('public/icons/maskable-512.png');
console.log('ícones gerados');
