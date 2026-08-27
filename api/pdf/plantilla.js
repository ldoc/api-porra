import { MARGIN, CONTENT_WIDTH, COLORS, drawSectionTitle } from './layout.js';
import { drawPlayerPhoto, abreviarNombre } from './utils.js';

const POSITIONS = [
  { key: 'G', label: 'Porteros', max: 3, width: 120 },
  { key: 'D', label: 'Defensas', max: 8, width: 140 },
  { key: 'M', label: 'Medios', max: 8, width: 140 },
  { key: 'F', label: 'Delanteros', max: 6, width: 120 },
];

const PHOTO_SIZE = 12;
const LINE_HEIGHT = 14;
const COL_GAP = 5;

export function drawPlantilla(doc, squad, y) {
  y = drawSectionTitle(doc, 'PLANTILLA IDEAL', y);

  const totalWidth = POSITIONS.reduce((sum, p) => sum + p.width, 0) + (POSITIONS.length - 1) * COL_GAP;
  const startX = MARGIN + (CONTENT_WIDTH - totalWidth) / 2;

  let colX = startX;

  for (const pos of POSITIONS) {
    const players = (squad || []).filter(p => p.posicion === pos.key);

    doc.save();
    doc.fontSize(6).font('Helvetica-Bold').fillColor(COLORS.accent);
    doc.text(pos.label, colX, y, { width: pos.width, align: 'center' });
    doc.restore();

    for (let i = 0; i < pos.max; i++) {
      const playerY = y + 10 + i * LINE_HEIGHT;
      const player = players[i];

      if (player) {
        drawPlayerPhoto(doc, player.id, colX + 2, playerY + 1, PHOTO_SIZE);
        doc.save();
        doc.fontSize(6).fillColor(COLORS.text);
        const name = abreviarNombre(player.nombre);
        doc.text(name, colX + PHOTO_SIZE + 4, playerY + 2, { width: pos.width - PHOTO_SIZE - 6 });
        doc.restore();
      } else {
        doc.save();
        doc.fontSize(6).fillColor(COLORS.lightText);
        doc.text('---', colX + 2, playerY + 2, { width: pos.width - 4, align: 'center' });
        doc.restore();
      }
    }

    colX += pos.width + COL_GAP;
  }

  const maxPlayers = Math.max(...POSITIONS.map(p => p.max));
  return y + 10 + maxPlayers * LINE_HEIGHT + 5;
}
