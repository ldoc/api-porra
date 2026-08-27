import { emojiToImage } from './utils.js';

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
export const CONTENT_HEIGHT = PAGE_HEIGHT - 2 * MARGIN;

export const COLORS = {
  title: '#1a1a2e',
  subtitle: '#16213e',
  text: '#333333',
  lightText: '#666666',
  accent: '#0f3460',
  separator: '#cccccc',
  placeholder: '#e0e0e0',
};

export function drawSectionTitle(doc, title, y) {
  doc.save();
  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.accent);
  doc.text(title, MARGIN, y, { width: CONTENT_WIDTH });
  doc.restore();
  doc.moveTo(MARGIN, y + 12).lineTo(MARGIN + CONTENT_WIDTH, y + 12).strokeColor(COLORS.separator).lineWidth(0.5).stroke();
  return y + 18;
}

export async function drawPlayerHeader(doc, user, y) {
  doc.save();
  if (user.avatar) {
    try {
      const emojiBuf = await emojiToImage(user.avatar, 16);
      doc.image(emojiBuf, MARGIN, y, { width: 16, height: 16 });
    } catch {}
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.title);
    doc.text(user.username, MARGIN + 22, y + 2);
  } else {
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.title);
    doc.text(user.username, MARGIN, y);
  }
  doc.restore();
  doc.moveTo(MARGIN, y + 16).lineTo(MARGIN + CONTENT_WIDTH, y + 16).strokeColor(COLORS.separator).lineWidth(0.5).stroke();
  return y + 22;
}
