import { MARGIN, CONTENT_WIDTH, COLORS, drawSectionTitle } from './layout.js';
import { drawTeamCrest, abreviarNombre } from './utils.js';

const ROUNDS = [
  { key: 'roundOf32', label: '16avos', max: 8 },
  { key: 'roundOf16', label: 'Octavos', max: 8 },
  { key: 'quarterFinalists', label: 'Cuartos', max: 4 },
  { key: 'semiFinalists', label: 'Semis', max: 2 },
  { key: 'runnerUp', label: 'Final', max: 1 },
  { key: 'champion', label: 'Campeón', max: 1 },
];

const CREST_SIZE = 14;
const LINE_HEIGHT = 16;
const COL_GAP = 10;

export function drawBracket(doc, finalPredictions, teamsMap, y) {
  y = drawSectionTitle(doc, 'ELIMINATORIAS', y);

  const colWidth = Math.floor((CONTENT_WIDTH - (ROUNDS.length - 1) * COL_GAP) / ROUNDS.length);

  const roundHeights = ROUNDS.map(r => r.max * LINE_HEIGHT);
  const maxRoundHeight = Math.max(...roundHeights);

  for (let r = 0; r < ROUNDS.length; r++) {
    const round = ROUNDS[r];
    const x = MARGIN + r * (colWidth + COL_GAP);

    doc.save();
    doc.fontSize(6).font('Helvetica-Bold').fillColor(COLORS.accent);
    doc.text(round.label, x, y, { width: colWidth, align: 'center' });
    doc.restore();

    let teams;
    if (round.key === 'champion' || round.key === 'runnerUp') {
      teams = finalPredictions?.[round.key] ? [finalPredictions[round.key]] : [];
    } else {
      teams = finalPredictions?.[round.key] || [];
    }

    const roundHeight = teams.length * LINE_HEIGHT;
    const offsetY = (maxRoundHeight - roundHeight) / 2;

    for (let t = 0; t < round.max; t++) {
      const teamY = y + 10 + offsetY + t * LINE_HEIGHT;
      const teamId = teams[t];

      if (teamId) {
        drawTeamCrest(doc, teamId, x + 2, teamY, CREST_SIZE);
        const teamName = abreviarNombre(teamsMap[teamId] || String(teamId));
        doc.save();
        doc.fontSize(6).fillColor(COLORS.text);
        doc.text(teamName, x + CREST_SIZE + 4, teamY + 3, { width: colWidth - CREST_SIZE - 6 });
        doc.restore();
      } else {
        doc.save();
        doc.fontSize(6).fillColor(COLORS.lightText);
        doc.text('---', x + 2, teamY + 3, { width: colWidth - 4, align: 'center' });
        doc.restore();
      }
    }

    if (r < ROUNDS.length - 1) {
      const nextRound = ROUNDS[r + 1];
      const nextX = MARGIN + (r + 1) * (colWidth + COL_GAP);
      const nextTeams = nextRound.key === 'champion' || nextRound.key === 'runnerUp'
        ? (finalPredictions?.[nextRound.key] ? [finalPredictions[nextRound.key]] : [])
        : (finalPredictions?.[nextRound.key] || []);
      const nextRoundHeight = nextTeams.length * LINE_HEIGHT;
      const nextOffsetY = (maxRoundHeight - nextRoundHeight) / 2;

      for (let t = 0; t < teams.length; t++) {
        const fromY = y + 10 + offsetY + t * LINE_HEIGHT + CREST_SIZE / 2;
        const toIndex = Math.floor(t / (teams.length / Math.max(nextTeams.length, 1)));
        const toY = y + 10 + nextOffsetY + Math.min(toIndex, nextTeams.length - 1) * LINE_HEIGHT + CREST_SIZE / 2;

        doc.save();
        doc.moveTo(x + colWidth, fromY).lineTo(nextX, toY).strokeColor(COLORS.separator).lineWidth(0.3).stroke();
        doc.restore();
      }
    }
  }

  return y + 10 + maxRoundHeight + 5;
}
