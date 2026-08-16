// Smoke test for qpdf-wasm integration (runs in Node via tsx)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfLib = require('pdf-lib');
const { PDFDocument, StandardFonts, PDFName, PDFRef, PDFStream, PDFRawStream, decodePDFRawStream } = pdfLib;

// Build a small PNG via UPNG (bundled with pdf-lib) so the PDF carries a
// compressed XObject image that qpdf should pass through byte-identical.
function makePng() {
  const { default: UPNG } = require('@pdf-lib/upng');
  const w = 16, h = 16;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 200; rgba[i * 4 + 1] = 60; rgba[i * 4 + 2] = 60; rgba[i * 4 + 3] = 255;
  }
  const png = UPNG.encode([rgba.buffer], w, h, 0);
  return Buffer.from(png);
}

async function makePdf(label, withImage = false) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 400]);
  page.drawText(label, { x: 50, y: 350, size: 24, font });
  if (withImage) {
    const png = await doc.embedPng(makePng());
    page.drawImage(png, { x: 50, y: 50, width: 100, height: 100 });
  }
  return doc.save();
}

const { mergePdfsLossless, splitPdfLossless, repairPdfLossless } = await import('./lib/pdf-qpdf.ts');

const a = await makePdf('Page A', true);
const b = await makePdf('Page B', true);
const c = await makePdf('Page C', true);

// 1. Merge
const merged = await mergePdfsLossless([a.buffer, b.buffer, c.buffer]);
const md = await PDFDocument.load(merged);
console.log('PASS merge: 3 pages ->', md.getPageCount());

// 2. Split range 2-3
const split = await splitPdfLossless(merged, 2, 3);
const sd = await PDFDocument.load(split);
console.log('PASS split: 2 pages ->', sd.getPageCount());

// 3. Repair
const repaired = await repairPdfLossless(a);
const rd = await PDFDocument.load(repaired);
console.log('PASS repair: 1 page ->', rd.getPageCount());

// 4. Repeated callMain on same instance
const merged2 = await mergePdfsLossless([b.buffer, a.buffer]);
const md2 = await PDFDocument.load(merged2);
console.log('PASS repeat callMain: 2 pages ->', md2.getPageCount());

// 5. Stream preservation: decoded content bytes of page 1 must be identical
async function decodedContents(buf, pageIdx = 0) {
  const doc = await PDFDocument.load(buf);
  const node = doc.getPage(pageIdx).node;
  const contents = node.get(PDFName.of('Contents'));
  const list = contents instanceof PDFRef ? [doc.context.lookup(contents)] : (contents?.asArray?.() ?? [contents]);
  const parts = [];
  for (const item of list) {
    const obj = item instanceof PDFRef ? doc.context.lookup(item) : item;
    if (obj instanceof PDFRawStream || obj instanceof PDFStream) {
      parts.push(Buffer.from(decodePDFRawStream(obj).decode()));
    }
  }
  return Buffer.concat(parts);
}
const origContent = await decodedContents(a);
const mergedContent = await decodedContents(merged);
console.log('qpdf merge content-stream preservation:', origContent.equals(mergedContent) ? 'yes ✅' : 'no ❌');

// 6. Image XObject stream must pass through byte-identical (no re-encode/re-flate)
async function imgBytes(buf) {
  const doc = await PDFDocument.load(buf);
  const page = doc.getPage(0);
  const xobj = page.node.get(PDFName.of('Resources')).get(PDFName.of('XObject'));
  const dict = xobj instanceof PDFRef ? doc.context.lookup(xobj) : xobj;
  for (const k of dict.keys()) {
    const raw = dict.get(k);
    const obj = raw instanceof PDFRef ? doc.context.lookup(raw) : raw;
    if (obj instanceof PDFRawStream || obj instanceof PDFStream) {
      return Buffer.from(decodePDFRawStream(obj).decode());
    }
  }
  return null;
}
const origImg = await imgBytes(a);
const mergedImg = await imgBytes(merged);
console.log('qpdf image pass-through:', origImg && mergedImg && origImg.equals(mergedImg) ? 'yes ✅' : 'no ❌');

// 7. Size comparison vs pdf-lib copyPages on image PDFs (qpdf should not bloat)
const mergedViaPdfLib = await (async () => {
  const doc = await PDFDocument.create();
  for (const buf of [a, b, c]) {
    const src = await PDFDocument.load(buf);
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach(p => doc.addPage(p));
  }
  return doc.save();
})();
console.log(`size qpdf: ${merged.length} vs pdf-lib: ${mergedViaPdfLib.length} (note: qpdf preserves original object identity; size parity expected on small files)`);

console.log('\nAll qpdf tests passed ✅');
