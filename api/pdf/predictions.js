import { MARGIN, CONTENT_WIDTH, COLORS, drawSectionTitle } from './layout.js';
import { abreviarNombre } from './utils.js';

const COLS = 4;
const ROWS = 2;
const COL_WIDTH = Math.floor((CONTENT_WIDTH - (COLS - 1) * 5) / COLS);
const LINE_HEIGHT = 7;
const MATCHES_PER_ROUND = 18;
const ROUND_HEADER_HEIGHT = 10;
const ROUND_HEIGHT = ROUND_HEADER_HEIGHT + MATCHES_PER_ROUND * LINE_HEIGHT;

export function drawPredictions(doc, matchesByRound, predictions, teamsMap, y) {
  y = drawSectionTitle(doc, 'PRONÓSTICOS DE LIGA', y);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const roundIndex = row * COLS + col;
      if (roundIndex >= 8) break;

      const roundMatches = matchesByRound[roundIndex + 1];
      if (!roundMatches) continue;

      const x = MARGIN + col * (COL_WIDTH + 5);
      const roundY = y + row * (ROUND_HEIGHT + 10);

      doc.save();
      doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.accent);
      doc.text(`Jornada ${roundIndex + 1}`, x, roundY, { width: COL_WIDTH });
      doc.restore();

      for (let i = 0; i < roundMatches.length; i++) {
        const match = roundMatches[i];
        const matchY = roundY + ROUND_HEADER_HEIGHT + i * LINE_HEIGHT;

        const homeName = abreviarNombre(teamsMap[match.equipoLocal.id] || match.equipoLocal.name);
        const awayName = abreviarNombre(teamsMap[match.equipoVisitante.id] || match.equipoVisitante.name);

        const pred = predictions?.[match.id];
        const homeScore = pred ? String(pred.home) : '-';
        const awayScore = pred ? String(pred.away) : '-';

        doc.save();
        doc.fontSize(6).fillColor(COLORS.text);

        const scoreStr = `${homeScore}-${awayScore}`;
        const scoreWidth = 20;
        const nameWidth = Math.floor((COL_WIDTH - scoreWidth) / 2);

        doc.text(homeName, x, matchY, { width: nameWidth, align: 'right' });
        doc.text(scoreStr, x + nameWidth, matchY, { width: scoreWidth, align: 'center' });
        doc.text(awayName, x + nameWidth + scoreWidth, matchY, { width: nameWidth, align: 'left' });

        doc.restore();
      }
    }
  }

  return y + ROWS * (ROUND_HEIGHT + 10) + 5;
}
