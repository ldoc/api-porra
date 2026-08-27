import { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, COLORS } from './layout.js';

export function generateCover(doc, totalPlayers) {
  const centerX = PAGE_WIDTH / 2;
  const now = new Date();
  const fechaStr = now.toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  doc.fontSize(28).font('Helvetica-Bold').fillColor(COLORS.title);
  doc.text('PRONÓSTICOS DE LA PORRA', MARGIN, 200, { width: PAGE_WIDTH - 2 * MARGIN, align: 'center' });

  doc.fontSize(18).font('Helvetica').fillColor(COLORS.subtitle);
  doc.text('Champions League 2025-26', MARGIN, 240, { width: PAGE_WIDTH - 2 * MARGIN, align: 'center' });

  doc.fontSize(11).fillColor(COLORS.lightText);
  doc.text(`Generado: ${fechaStr}`, MARGIN, 300, { width: PAGE_WIDTH - 2 * MARGIN, align: 'center' });
  doc.text(`Total jugadores: ${totalPlayers}`, MARGIN, 318, { width: PAGE_WIDTH - 2 * MARGIN, align: 'center' });

  const disclaimerY = 380;
  const disclaimerWidth = 400;
  const disclaimerX = (PAGE_WIDTH - disclaimerWidth) / 2;

  doc.save();
  doc.rect(disclaimerX - 10, disclaimerY - 10, disclaimerWidth + 20, 120).fill('#fff3cd');
  doc.restore();

  doc.save();
  doc.rect(disclaimerX - 10, disclaimerY - 10, disclaimerWidth + 20, 120).lineWidth(1).strokeColor('#ffc107').stroke();
  doc.restore();

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#856404');
  doc.text('AVISO IMPORTANTE', disclaimerX, disclaimerY, { width: disclaimerWidth, align: 'center' });

  doc.fontSize(9).font('Helvetica').fillColor('#856404');
  doc.text(
    'Revisa tus pronósticos en este PDF. Los datos introducidos deberían coincidir en la web y en el PDF, pero cualquier reclamación se resolverá a partir de este documento (esto es lo que realmente vale).',
    disclaimerX, disclaimerY + 18,
    { width: disclaimerWidth, align: 'justify' }
  );
}
