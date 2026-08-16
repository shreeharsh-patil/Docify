// Smoke test for the new Stirling-inspired PDF tools
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, decodePDFRawStream } from 'pdf-lib';
import JSZip from 'jszip';
import {
  overlayPdfs,
  addImageToPdf,
  removeAnnotations,
  scalePages,
  bookletImposition,
  inspectPdfDetails,
  deepSanitizePdf,
  replaceColors,
  slugifyFilename,
  setPdfTitle,
  extractJavascriptFromPdf,
  extractImagesToZip,
  applyScannerEffect,
  markdownToPdf,
  certificateSignPdf,
  validateSignaturePdf,
} from './lib/pdfProcessor.ts';

async function makeTestPdf(pageCount = 4, label = 'DOCIFY') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([300, 400]);
    page.drawRectangle({ x: 0, y: 0, width: 300, height: 400, color: rgb(0.95, 0.95, 1) });
    page.drawText(`${label} PAGE ${i + 1}`, { x: 40, y: 200, size: 18, font, color: rgb(0.2, 0.2, 0.2) });
    if (i === 0) {
      // add a form field (will become a widget annotation)
      const form = doc.getForm();
      form.createTextField(`field_${i}`).addToPage(page, { x: 40, y: 100, width: 100, height: 20 });
    }
  }
  return await doc.save();
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('PASS:', msg);
}

