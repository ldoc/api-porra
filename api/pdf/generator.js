import PDFDocument from 'pdfkit';
import { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, drawPlayerHeader } from './layout.js';
import { generateCover } from './cover.js';
import { drawPredictions } from './predictions.js';
import { drawBracket } from './bracket.js';
import { drawPlantilla } from './plantilla.js';

export async function generatePDF(users, matchesByRound, teamsMap) {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: false,
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.addPage();
    generateCover(doc, users.length);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`Generando página ${i + 1}/${users.length}: ${user.username}`);

      doc.addPage();
      let y = MARGIN;

      y = await drawPlayerHeader(doc, user, y);
      y = drawPredictions(doc, matchesByRound, user.predictions || {}, teamsMap, y);
      y = await drawBracket(doc, user.finalPredictions, teamsMap, y);
      y = await drawPlantilla(doc, user.squad, y);
    }

    doc.end();
  });
}
