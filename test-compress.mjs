import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfLib = require('pdf-lib');
const { PDFDocument, StandardFonts, PDFName, PDFRef } = pdfLib;

// Build a PDF with: uncompressed content streams, embedded copies of a
// standard font (Helvetica), XMP metadata, and duplicated image objects.
async function makeBloatedPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 5; p++) {
    const page = doc.addPage([600, 800]);
    for (let i = 0; i < 40; i++) {
      page.drawText(`Line ${p}-${i} — some text that repeats a lot `, {
        x: 50 + (i % 4) * 20,
        y: 750 - i * 18,
        size: 12,
        font,
      });
    }
  }
  // Add XMP metadata + custom info entries (bloat to strip)
  const ctx = doc.context;
  const xmp = ctx.stream(
    new TextEncoder().encode(
      '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:custom="http://example.com/"><custom:junk>abcdefghijklmnopqrstuvwxyz</custom:junk></rdf:Description></rdf:RDF></x:xmpmeta>'
    ),
    { Type: 'Metadata', Subtype: 'XML' }
  );
  const xmpRef = ctx.register(xmp);
  doc.catalog.set(PDFName.of('Metadata'), xmpRef);
  return doc.save({ useObjectStreams: false });
}

const bloated = await makeBloatedPdf();
console.log('bloated size:', bloated.length);

const { compressPdfAdvanced } = await import('./lib/pdf-compress.ts');
const { bytes, report } = await compressPdfAdvanced(bloated.buffer, {
  level: 9,
  stripMetadata: true,
  unembedStandardFonts: true,
});
console.log('compressed size:', bytes.length);
console.log('report:', JSON.stringify(report, null, 1));

// Verify output still opens and renders pages correctly
const out = await PDFDocument.load(bytes);
console.log('output pages:', out.getPageCount());
const txt = out.getPage(0);
console.log('page 1 exists:', !!txt);

// Naive comparison
const naive = await (async () => {
  const d = await PDFDocument.load(bloated.buffer);
  return d.save({ useObjectStreams: true });
})();
console.log('naive re-save size:', naive.length);

const ratio = bytes.length / bloated.length;
console.log(`\ncompression ratio: ${(ratio * 100).toFixed(1)}% of original`);
console.log(bytes.length < naive.length ? '8-pass beats naive ✅' : 'naive wins ❌');
