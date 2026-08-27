import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const BASE_DIR = process.cwd();

const ABREVIATURAS = {
  'Royale Union Saint-Gilloise': 'R. Union SG',
  'Internazionale': 'Inter',
  'Eintracht Frankfurt': 'E. Frankfurt',
  'Olympique Marseille': 'O. Marseille',
  'PSV Eindhoven': 'PSV',
  'Borussia Dortmund': 'B. Dortmund',
  'Bayer Leverkusen': 'B. Leverkusen',
  'Sporting CP': 'Sporting CP',
};

export function abreviarNombre(name) {
  if (!name) return '---';
  if (ABREVIATURAS[name]) return ABREVIATURAS[name];
  if (name.length <= 14) return name;
  const words = name.split(' ');
  if (words.length === 1) return name.substring(0, 12) + '.';
  return words.map((w, i) => i === words.length - 1 ? w : w[0] + '.').join(' ');
}

export function loadImageSafe(relativePath) {
  const fullPath = join(BASE_DIR, relativePath);
  if (!existsSync(fullPath)) return null;
  try {
    return readFileSync(fullPath);
  } catch {
    return null;
  }
}

export function drawPlaceholder(doc, x, y, size, text) {
  doc.save();
  doc.rect(x, y, size, size).fill('#e0e0e0');
  doc.fontSize(6).fillColor('#666');
  const initials = text ? text.substring(0, 3).toUpperCase() : '?';
  doc.text(initials, x, y + size / 2 - 4, { width: size, align: 'center' });
  doc.restore();
}

export async function drawTeamCrest(doc, teamId, x, y, size = 14) {
  const buffer = loadImageSafe(`data/sofascore/imgEquipos/${teamId}.webp`);
  if (buffer) {
    try {
      const pngBuffer = await sharp(buffer).png().toBuffer();
      doc.image(pngBuffer, x, y, { width: size, height: size });
    } catch {
      drawPlaceholder(doc, x, y, size, String(teamId));
    }
  } else {
    drawPlaceholder(doc, x, y, size, String(teamId));
  }
}

const EMOJI_CACHE_DIR = join(BASE_DIR, 'data', 'emojis');

export async function emojiToImage(emoji, size = 20) {
  const cp = [...emoji].map(c => c.codePointAt(0).toString(16)).join('-');
  const cacheFile = join(EMOJI_CACHE_DIR, `${cp}.png`);

  if (existsSync(cacheFile)) {
    return readFileSync(cacheFile);
  }

  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  const png = await sharp(buf).resize(size, size).png().toBuffer();

  mkdirSync(EMOJI_CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, png);

  return png;
}

export async function drawPlayerPhoto(doc, playerId, x, y, size = 12) {
  const buffer = loadImageSafe(`data/sofascore/imgJugadores/${playerId}.webp`);
  if (buffer) {
    try {
      const pngBuffer = await sharp(buffer).png().toBuffer();
      doc.image(pngBuffer, x, y, { width: size, height: size });
    } catch {
      drawPlaceholder(doc, x, y, size, String(playerId));
    }
  } else {
    drawPlaceholder(doc, x, y, size, String(playerId));
  }
}
