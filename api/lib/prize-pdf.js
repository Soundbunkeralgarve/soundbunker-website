import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const templates = {
  'prize-recording-1h': new URL('../_prize_templates/SoundBunker_Prize_RecordingSession.pdf', import.meta.url),
  'prize-photo-30m': new URL('../_prize_templates/SoundBunker_Prize_PhotoShoot.pdf', import.meta.url)
};

export async function prizeVoucherPdf(prize) {
  if (!/^SB-PRIZE-[A-F0-9]{16,24}$/.test(prize.code || '')) throw new Error('Prize code is invalid');
  const template = templates[prize.service_id];
  if (!template) throw new Error('This prize does not have a matching voucher PDF');
  const document = await PDFDocument.load(await readFile(template));
  if (document.getPageCount() !== 2) throw new Error('Prize voucher template has changed');
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  // The supplied A4 PDF has a blank code line on page one. Keep both original
  // pages intact, including their existing QR codes and the location page.
  const size = bold.widthOfTextAtSize(prize.code, 17) <= 334 ? 17 : 13;
  document.getPage(0).drawText(prize.code, {
    x: 177, y: 191, size, font: bold,
    color: prize.service_id === 'prize-recording-1h'
      ? rgb(0.08, 0.13, 0.29) : rgb(0.22, 0.17, 0.05)
  });
  document.setTitle(`SoundBunker prize voucher - ${prize.code}`);
  return Buffer.from(await document.save());
}