async function main() {
  const base = await makeTestPdf(4, 'BASE');
  const ov = await makeTestPdf(4, 'OVERLAY');

  // 1. overlayPdfs
  const overlaid = await overlayPdfs(base.buffer, [ov.buffer], 0.6);
  const ovDoc = await PDFDocument.load(overlaid);
  assert(ovDoc.getPageCount() === 4, `overlay keeps 4 pages (got ${ovDoc.getPageCount()})`);

  // 2. scalePages
  const scaled = await scalePages(base.buffer, 75);
  const scDoc = await PDFDocument.load(scaled);
  const { width, height } = scDoc.getPage(0).getSize();
  assert(Math.abs(width - 225) < 2 && Math.abs(height - 300) < 2, `scale 75% -> 225x300 (got ${width}x${height})`);

  // 3. bookletImposition (4 pages -> 2 sheets, each with 2 page halves)
  const booklet = await bookletImposition(base.buffer);
  const bkDoc = await PDFDocument.load(booklet);
  assert(bkDoc.getPageCount() === 2, `booklet 4 pages -> 2 sheets (got ${bkDoc.getPageCount()})`);
  const bkSize = bkDoc.getPage(0).getSize();
  assert(Math.abs(bkSize.width - 600) < 2, `booklet sheet is 2x wide (got ${bkSize.width})`);

  // odd page count pads to multiple of 4
  const odd = await makeTestPdf(3, 'ODD');
  const bkOdd = await PDFDocument.load(await bookletImposition(odd.buffer));
  assert(bkOdd.getPageCount() === 2, `booklet 3 pages pads to 2 sheets (got ${bkOdd.getPageCount()})`);

  // 4. removeAnnotations (form widget annotations removed)
  const cleaned = await removeAnnotations(base.buffer);
  const clDoc = await PDFDocument.load(cleaned);
  let annotCount = 0;
  for (const p of clDoc.getPages()) {
    annotCount += p.node.Annots() ? p.node.Annots().size() : 0;
  }
  assert(annotCount === 0, `removeAnnotations strips all annots (got ${annotCount})`);

  // 5. addImageToPdf - build a tiny PNG data URL and embed it
  // 1x1 red PNG
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const withImg = await addImageToPdf(base.buffer, `data:image/png;base64,${pngB64}`, {
    pageNumber: 2,
    x: 10,
    y: 10,
    width: 80,
    opacity: 1,
  });
  const imgDoc = await PDFDocument.load(withImg);
  assert(imgDoc.getPageCount() === 4, `addImageToPdf keeps 4 pages (got ${imgDoc.getPageCount()})`);

  // 6. inspectPdfDetails
  const info = await inspectPdfDetails(base.buffer);
  assert(info.pageCount === 4, `inspectPdfDetails page count (got ${info.pageCount})`);
  assert(info.formFieldCount === 1, `inspectPdfDetails form fields (got ${info.formFieldCount})`);

  // 7. deepSanitizePdf
  const sanitized = await deepSanitizePdf(base.buffer);
  const saDoc = await PDFDocument.load(sanitized);
  assert(saDoc.getTitle() === '', `deepSanitizePdf wipes title (got "${saDoc.getTitle()}")`);

  // 8. replaceColors: red -> blue on a red-filled rectangle
  const colorDoc = await PDFDocument.create();
  const colorPage = colorDoc.addPage([200, 200]);
  colorPage.drawRectangle({ x: 10, y: 10, width: 100, height: 100, color: rgb(1, 0, 0) });
  colorPage.drawText('KEEP', { x: 120, y: 150, size: 12 });
  const redPdf = await colorDoc.save();
  const recolored = await replaceColors(redPdf.buffer, '#ff0000', '#0000ff');
  const rcDoc = await PDFDocument.load(recolored);
  const rcStream = rcDoc.getPage(0).node.Contents();
  const rcStr = Buffer.from(decodePDFRawStream(rcStream).decode()).toString('latin1');
  assert(rcStr.includes('0 0 1 rg'), `replaceColors swaps red->blue (got "${rcStr.match(/[\d.]+ [\d.]+ [\d.]+ rg/)?.[0]}")`);
  assert(!rcStr.includes('1 0 0 rg'), 'replaceColors removes the source color');

  // 9. slugifyFilename + setPdfTitle (Auto Rename)
  assert(slugifyFilename('My  Important  DOCUMENT!') === 'my-important-document', `slugify (got "${slugifyFilename('My  Important  DOCUMENT!')}")`);
  const titled = await setPdfTitle(base.buffer, 'Quarterly Report Q3');
  const tiDoc = await PDFDocument.load(titled);
  assert(tiDoc.getTitle() === 'Quarterly Report Q3', `setPdfTitle writes title (got "${tiDoc.getTitle()}")`);

  // 10. extractJavascriptFromPdf: embed an OpenAction JS action
  const jsDoc = await PDFDocument.create();
  jsDoc.addPage([200, 200]);
  const jsAction = jsDoc.context.obj({
    S: PDFName.of('JavaScript'),
    JS: PDFString.of('app.alert("hello from pdf");'),
  });
  jsDoc.catalog.set(PDFName.of('OpenAction'), jsAction);
  const jsPdf = await jsDoc.save();
  const scripts = await extractJavascriptFromPdf(jsPdf.buffer);
  assert(scripts.length === 1 && scripts[0].source.includes('app.alert'), `extractJavascriptFromPdf finds OpenAction JS (got ${JSON.stringify(scripts)})`);

  // 11. extractImagesToZip: PNG + JPEG embedded -> zip contains both
  const embedDoc = await PDFDocument.create();
  const imgPage = embedDoc.addPage([300, 300]);
  const tinyPngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pngImg = await embedDoc.embedPng(`data:image/png;base64,${tinyPngB64}`);
  imgPage.drawImage(pngImg, { x: 10, y: 10, width: 40, height: 40 });
  const tinyJpgB64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
  const jpgImg = await embedDoc.embedJpg(`data:image/jpeg;base64,${tinyJpgB64}`);
  imgPage.drawImage(jpgImg, { x: 60, y: 10, width: 40, height: 40 });
  const imgPdf = await embedDoc.save();
  const zipBlob = await extractImagesToZip(imgPdf.buffer);
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  assert(names.some((n) => n.endsWith('.png')), `extractImages exports a PNG (got ${names.join(', ')})`);
  assert(names.some((n) => n.endsWith('.jpg')), `extractImages exports a JPG (got ${names.join(', ')})`);

  // 12. applyScannerEffect (pure pixel transform)
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 10, 200, 100, 255]);
  applyScannerEffect(pixels, 0, true);
  assert(pixels[0] === pixels[1] && pixels[1] === pixels[2], `grayscale makes pixels neutral (got ${pixels[0]},${pixels[1]},${pixels[2]})`);

  // 13. markdownToPdf: headings, lists, code
  const md = '# Title\n\nSome **bold** and *italic* text.\n\n- item one\n- item two\n\n```js\nconst x = 1;\n```'; 
  const mdBytes = await markdownToPdf(md, { pageSize: 'a4' });
  const mdDoc = await PDFDocument.load(mdBytes);
  assert(mdDoc.getPageCount() >= 1, `markdownToPdf produces a document (got ${mdDoc.getPageCount()} pages)`);
  assert(mdDoc.getPage(0).getSize().width > 400, `markdownToPdf A4 page size (got ${mdDoc.getPage(0).getSize().width})`);

  // 14. certificateSignPdf: self-signed cert -> p12 -> sign -> validate round trip
  const forge = (await import('node-forge')).default;
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000 * 365);
  const attrs = [{ name: 'commonName', value: 'Docify Test Signer' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, 'testpass');
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12Bytes = new Uint8Array(p12Der.length);
  for (let i = 0; i < p12Der.length; i++) p12Bytes[i] = p12Der.charCodeAt(i) & 0xff;

  const signed = await certificateSignPdf(base.buffer, p12Bytes.buffer, 'testpass');
  assert(signed.certName === 'Docify Test Signer', `certificateSignPdf reads cert CN (got "${signed.certName}")`);
  const signedDoc = await PDFDocument.load(signed.bytes);
  assert(signedDoc.getPageCount() === 4, `signed PDF stays valid (got ${signedDoc.getPageCount()} pages)`);
  assert(signed.bytes.length > base.length, `signed PDF grew with signature (${base.length} -> ${signed.bytes.length})`);

  const validated = await validateSignaturePdf(signed.bytes.buffer.slice(0));
  assert(validated.signatures.length === 1, `validateSignaturePdf finds the signature (got ${validated.signatures.length})`);
  const sig = validated.signatures[0];
  assert(sig.valid === true, `validateSignaturePdf cryptographically verifies (valid=${sig.valid})`);
  assert(sig.certSubject.includes('Docify Test Signer'), `validateSignaturePdf reads cert subject (got "${sig.certSubject}")`);

  const noSig = await validateSignaturePdf(base.buffer);
  assert(noSig.error && noSig.signatures.length === 0, 'validateSignaturePdf reports missing signature');

  // 15. qpdf-wasm: lossless merge + split + repair
  const qpdf = await import('./lib/pdf-qpdf.ts');
  const merged = await qpdf.mergePdfsLossless([base.buffer, base.buffer]);
  const mergedDoc = await PDFDocument.load(merged);
  assert(mergedDoc.getPageCount() === 8, `qpdf merge produces 8 pages (got ${mergedDoc.getPageCount()})`);
  const split = await qpdf.splitPdfLossless(merged, 2, 3);
  const splitDoc = await PDFDocument.load(split);
  assert(splitDoc.getPageCount() === 2, `qpdf split extracts range (got ${splitDoc.getPageCount()} pages)`);
  const repaired = await qpdf.repairPdfLossless(base.buffer);
  const repairedDoc = await PDFDocument.load(repaired);
  assert(repairedDoc.getPageCount() === 4, `qpdf repair keeps pages (got ${repairedDoc.getPageCount()})`);

  // 16. 8-pass compressor: shrinks a bloated PDF and stays valid
  const { compressPdfAdvanced } = await import('./lib/pdf-compress.ts');
  const bloated = await (async () => {
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.Helvetica);
    for (let p = 0; p < 5; p++) {
      const page = d.addPage([600, 800]);
      for (let i = 0; i < 40; i++) {
        page.drawText(`Line ${p}-${i} — some text that repeats a lot `, {
          x: 50 + (i % 4) * 20, y: 750 - i * 18, size: 12, font: f,
        });
      }
    }
    return d.save({ useObjectStreams: false });
  })();
  const { bytes: compBytes, report } = await compressPdfAdvanced(bloated.buffer, {
    level: 9, stripMetadata: true, unembedStandardFonts: true,
  });
  const compDoc = await PDFDocument.load(compBytes);
  assert(compDoc.getPageCount() === 5, `compressor keeps all pages (got ${compDoc.getPageCount()})`);
  assert(compBytes.length < bloated.length, `8-pass compressor shrinks file (${bloated.length} -> ${compBytes.length})`);
  assert(Array.isArray(report.metadataStripped) && report.metadataStripped.length > 0, 'compressor strips metadata');

  // 17. harfbuzz font subsetting: shrinks an embedded TrueType font
  const { subsetPdfFonts } = await import('./lib/pdf-font-subset.ts');
  const fontPath = process.env.WINDIR + '/Fonts/arial.ttf';
  const { readFileSync } = await import('fs');
  const fontkit = (await import('fontkit')).default;
  const fontDoc = await PDFDocument.create();
  fontDoc.registerFontkit(fontkit);
  const arial = await fontDoc.embedFont(readFileSync(fontPath));
  const fpage = fontDoc.addPage([400, 400]);
  fpage.drawText('Hello Docify 123', { x: 50, y: 350, size: 14, font: arial });
  const fontOrig = await fontDoc.save();
  const subsetRes = await subsetPdfFonts(fontOrig.buffer);
  const subDoc = await PDFDocument.load(subsetRes.bytes);
  assert(subDoc.getPageCount() === 1, `subset keeps pages (got ${subDoc.getPageCount()})`);
  assert(subsetRes.subsetted >= 1, `font subsetted (got ${subsetRes.subsetted} fonts)`);
  assert(subsetRes.bytes.length < fontOrig.length, `subset shrinks file (${fontOrig.length} -> ${subsetRes.bytes.length})`);

  console.log('\nAll new-tool tests passed ✅');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
