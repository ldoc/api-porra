import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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

export function drawTeamCrest(doc, teamId, x, y, size = 14) {
  const buffer = loadImageSafe(`data/sofascore/imgEquipos/${teamId}.webp`);
  if (buffer) {
    try {
      doc.image(buffer, x, y, { width: size, height: size });
    } catch {
      drawPlaceholder(doc, x, y, size, String(teamId));
    }
  } else {
    drawPlaceholder(doc, x, y, size, String(teamId));
  }
}

export function drawPlayerPhoto(doc, playerId, x, y, size = 12) {
  const buffer = loadImageSafe(`data/sofascore/imgJugadores/${playerId}.webp`);
  if (buffer) {
    try {
      doc.image(buffer, x, y, { width: size, height: size });
    } catch {
      drawPlaceholder(doc, x, y, size, String(playerId));
    }
  } else {
    drawPlaceholder(doc, x, y, size, String(playerId));
  }
}
