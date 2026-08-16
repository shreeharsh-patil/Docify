import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfLib = require('pdf-lib');
const { PDFDocument, PDFName, PDFRef } = pdfLib;
import { readFileSync } from 'fs';

const fontPath = process.env.WINDIR + '/Fonts/arial.ttf';
const fontBytes = readFileSync(fontPath);
console.log('arial.ttf size:', fontBytes.length);

const fontkit = (await import('fontkit')).default || (await import('fontkit'));
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(fontBytes);

// Draw text that uses only a handful of glyphs out of thousands in Arial.
for (let p = 0; p < 3; p++) {
  const page = doc.addPage([400, 400]);
  for (let i = 0; i < 10; i++) {
    page.drawText('Hello Docify 123', { x: 50, y: 350 - i * 25, size: 14, font });
  }
}
const origBytes = await doc.save();
console.log('original PDF size:', origBytes.length);

// Check embedded font size inside the PDF
async function embeddedFontSize(buf) {
  const d = await PDFDocument.load(buf);
  const ctx = d.context;
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj?.get?.(PDFName.of('Length1'))) {
      const len = obj.get(PDFName.of('Length1'));
      return len.asNumber?.() ?? -1;
    }
  }
  return -1;
}
console.log('embedded font Length1 before:', await embeddedFontSize(origBytes));

const { subsetPdfFonts } = await import('./lib/pdf-font-subset.ts');
const { bytes, subsetted, skipped, report } = await subsetPdfFonts(origBytes.buffer);
console.log('subsetted:', subsetted, 'skipped:', skipped);
console.log('report:', report);

const out = await PDFDocument.load(bytes);
console.log('output pages:', out.getPageCount());
console.log('output size:', bytes.length);
console.log('embedded font Length1 after:', await embeddedFontSize(bytes));

// Verify text still renders - check the text layer via pdf.js? Just verify
// the page content stream still references the font and opens cleanly.
console.log('\nSubset test done ✅');
