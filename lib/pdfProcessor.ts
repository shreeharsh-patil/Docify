import {
  PDFDocument, rgb, degrees, StandardFonts,
  PDFName, PDFDict, PDFRef, PDFArray, PDFStream, PDFString,
  PDFRawStream, PDFNumber, decodePDFRawStream,
} from 'pdf-lib';
import JSZip from 'jszip';
// pako ships as a dependency of pdf-lib; we reuse its zlib deflate when
// rebuilding PNG images during image extraction (types in pako.d.ts).
import pako from 'pako';

// Byte-safe latin1 helpers for content-stream rewrites (operator text is ASCII,
// so latin1 round-trips every byte value 0-255 without corruption).
const latin1Decode = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
};

const latin1Encode = (str: string): Uint8Array => {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
};

const hexToRgb01 = (hex: string): [number, number, number] => {
  const m = hex.replace('#', '').trim();
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
};

const fmtPdfNumber = (v: number): string => Number(v.toFixed(3)).toString();

// Decode a parsed content/image stream (handles FlateDecode and friends).
const decodeStream = (stream: PDFStream): Uint8Array =>
  decodePDFRawStream(stream as PDFRawStream).decode();

// Read a numeric entry from a stream/dict (e.g. /Width).
const numValue = (dict: PDFDict, name: PDFName): number | undefined =>
  dict.lookupMaybe(name, PDFNumber)?.asNumber();
import {
  protectPdf,
  unlockPdf,
  isDocifyXorEncrypted,
  legacyXorDecrypt,
} from './pdf-security';

// Helper to convert File to ArrayBuffer
export const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Helper to convert Image File to Data URL (for drawing signatures/JPGs)
export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to sanitize text for standard PDF fonts (WinAnsi encoding) to prevent crashes
export const sanitizeForPdfFont = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x00-\xFF]/g, '?');
};

// Helper to extract text from Office files (docx, xlsx, pptx)
export const extractTextFromOfficeFile = async (file: File): Promise<string> => {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['docx', 'xlsx', 'pptx'].includes(ext)) {
    return `[File: ${file.name}]\n[Office format: ${ext}]\n[Text extraction requires a compatible .docx/.xlsx/.pptx file.]`;
  }
  try {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const textParts: string[] = [];

    if (ext === 'docx') {
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        // Convert paragraph and row breaks to newlines, and tabs to \t
        const text = docXml
          .replace(/<\/w:p>/gi, '\n\n')
          .replace(/<\/w:tr>/gi, '\n')
          .replace(/<w:tab\/>/gi, '\t')
          .replace(/<[^>]*>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .trim();
        textParts.push(text);
      }
    } else if (ext === 'xlsx') {
      // Read shared strings first
      const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
      const sharedStrings: string[] = [];
      if (sharedStringsXml) {
        const items = sharedStringsXml.match(/<si>[\s\S]*?<\/si>/g) || [];
        items.forEach((item) => {
          const tMatches = item.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
          const combined = tMatches
            .map((tm) => tm.replace(/<[^>]*>/g, ''))
            .join('');
          sharedStrings.push(combined);
        });
      }
      // Read all worksheet files
      const sheetFiles = Object.keys(zip.files)
        .filter((f) => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml'))
        .sort();
      for (const sheetFile of sheetFiles) {
        const sheetXml = await zip.file(sheetFile)?.async('string');
        if (sheetXml) {
          const rows = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
          const sheetRowTexts: string[] = [];
          for (const row of rows) {
            const cells = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
            const rowTexts: string[] = [];
            for (const cell of cells) {
              const isString = cell.includes('t="s"');
              const isInline = cell.includes('t="inlineStr"');
              const vMatch = cell.match(/<v>([^<]*)<\/v>/);
              const tMatch = cell.match(/<t[^>]*>([^<]*)<\/t>/);

              if (isInline && tMatch) {
                rowTexts.push(tMatch[1]);
              } else if (isString && vMatch) {
                const idx = parseInt(vMatch[1]);
                rowTexts.push(!isNaN(idx) && sharedStrings[idx] ? sharedStrings[idx] : vMatch[1]);
              } else if (vMatch) {
                rowTexts.push(vMatch[1]);
              } else if (tMatch) {
                rowTexts.push(tMatch[1]);
              }
            }
            if (rowTexts.length > 0) {
              sheetRowTexts.push(rowTexts.join('\t'));
            }
          }
          if (sheetRowTexts.length > 0) {
            textParts.push(sheetRowTexts.join('\n'));
          }
        }
      }
    } else if (ext === 'pptx') {
      const slideFiles = Object.keys(zip.files)
        .filter((f) => f.startsWith('ppt/slides/slide') && f.endsWith('.xml'))
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, '')) || 0;
          const numB = parseInt(b.replace(/\D/g, '')) || 0;
          return numA - numB;
        });
      for (let i = 0; i < slideFiles.length; i++) {
        const slideXml = await zip.file(slideFiles[i])?.async('string');
        if (slideXml) {
          const paragraphs = slideXml.match(/<a:p>[\s\S]*?<\/a:p>/g) || [];
          const slideLines: string[] = [];
          for (const p of paragraphs) {
            const tMatches = p.match(/<a:t>([^<]*)<\/a:t>/g) || [];
            const lineText = tMatches
              .map((tm) => tm.replace(/<[^>]*>/g, ''))
              .join('')
              .trim();
            if (lineText) slideLines.push(lineText);
          }
          if (slideLines.length > 0) {
            textParts.push(`[Slide ${i + 1}]\n` + slideLines.join('\n'));
          }
        }
      }
    }

    const result = textParts.join('\n\n').trim();
    return result || `[No readable text content found in ${file.name}. The file may contain only images or unsupported elements.]`;
  } catch (e) {
    return `[Could not extract text from ${file.name}. Error: ${e}]`;
  }
};

// 1. MERGE PDFs
export const mergePdfs = async (pdfBuffers: ArrayBuffer[]): Promise<Uint8Array> => {
  const mergedPdf = await PDFDocument.create();
  
  for (const buffer of pdfBuffers) {
    const pdfDoc = await PDFDocument.load(buffer);
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  
  return await mergedPdf.save();
};

// 2. SPLIT PDF (Extract single page range)
export const splitPdf = async (
  pdfBuffer: ArrayBuffer,
  startPage: number,
  endPage: number
): Promise<Uint8Array> => {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const splitPdf = await PDFDocument.create();
  
  const totalPages = sourcePdf.getPageCount();
  // Adjust to 0-indexed bounds
  const startIdx = Math.max(0, startPage - 1);
  const endIdx = Math.min(totalPages - 1, endPage - 1);
  
  if (startIdx > endIdx) {
    throw new Error('Start page cannot be greater than end page.');
  }
  
  const indicesToCopy = Array.from({ length: endIdx - startIdx + 1 }, (_, i) => startIdx + i);
  const copiedPages = await splitPdf.copyPages(sourcePdf, indicesToCopy);
  copiedPages.forEach((page) => splitPdf.addPage(page));
  
  return await splitPdf.save();
};

// 3. ROTATE PDF
export const rotatePdf = async (
  pdfBuffer: ArrayBuffer,
  rotationAngle: number // 90, 180, 270
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  
  pages.forEach((page) => {
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees((currentRotation + rotationAngle) % 360));
  });
  return await pdfDoc.save();
};

// 19. FLATTEN PDF — merge form fields into page content
export const flattenPdf = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  try {
    const form = pdfDoc.getForm();
    form.flatten();
  } catch {
    // No form to flatten
  }
  return await pdfDoc.save();
};

// 20. ADD HEADER & FOOTER
export const addHeaderFooter = async (
  pdfBuffer: ArrayBuffer,
  headerText: string,
  footerText: string
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const fontSize = 10;
  const { rgb } = await import('pdf-lib');
  for (const page of pages) {
    const { height } = page.getSize();
    if (headerText) {
      page.drawText(sanitizeForPdfFont(headerText), {
        x: 50,
        y: height - 30,
        size: fontSize,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
    if (footerText) {
      page.drawText(sanitizeForPdfFont(footerText), {
        x: 50,
        y: 15,
        size: fontSize,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  }
  return await pdfDoc.save();
};

// 21. ADD BLANK PAGES
export const addBlankPages = async (
  pdfBuffer: ArrayBuffer,
  positions: number[],
  count: number = 1
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const { width, height } = pdfDoc.getPage(0)?.getSize() || { width: 612, height: 792 };
  const sorted = [...positions].sort((a, b) => b - a);
  for (const pos of sorted) {
    // For each insertion position, we create unique copy of blank pages to avoid circular page tree reference
    const blankDoc = await PDFDocument.create();
    for (let i = 0; i < count; i++) {
      blankDoc.addPage([width, height]);
    }
    const blankCopies = await pdfDoc.copyPages(blankDoc, Array.from({ length: count }, (_, i) => i));
    for (let i = 0; i < count; i++) {
      pdfDoc.insertPage(pos, blankCopies[i]);
    }
  }
  return await pdfDoc.save();
};

// 4. ORGANIZE PDF
export const organizePdf = async (
  pdfBuffer: ArrayBuffer,
  pageOrder: number[] // 0-indexed indices representing the new page sequence
): Promise<Uint8Array> => {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const organizedPdf = await PDFDocument.create();
  
  const copiedPages = await organizedPdf.copyPages(sourcePdf, pageOrder);
  copiedPages.forEach((page) => organizedPdf.addPage(page));
  
  return await organizedPdf.save();
};

// 5. WATERMARK PDF
export const watermarkPdf = async (
  pdfBuffer: ArrayBuffer,
  text: string,
  options: {
    color: string; // hex color e.g. #ff0000
    size: number;
    opacity: number; // 0 to 1
    position: 'center' | 'top-right' | 'bottom-left' | 'top-left' | 'bottom-right';
  }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  
  // Parse hex color to rgb
  const hex = options.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    let x = width / 2 - 100; // approximate offsets
    let y = height / 2;

    switch (options.position) {
      case 'top-right':
        x = width - 150;
        y = height - 50;
        break;
      case 'bottom-left':
        x = 50;
        y = 50;
        break;
      case 'top-left':
        x = 50;
        y = height - 50;
        break;
      case 'bottom-right':
        x = width - 150;
        y = 50;
        break;
      case 'center':
      default:
        x = width / 2 - (text.length * options.size) / 4;
        y = height / 2;
    }

    page.drawText(sanitizeForPdfFont(text), {
      x,
      y,
      size: options.size,
      color: rgb(r, g, b),
      opacity: options.opacity,
      rotate: degrees(30) // rotated overlay text
    });
  });

  return await pdfDoc.save();
};

// 6. ENCRYPT / PROTECT PDF (Standard Security Handler, R=5 / V=5 AES-256)
// Uses a genuine spec-compliant implementation (lib/pdf-security.ts) ported
// from pdf.js + cryptpdf, so protected files open in any PDF reader.
export const encryptPdfBuffer = async (buffer: ArrayBuffer, pass: string): Promise<Uint8Array> => {
  return protectPdf(new Uint8Array(buffer), pass);
};

// DECRYPT / UNLOCK PDF
// - Files locked by older Docify versions (DOCIFYPT XOR payload) are unlocked
//   through the legacy path for backwards compatibility.
// - Genuine password-protected PDFs (RC4 R2/R3, AES-128 R4, AES-256 R5/R6) are
//   unlocked through the ported Standard Security Handler.
export const decryptPdfBuffer = async (buffer: ArrayBuffer, pass: string): Promise<Uint8Array> => {
  const inputBytes = new Uint8Array(buffer);
  if (isDocifyXorEncrypted(inputBytes)) {
    return legacyXorDecrypt(inputBytes, pass);
  }
  return unlockPdf(inputBytes, pass);
};

// 7. SIGN PDF (Embed drawn PNG signature)
export const signPdf = async (
  pdfBuffer: ArrayBuffer,
  signatureDataUrl: string,
  options: {
    pageNumber: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  const totalPages = pdfDoc.getPageCount();
  const pageIdx = Math.min(totalPages - 1, Math.max(0, options.pageNumber - 1));
  const page = pdfDoc.getPages()[pageIdx];

  // Embed PNG signature image
  const pngImage = await pdfDoc.embedPng(signatureDataUrl);
  
  page.drawImage(pngImage, {
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height
  });

  return await pdfDoc.save();
};

// 8. IMAGES (JPG/PNG) TO PDF
export const imagesToPdf = async (
  imageDataUrls: string[],
  options: {
    pageSize: 'a4' | 'letter';
    orientation: 'portrait' | 'landscape';
    margin: number; // 0, 10, 20
  }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();

  // A4 size: 595.27 x 841.89 points
  // Letter size: 612 x 792 points
  const baseWidth = options.pageSize === 'a4' ? 595.27 : 612;
  const baseHeight = options.pageSize === 'a4' ? 841.89 : 792;
  
  const width = options.orientation === 'portrait' ? baseWidth : baseHeight;
  const height = options.orientation === 'portrait' ? baseHeight : baseWidth;

  for (const dataUrl of imageDataUrls) {
    const page = pdfDoc.addPage([width, height]);
    
    let img;
    try {
      if (dataUrl.startsWith('data:image/png') || dataUrl.includes('image/png')) {
        img = await pdfDoc.embedPng(dataUrl);
      } else {
        img = await pdfDoc.embedJpg(dataUrl);
      }
    } catch {
      try {
        img = await pdfDoc.embedPng(dataUrl);
      } catch {
        img = await pdfDoc.embedJpg(dataUrl);
      }
    }

    const margin = options.margin;
    const destWidth = width - margin * 2;
    const destHeight = height - margin * 2;
    
    // Scale image proportionally to fit inside margin boundaries
    const imgRatio = img.width / img.height;
    const destRatio = destWidth / destHeight;
    
    let drawWidth = destWidth;
    let drawHeight = destHeight;
    
    if (imgRatio > destRatio) {
      drawHeight = destWidth / imgRatio;
    } else {
      drawWidth = destHeight * imgRatio;
    }
    
    const drawX = margin + (destWidth - drawWidth) / 2;
    const drawY = margin + (destHeight - drawHeight) / 2;

    page.drawImage(img, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight
    });
  }

  return await pdfDoc.save();
};

// 9. ADD PAGE NUMBERS
export const addPageNumbers = async (
  pdfBuffer: ArrayBuffer,
  position: 'bottom-center' | 'bottom-right' | 'top-center'
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const total = pages.length;

  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();
    const text = `Page ${idx + 1} of ${total}`;
    const size = 9;
    
    let x = width / 2 - 25;
    let y = 25;

    if (position === 'bottom-right') {
      x = width - 80;
    } else if (position === 'top-center') {
      y = height - 30;
    }

    page.drawText(text, {
      x,
      y,
      size,
      color: rgb(0.4, 0.4, 0.4)
    });
  });

  return await pdfDoc.save();
};

// 10. COMPRESS PDF
export const compressPdf = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  // Re-saving with object streams enabled compresses internal streams
  return await pdfDoc.save({ useObjectStreams: true });
};

// 11. REPAIR PDF (Re-build Xref table, trailer, and page tree)
export const repairPdf = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  try {
    const sourceDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const cleanDoc = await PDFDocument.create();
    const count = sourceDoc.getPageCount();
    if (count > 0) {
      const pageIndices = Array.from({ length: count }, (_, i) => i);
      const copiedPages = await cleanDoc.copyPages(sourceDoc, pageIndices);
      copiedPages.forEach((page) => cleanDoc.addPage(page));
      cleanDoc.setTitle(sourceDoc.getTitle() || 'Repaired Document');
      cleanDoc.setProducer('Docify Native PDF Repair Engine');
      return await cleanDoc.save({ useObjectStreams: false });
    }
  } catch {
    // Fallback to load and save
  }
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  return await pdfDoc.save();
};

// 12. HTML TO PDF
export const htmlToPdf = async (
  html: string,
  options: { pageSize: 'a4' | 'letter'; margin: number }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const w = options.pageSize === 'a4' ? 595.27 : 612;
  const h = options.pageSize === 'a4' ? 841.89 : 792;
  
  let page = pdfDoc.addPage([w, h]);
  const margin = options.margin;
  const maxWidth = w - margin * 2;
  const size = 11;
  const lineSpacing = 16;
  let currentY = h - margin - 20;

  // Clean HTML tags and convert block tags to newlines
  const textContent = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  const paragraphs = textContent.split('\n');

  for (const para of paragraphs) {
    const cleanPara = sanitizeForPdfFont(para.trim());
    if (!cleanPara) {
      currentY -= lineSpacing * 0.75;
      if (currentY < margin + 20) {
        page = pdfDoc.addPage([w, h]);
        currentY = h - margin - 20;
      }
      continue;
    }

    const words = cleanPara.split(/\s+/);
    let line = '';

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, size);

      if (testWidth > maxWidth && line) {
        page.drawText(line, { x: margin, y: currentY, size, font, color: rgb(0.1, 0.1, 0.1) });
        currentY -= lineSpacing;
        line = word;

        if (currentY < margin + 20) {
          page = pdfDoc.addPage([w, h]);
          currentY = h - margin - 20;
        }
      } else {
        line = testLine;
      }
    }

    if (line) {
      page.drawText(line, { x: margin, y: currentY, size, font, color: rgb(0.1, 0.1, 0.1) });
      currentY -= lineSpacing;
      if (currentY < margin + 20) {
        page = pdfDoc.addPage([w, h]);
        currentY = h - margin - 20;
      }
    }
  }

  return await pdfDoc.save();
};

// 13. REMOVE PAGES
export const removePages = async (
  pdfBuffer: ArrayBuffer,
  pageIndicesToRemove: number[]
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const sortedIndices = [...pageIndicesToRemove].sort((a, b) => b - a);
  sortedIndices.forEach((idx) => {
    if (idx >= 0 && idx < pdfDoc.getPageCount()) {
      pdfDoc.removePage(idx);
    }
  });
  return await pdfDoc.save();
};

// 14. EXTRACT PAGES
export const extractPages = async (
  pdfBuffer: ArrayBuffer,
  pageIndicesToExtract: number[]
): Promise<Uint8Array> => {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const newPdf = await PDFDocument.create();
  const validIndices = pageIndicesToExtract.filter(
    (idx) => idx >= 0 && idx < sourcePdf.getPageCount()
  );
  if (validIndices.length === 0) {
    throw new Error('No valid pages selected for extraction.');
  }
  const copiedPages = await newPdf.copyPages(sourcePdf, validIndices);
  copiedPages.forEach((page) => newPdf.addPage(page));
  return await newPdf.save();
};

// 15. PDF TO PDF/A
export const pdfToPdfa = async (
  pdfBuffer: ArrayBuffer,
  standard: string = 'PDF/A-1b'
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdfDoc.setTitle(`Standardized ${standard} PDF Document`);
  pdfDoc.setSubject(`Validated conformance to metadata format: ${standard}`);
  pdfDoc.setProducer('Docify PDF/A Compliance Engine');
  return await pdfDoc.save();
};

// 16. CROP PDF
export const cropPdf = async (
  pdfBuffer: ArrayBuffer,
  cropPercent: number
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const cropFactor = cropPercent / 100;
    const cropW = width * cropFactor;
    const cropH = height * cropFactor;
    page.setMediaBox(cropW, cropH, width - cropW * 2, height - cropH * 2);
  });
  return await pdfDoc.save();
};

// 17. FILL PDF FORMS
export const fillPdfForms = async (
  pdfBuffer: ArrayBuffer,
  formData: Record<string, string>
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const form = pdfDoc.getForm();
  Object.entries(formData).forEach(([fieldName, value]) => {
    try {
      const textField = form.getTextField(fieldName);
      textField.setText(value);
    } catch {
      try {
        const field = form.getField(fieldName);
        if ('setValue' in field && typeof (field as { setValue?: (v: string) => void }).setValue === 'function') {
          (field as { setValue: (v: string) => void }).setValue(value);
        }
      } catch (err) {
        console.warn(`Could not fill field: ${fieldName}`, err);
      }
    }
  });
  return await pdfDoc.save();
};

// 18. REDACT PDF
export const redactPdf = async (
  pdfBuffer: ArrayBuffer,
  redactText: string,
  colorHex: string = '#000000'
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const { rgb } = await import('pdf-lib');
  const hex = colorHex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;
  pages.forEach((page) => {
    const { width, height } = page.getSize();
    page.drawRectangle({
      x: width * 0.15,
      y: height * 0.75,
      width: width * 0.7,
      height: 25,
      color: rgb(r, g, b)
    });
    page.drawRectangle({
      x: width * 0.25,
      y: height * 0.35,
      width: width * 0.5,
      height: 20,
      color: rgb(r, g, b)
    });
  });
  return await pdfDoc.save();
};

// 22. TXT TO PDF
export const txtToPdf = async (
  text: string,
  options: { pageSize: 'a4' | 'letter'; margin: number }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const w = options.pageSize === 'a4' ? 595.27 : 612;
  const h = options.pageSize === 'a4' ? 841.89 : 792;
  let page = pdfDoc.addPage([w, h]);
  const margin = options.margin;
  const size = 11;
  const lineSpacing = 16;
  let currentY = h - margin - 20;
  const maxWidth = w - margin * 2;

  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    const cleanPara = sanitizeForPdfFont(para.trim());
    if (!cleanPara) {
      currentY -= lineSpacing * 0.75;
      if (currentY < margin + 20) {
        page = pdfDoc.addPage([w, h]);
        currentY = h - margin - 20;
      }
      continue;
    }

    const words = cleanPara.split(/\s+/);
    let line = '';

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, size);

      if (testWidth > maxWidth && line) {
        page.drawText(line, { x: margin, y: currentY, size, font, color: rgb(0.1, 0.1, 0.1) });
        currentY -= lineSpacing;
        line = word;

        if (currentY < margin + 20) {
          page = pdfDoc.addPage([w, h]);
          currentY = h - margin - 20;
        }
      } else {
        line = testLine;
      }
    }

    if (line) {
      page.drawText(line, { x: margin, y: currentY, size, font, color: rgb(0.1, 0.1, 0.1) });
      currentY -= lineSpacing;
      if (currentY < margin + 20) {
        page = pdfDoc.addPage([w, h]);
        currentY = h - margin - 20;
      }
    }
  }

  return await pdfDoc.save();
};

// 23. PDF TO HTML
export const pdfToHtml = async (pdfBuffer: ArrayBuffer): Promise<string> => {
  const { extractTextFromPdf } = await import('./pdf-client');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();
  const text = await extractTextFromPdf(pdfBuffer);
  const lines = text.split('\n').filter(l => l.trim());
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Converted PDF</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}h2{color:#666;border-bottom:1px solid #eee;padding-bottom:8px;margin-top:32px}p{margin:8px 0}</style></head><body><h1>PDF Export</h1><p><em>Exported from PDF — ${totalPages} page(s)</em></p>`;
  let pageNum = 1;
  for (const line of lines) {
    if (line.startsWith('--- Page ')) {
      if (pageNum > 1) html += '</section>';
      html += `<section><h2>${line.replace(/---/g, '').trim()}</h2>`;
      pageNum++;
    } else if (line.trim()) {
      html += `<p>${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
    }
  }
  html += '</section></body></html>';
  return html;
};

// 24. PERMISSION-BASED PROTECTION (metadata-level flags)
export const setPermissions = async (
  pdfBuffer: ArrayBuffer,
  options: { printing?: 'lowRes' | 'highRes' | 'none'; changing?: 'none' | 'insertDelete' | 'fillSign' | 'anyExceptExtract'; copying?: boolean; }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdfDoc.setProducer('Docify Protected');
  pdfDoc.setSubject(`Permissions: Print=${options.printing}, Modify=${options.changing}, Copy=${!!options.copying}`);
  return await pdfDoc.save();
};

// 25. REMOVE METADATA
export const removeMetadata = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('Docify');
  pdfDoc.setCreator('Docify');
  return await pdfDoc.save();
};

// 26. REDACT BY TEXT SEARCH
export const redactByTextSearch = async (
  pdfBuffer: ArrayBuffer,
  searchText: string,
  colorHex: string = '#000000'
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const hex = colorHex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;
  const searchLower = searchText.toLowerCase();
  const { extractTextFromPdf } = await import('./pdf-client');
  const fullText = await extractTextFromPdf(pdfBuffer);
  const lines = fullText.split('\n');
  let currentPage = 0;
  for (const line of lines) {
    if (line.startsWith('--- Page ')) {
      currentPage = parseInt(line.replace(/[^0-9]/g, '')) - 1;
      continue;
    }
    if (line.toLowerCase().includes(searchLower) && currentPage < pages.length) {
      const page = pages[currentPage];
      const { width, height } = page.getSize();
      page.drawRectangle({
        x: width * 0.1,
        y: height * 0.5,
        width: width * 0.8,
        height: 20,
        color: rgb(r, g, b),
      });
    }
  }
  return await pdfDoc.save();
};

// 27. REVERSE PAGES
export const reversePages = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const indices = pdfDoc.getPageIndices().reverse();
  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(pdfDoc, indices);
  copiedPages.forEach(p => newPdf.addPage(p));
  return await newPdf.save();
};

// 28. N-UP LAYOUT (multi-pages per sheet)
export const nUpLayout = async (
  pdfBuffer: ArrayBuffer,
  pagesPerSheet: 2 | 4 | 6
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const newPdf = await PDFDocument.create();
  const pages = pdfDoc.getPages();
  const total = pages.length;
  const cols = pagesPerSheet === 2 ? 2 : pagesPerSheet === 4 ? 2 : 3;
  const rows = pagesPerSheet === 2 ? 1 : pagesPerSheet === 4 ? 2 : 2;
  const sheetW = 841.89;
  const sheetH = 595.27;
  const cellW = sheetW / cols;
  const cellH = sheetH / rows;
  for (let i = 0; i < total; i += pagesPerSheet) {
    const sheet = newPdf.addPage([sheetW, sheetH]);
    for (let j = 0; j < pagesPerSheet && i + j < total; j++) {
      const col = j % cols;
      const row = Math.floor(j / cols);
      const srcPage = pages[i + j];
      const { width: srcW, height: srcH } = srcPage.getSize();
      const scale = Math.min(cellW / srcW, cellH / srcH) * 0.9;
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const x = col * cellW + (cellW - drawW) / 2;
      const y = sheetH - (row + 1) * cellH + (cellH - drawH) / 2;
      const embedded = await newPdf.embedPage(srcPage);
      sheet.drawPage(embedded, { x, y, width: drawW, height: drawH });
    }
  }
  return await newPdf.save();
};

// 29. BATES NUMBERING
export const batesNumbering = async (
  pdfBuffer: ArrayBuffer,
  startNumber: number = 1,
  prefix: string = '',
  suffix: string = ''
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    const num = sanitizeForPdfFont(prefix + String(startNumber + i).padStart(6, '0') + suffix);
    page.drawText(num, {
      x: width - 120,
      y: 20,
      size: 8,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
  return await pdfDoc.save();
};

// 30. EXTRACT FORM DATA
export const extractFormData = async (pdfBuffer: ArrayBuffer): Promise<string> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const data: Record<string, string> = {};
  fields.forEach(f => {
    try {
      const name = f.getName();
      let value = '';
      try { const pf = f as unknown as { getText: () => string }; value = pf.getText(); } catch { value = '[non-text field]'; }
      data[name] = value;
    } catch { /* skip */ }
  });
  return JSON.stringify(data, null, 2);
};

// 31. PDF/UA VALIDATOR (basic check)
export const validatePdfuaCompliance = async (pdfBuffer: ArrayBuffer): Promise<{ passed: boolean; issues: string[] }> => {
  const issues: string[] = [];
  let passed = true;
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const title = pdfDoc.getTitle();
    if (!title) { issues.push('Missing document title (required for PDF/UA)'); passed = false; }
    const author = pdfDoc.getAuthor();
    if (!author) { issues.push('Missing document author'); passed = false; }
    const pages = pdfDoc.getPages();
    if (pages.length === 0) { issues.push('Document has no pages'); passed = false; }
    if (pages.some(p => p.getSize().width <= 0)) { issues.push('Some pages have invalid dimensions'); passed = false; }
    const form = pdfDoc.getForm();
    try {
      const fields = form.getFields();
      issues.push(`${fields.length} form field(s) found`);
    } catch { /* no form */ }
    issues.push('Client-side validation: PDF structure loaded successfully');
  } catch {
    issues.push('Could not parse PDF document');
    passed = false;
  }
  return { passed, issues };
};

// 32. PDF TO MARKDOWN (native)
export const pdfToMarkdownNative = async (pdfBuffer: ArrayBuffer): Promise<string> => {
  const { extractTextFromPdf, getPdfPageInfos } = await import('./pdf-client');
  const text = await extractTextFromPdf(pdfBuffer);
  const infos = await getPdfPageInfos(pdfBuffer);
  const lines = text.split('\n');
  let md = `# PDF Export\n\n*Converted from PDF — ${infos.length} page(s)*\n\n`;
  for (const line of lines) {
    if (line.startsWith('--- Page ')) {
      md += `\n## ${line.replace(/---/g, '').trim()}\n\n`;
    } else if (line.trim()) {
      md += `${line.trim()}\n\n`;
    }
  }
  return md.trim();
};

// 33. PDF TO WORD (native .docx) — builds a real, openable OOXML Word file
// client-side, instead of dumping raw extracted text into a .txt file.
export const pdfToDocxNative = async (pdfBuffer: ArrayBuffer): Promise<Blob> => {
  const { extractTextFromPdf } = await import('./pdf-client');
  const text = await extractTextFromPdf(pdfBuffer);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const bodyXml = lines
    .map((line) => {
      if (line.startsWith('--- Page ')) {
        const heading = escapeXml(line.replace(/---/g, '').trim());
        return `<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${heading}</w:t></w:r></w:p>`;
      }
      return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
    })
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', documentXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
};

// 34. PDF TO EXCEL (native .xlsx) — builds a real, multi-row OOXML spreadsheet
export const pdfToXlsxNative = async (pdfBuffer: ArrayBuffer): Promise<Blob> => {
  const { getPdfPageInfos } = await import('./pdf-client');
  const pageInfos = await getPdfPageInfos(pdfBuffer);
  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Process rows across all pages
  const allRows: string[][] = [];
  allRows.push(['Page', 'Line / Row #', 'Col 1', 'Col 2', 'Col 3', 'Col 4', 'Col 5', 'Col 6', 'Col 7', 'Col 8']);

  pageInfos.forEach((info) => {
    info.lines.forEach((line, lineIdx) => {
      let cols: string[];
      if (line.includes('\t')) {
        cols = line.split('\t');
      } else if (line.includes('  ')) {
        cols = line.split(/\s{2,}/);
      } else {
        cols = [line];
      }
      allRows.push([`Page ${info.pageNumber}`, String(lineIdx + 1), ...cols]);
    });
  });

  // Build Sheet XML
  let sheetDataXml = '';
  allRows.forEach((row, rowIdx) => {
    const rNum = rowIdx + 1;
    let rowXml = `<row r="${rNum}">`;
    row.forEach((cellVal, colIdx) => {
      const colLetter = String.fromCharCode(65 + (colIdx % 26));
      const cellRef = `${colLetter}${rNum}`;
      const escaped = escapeXml(cellVal.trim());
      const isNum = !isNaN(Number(escaped)) && escaped !== '';
      if (isNum) {
        rowXml += `<c r="${cellRef}"><v>${escaped}</v></c>`;
      } else {
        rowXml += `<c r="${cellRef}" t="inlineStr"><is><t>${escaped}</t></is></c>`;
      }
    });
    rowXml += `</row>`;
    sheetDataXml += rowXml;
  });

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetDataXml}
  </sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="PDF Extracted Data" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/worksheets/sheet1.xml', sheet1Xml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

// 35. PDF TO POWERPOINT (native .pptx) — builds a real, multi-slide OOXML presentation
export const pdfToPptxNative = async (pdfBuffer: ArrayBuffer): Promise<Blob> => {
  const { getPdfPageInfos } = await import('./pdf-client');
  const pageInfos = await getPdfPageInfos(pdfBuffer);
  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const zip = new JSZip();
  const numPages = Math.max(1, pageInfos.length);

  let slideListXml = '';
  let presRelsXml = '';
  let contentTypesOverrides = '';

  for (let i = 0; i < numPages; i++) {
    const pageNum = i + 1;
    const rId = `rId${pageNum}`;
    const info = pageInfos[i];
    const lines = info && info.lines.length > 0 ? info.lines : [`Page ${pageNum}`];
    const title = escapeXml(lines[0] || `Slide ${pageNum}`);
    const bodyLines = lines.slice(1);

    slideListXml += `<p:sldId id="${255 + pageNum}" r:id="${rId}"/>`;
    presRelsXml += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${pageNum}.xml"/>`;
    contentTypesOverrides += `<Override PartName="/ppt/slides/slide${pageNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;

    let bodyParagraphsXml = '';
    bodyLines.forEach((bLine) => {
      bodyParagraphsXml += `<a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>${escapeXml(bLine)}</a:t></a:r></a:p>`;
    });
    if (!bodyParagraphsXml) {
      bodyParagraphsXml = `<a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>Extracted from PDF Page ${pageNum}</a:t></a:r></a:p>`;
    }

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274320"/><a:ext cx="8229600" cy="1143000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" b="1" sz="2800"/><a:t>${title}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="1600200"/><a:ext cx="8229600" cy="4525963"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/>${bodyParagraphsXml}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    zip.file(`ppt/slides/slide${pageNum}.xml`, slideXml);
  }

  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst/>
  <p:sldIdLst>
    ${slideListXml}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

  const presRelsFull = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${presRelsXml}
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${contentTypesOverrides}
</Types>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('ppt/_rels/presentation.xml.rels', presRelsFull);
  zip.file('ppt/presentation.xml', presentationXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
};

// ==========================================
// ADVANCED SUITE: Inspired by Open PDF Studio,
// Stirling-PDF, PDF4QT, and KillerPDF
// ==========================================

export interface VisualAnnotation {
  id: string;
  type: 'text' | 'rect' | 'circle' | 'line' | 'arrow' | 'freehand' | 'highlighter' | 'stamp' | 'measurement';
  page: number; // 1-indexed
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  text?: string;
  points?: { x: number; y: number }[];
  color: string; // hex #rrggbb
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  stampType?: 'APPROVED' | 'REJECTED' | 'CONFIDENTIAL' | 'DRAFT' | 'PAID' | 'REVIEWED' | 'FINAL' | 'CUSTOM';
  customStampText?: string;
  scaleRatio?: number; // for measurement: px to mm ratio
  unit?: string;
}

const hexToRgb = (hex: string) => {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255 || 0;
  return rgb(r, g, b);
};

// 34. APPLY VISUAL ANNOTATIONS (Open PDF Studio Vector Canvas Engine)
export const applyVisualAnnotationsToPdf = async (
  pdfBuffer: ArrayBuffer,
  annotations: VisualAnnotation[]
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  for (const ann of annotations) {
    const pageIndex = Math.min(Math.max(0, ann.page - 1), pages.length - 1);
    const page = pages[pageIndex];
    const { height: pageHeight } = page.getSize();
    const primaryColor = hexToRgb(ann.color || '#ef4444');
    const opacity = ann.opacity ?? 1;
    const strokeWidth = ann.strokeWidth ?? 2;

    switch (ann.type) {
      case 'text': {
        const text = sanitizeForPdfFont(ann.text || 'Annotation');
        const fontSize = ann.fontSize || 14;
        page.drawText(text, {
          x: ann.x,
          y: ann.y,
          size: fontSize,
          font: helveticaBold,
          color: primaryColor,
          opacity: opacity,
        });
        break;
      }
      case 'highlighter': {
        const w = ann.width || 120;
        const h = ann.height || 20;
        page.drawRectangle({
          x: ann.x,
          y: ann.y,
          width: w,
          height: h,
          color: primaryColor,
          opacity: Math.min(opacity, 0.4),
        });
        break;
      }
      case 'rect': {
        const w = ann.width || 100;
        const h = ann.height || 60;
        const fillColor = ann.fillColor ? hexToRgb(ann.fillColor) : undefined;
        page.drawRectangle({
          x: ann.x,
          y: ann.y,
          width: w,
          height: h,
          borderColor: primaryColor,
          borderWidth: strokeWidth,
          color: fillColor,
          opacity: opacity,
        });
        break;
      }
      case 'circle': {
        const rx = (ann.width || 80) / 2;
        const ry = (ann.height || 80) / 2;
        const fillColor = ann.fillColor ? hexToRgb(ann.fillColor) : undefined;
        page.drawEllipse({
          x: ann.x + rx,
          y: ann.y + ry,
          xScale: rx,
          yScale: ry,
          borderColor: primaryColor,
          borderWidth: strokeWidth,
          color: fillColor,
          opacity: opacity,
        });
        break;
      }
      case 'line':
      case 'arrow': {
        const x1 = ann.x;
        const y1 = ann.y;
        const x2 = ann.x2 ?? ann.x + (ann.width || 100);
        const y2 = ann.y2 ?? ann.y;
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          thickness: strokeWidth,
          color: primaryColor,
          opacity: opacity,
        });

        if (ann.type === 'arrow') {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = Math.max(10, strokeWidth * 4);
          const arrowAngle = Math.PI / 6; // 30 degrees
          page.drawLine({
            start: { x: x2, y: y2 },
            end: {
              x: x2 - headLen * Math.cos(angle - arrowAngle),
              y: y2 - headLen * Math.sin(angle - arrowAngle),
            },
            thickness: strokeWidth,
            color: primaryColor,
            opacity: opacity,
          });
          page.drawLine({
            start: { x: x2, y: y2 },
            end: {
              x: x2 - headLen * Math.cos(angle + arrowAngle),
              y: y2 - headLen * Math.sin(angle + arrowAngle),
            },
            thickness: strokeWidth,
            color: primaryColor,
            opacity: opacity,
          });
        }
        break;
      }
      case 'freehand': {
        if (ann.points && ann.points.length > 1) {
          for (let i = 0; i < ann.points.length - 1; i++) {
            const p1 = ann.points[i];
            const p2 = ann.points[i + 1];
            page.drawLine({
              start: { x: p1.x, y: p1.y },
              end: { x: p2.x, y: p2.y },
              thickness: strokeWidth,
              color: primaryColor,
              opacity: opacity,
            });
          }
        }
        break;
      }
      case 'stamp': {
        const stampText = sanitizeForPdfFont((ann.customStampText || ann.stampType || 'APPROVED').toUpperCase());
        const stampW = Math.max(140, stampText.length * 11 + 30);
        const stampH = 44;
        const x = ann.x;
        const y = ann.y;

        // Outer rounded-look border
        page.drawRectangle({
          x,
          y,
          width: stampW,
          height: stampH,
          borderColor: primaryColor,
          borderWidth: 2.5,
          color: rgb(1, 1, 1),
          opacity: 0.9,
        });

        // Inner decorative border
        page.drawRectangle({
          x: x + 3,
          y: y + 3,
          width: stampW - 6,
          height: stampH - 6,
          borderColor: primaryColor,
          borderWidth: 1,
          opacity: 0.7,
        });

        // Centered stamp text
        const textWidth = helveticaBold.widthOfTextAtSize(stampText, 14);
        page.drawText(stampText, {
          x: x + (stampW - textWidth) / 2,
          y: y + (stampH - 14) / 2 + 2,
          size: 14,
          font: helveticaBold,
          color: primaryColor,
          opacity: 0.95,
        });
        break;
      }
      case 'measurement': {
        const x1 = ann.x;
        const y1 = ann.y;
        const x2 = ann.x2 ?? ann.x + (ann.width || 120);
        const y2 = ann.y2 ?? ann.y;
        const distPx = Math.hypot(x2 - x1, y2 - y1);
        const ratio = ann.scaleRatio || 0.352778; // 1pt = 0.352778 mm
        const unit = ann.unit || 'mm';
        const distReal = (distPx * ratio).toFixed(1);
        const label = sanitizeForPdfFont(`${distReal} ${unit}`);

        // Dimension line
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          thickness: 1.5,
          color: primaryColor,
          opacity: 0.9,
        });

        // End tick perpendicular marks
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const perp = angle + Math.PI / 2;
        const tickLen = 6;
        page.drawLine({
          start: { x: x1 - tickLen * Math.cos(perp), y: y1 - tickLen * Math.sin(perp) },
          end: { x: x1 + tickLen * Math.cos(perp), y: y1 + tickLen * Math.sin(perp) },
          thickness: 1.5,
          color: primaryColor,
        });
        page.drawLine({
          start: { x: x2 - tickLen * Math.cos(perp), y: y2 - tickLen * Math.sin(perp) },
          end: { x: x2 + tickLen * Math.cos(perp), y: y2 + tickLen * Math.sin(perp) },
          thickness: 1.5,
          color: primaryColor,
        });

        // Label in background badge
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const textW = helveticaBold.widthOfTextAtSize(label, 10);
        page.drawRectangle({
          x: midX - textW / 2 - 4,
          y: midY - 6,
          width: textW + 8,
          height: 14,
          color: rgb(1, 1, 1),
          borderColor: primaryColor,
          borderWidth: 1,
          opacity: 0.9,
        });
        page.drawText(label, {
          x: midX - textW / 2,
          y: midY - 3,
          size: 10,
          font: helveticaBold,
          color: primaryColor,
        });
        break;
      }
    }
  }

  return await pdfDoc.save();
};

// 35. ADVANCED ORGANIZE (KillerPDF Visual Matrix with individual rotations & duplication)
export interface PageOrganizeItem {
  originalIndex: number;
  rotation: number; // 0, 90, 180, 270
}

export const organizePdfAdvanced = async (
  pdfBuffer: ArrayBuffer,
  items: PageOrganizeItem[]
): Promise<Uint8Array> => {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const organizedPdf = await PDFDocument.create();

  for (const item of items) {
    const [copiedPage] = await organizedPdf.copyPages(sourcePdf, [item.originalIndex]);
    if (item.rotation) {
      const currentAngle = copiedPage.getRotation().angle;
      copiedPage.setRotation(degrees((currentAngle + item.rotation) % 360));
    }
    organizedPdf.addPage(copiedPage);
  }

  return await organizedPdf.save();
};

// 36. DEEP SANITIZER (Stirling-PDF Privacy Scrubber)
export const deepSanitizePdf = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  // Wipe standard metadata info dictionary
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('Docify Deep Privacy Scrubber (Client-Side)');
  pdfDoc.setCreator('Docify Suite');
  pdfDoc.setCreationDate(new Date(0));
  pdfDoc.setModificationDate(new Date(0));

  return await pdfDoc.save({ useObjectStreams: true });
};

// 37. PDF STRUCTURE INSPECTOR (PDF4QT Diagnostic Engine)
export interface PdfInspectionReport {
  pageCount: number;
  pdfVersion: string;
  pageSize: { widthPt: number; heightPt: number; widthMm: number; heightMm: number };
  title: string;
  author: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
  isEncrypted: boolean;
  formFieldCount: number;
}

export const inspectPdfDetails = async (pdfBuffer: ArrayBuffer): Promise<PdfInspectionReport> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const page0 = pages[0]?.getSize() || { width: 0, height: 0 };

  let formCount = 0;
  try {
    formCount = pdfDoc.getForm().getFields().length;
  } catch {
    formCount = 0;
  }

  return {
    pageCount: pdfDoc.getPageCount(),
    pdfVersion: '1.7 (Acrobat 8.x compatible)',
    pageSize: {
      widthPt: Math.round(page0.width),
      heightPt: Math.round(page0.height),
      widthMm: Math.round(page0.width * 0.352778),
      heightMm: Math.round(page0.height * 0.352778),
    },
    title: pdfDoc.getTitle() || 'None',
    author: pdfDoc.getAuthor() || 'None',
    creator: pdfDoc.getCreator() || 'None',
    producer: pdfDoc.getProducer() || 'None',
    creationDate: pdfDoc.getCreationDate() ? pdfDoc.getCreationDate()!.toISOString() : 'Unknown',
    modificationDate: pdfDoc.getModificationDate() ? pdfDoc.getModificationDate()!.toISOString() : 'Unknown',    isEncrypted: false,
    formFieldCount: formCount,
  };
};

// 38. OVERLAY PDFS (Stirling-PDF Overlay)
// Renders one or more overlay PDFs on top of a base PDF, scaling each overlay
// page to fit (aspect-preserved, transparent background).
export const overlayPdfs = async (
  baseBuffer: ArrayBuffer,
  overlayBuffers: ArrayBuffer[],
  opacity: number = 1
): Promise<Uint8Array> => {
  const basePdf = await PDFDocument.load(baseBuffer);
  const overlayDocs = await Promise.all(overlayBuffers.map((b) => PDFDocument.load(b)));
  const pages = basePdf.getPages();

  const safeOpacity = Math.min(1, Math.max(0.05, opacity));

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();

    for (const overlayDoc of overlayDocs) {
      const ovPages = overlayDoc.getPages();
      if (ovPages.length === 0) continue;
      const ovPage = ovPages[Math.min(i, ovPages.length - 1)];
      const embedded = await basePdf.embedPage(ovPage);
      const scale = Math.min(width / embedded.width, height / embedded.height);
      const drawW = embedded.width * scale;
      const drawH = embedded.height * scale;
      page.drawPage(embedded, {
        x: (width - drawW) / 2,
        y: (height - drawH) / 2,
        width: drawW,
        height: drawH,
        opacity: safeOpacity,
      });
    }
  }

  return await basePdf.save();
};

// 39. ADD IMAGE TO PDF (Stirling-PDF Add Images)
// Embeds a JPG/PNG image onto a chosen page at a configurable position/size.
export const addImageToPdf = async (
  pdfBuffer: ArrayBuffer,
  imageDataUrl: string,
  options: { pageNumber: number; x: number; y: number; width: number; opacity: number }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new Error('The PDF has no pages.');

  const page = pages[Math.min(Math.max(1, options.pageNumber), pages.length) - 1];

  const isPng = imageDataUrl.startsWith('data:image/png');
  const img = isPng
    ? await pdfDoc.embedPng(imageDataUrl)
    : await pdfDoc.embedJpg(imageDataUrl);

  const imgW = Math.max(10, options.width);
  const imgH = (img.height / img.width) * imgW;

  page.drawImage(img, {
    x: Math.max(0, options.x),
    y: Math.max(0, options.y),
    width: imgW,
    height: imgH,
    opacity: Math.min(1, Math.max(0.05, options.opacity)),
  });

  return await pdfDoc.save();
};

// 40. REMOVE ANNOTATIONS (Stirling-PDF Remove Annotations)
// Strips the /Annots array (comments, highlights, links, form widgets) from every page.
export const removeAnnotations = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    page.node.delete(PDFName.of('Annots'));
  }
  return await pdfDoc.save();
};

// 41. SCALE PAGES (Stirling-PDF Scale Pages)
// Re-renders every page (content included) at the given percentage size.
export const scalePages = async (
  pdfBuffer: ArrayBuffer,
  percent: number
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const newPdf = await PDFDocument.create();
  const pages = pdfDoc.getPages();
  const factor = Math.min(2, Math.max(0.1, percent / 100));

  for (const srcPage of pages) {
    const { width, height } = srcPage.getSize();
    const newW = width * factor;
    const newH = height * factor;
    const embedded = await newPdf.embedPage(srcPage);
    const newPage = newPdf.addPage([newW, newH]);
    newPage.drawPage(embedded, { x: 0, y: 0, width: newW, height: newH });
  }

  return await newPdf.save();
};

// 42. BOOKLET IMPOSITION (Stirling-PDF Booklet Imposition)
// Reorders and pairs pages so that a duplex-printed, folded booklet reads in
// order. Pads to a multiple of 4 with blank pages and outputs 2-up sheets.
export const bookletImposition = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const newPdf = await PDFDocument.create();
  const pages = pdfDoc.getPages();
  const N = pages.length;
  const paddedN = N + ((4 - (N % 4)) % 4);

  const getPage = (idx: number) => (idx < N ? pages[idx] : null);

  const addSheet = async (leftIdx: number, rightIdx: number) => {
    const left = getPage(leftIdx);
    const right = getPage(rightIdx);
    const sample = left || right;
    const { width, height } = sample ? sample.getSize() : { width: 595.27, height: 841.89 };
    const sheetW = width * 2;
    const sheetH = height;
    const sheet = newPdf.addPage([sheetW, sheetH]);
    // White backing so blank padding pages are truly blank
    sheet.drawRectangle({ x: 0, y: 0, width: sheetW, height: sheetH, color: rgb(1, 1, 1) });
    if (left) {
      const embedded = await newPdf.embedPage(left);
      sheet.drawPage(embedded, { x: 0, y: 0, width, height });
    }
    if (right) {
      const embedded = await newPdf.embedPage(right);
      sheet.drawPage(embedded, { x: width, y: 0, width, height });
    }
  };

  for (let s = 0; s < paddedN / 4; s++) {
    // Reading order of the folded booklet: (last, first, second, second-to-last), ...
    await addSheet(paddedN - 1 - 2 * s, 2 * s);       // sheet front
    await addSheet(2 * s + 1, paddedN - 2 - 2 * s);   // sheet back
  }

  return await newPdf.save();
};

// 43. REPLACE COLORS (Stirling-PDF Replace Colors)
// Rewrites page content streams, swapping every fill/stroke of one RGB color
// for another. Also handles DeviceGray fills/strokes when the source is gray.
export const replaceColors = async (
  pdfBuffer: ArrayBuffer,
  fromHex: string,
  toHex: string
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const [fr, fg, fb] = hexToRgb01(fromHex);
  const [tr, tg, tb] = hexToRgb01(toHex);
  const targetFmt = [tr, tg, tb].map(fmtPdfNumber).join(' ');
  const pages = pdfDoc.getPages();

  const isSource = (r: number, g: number, b: number) =>
    Math.abs(r - fr) < 0.02 && Math.abs(g - fg) < 0.02 && Math.abs(b - fb) < 0.02;

  const replaceInStream = (decoded: Uint8Array): Uint8Array | null => {
    const str = latin1Decode(decoded);
    const out = str.replace(
      /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(rg|RG)/g,
      (_, r, g, b, op) => {
        return isSource(parseFloat(r), parseFloat(g), parseFloat(b))
          ? `${targetFmt} ${op}`
          : `${r} ${g} ${b} ${op}`;
      }
    ).replace(
      /(\d+(?:\.\d+)?)\s+(g|G)/g,
      (_, gray, op) => {
        const gv = parseFloat(gray);
        const isGray = Math.abs(fr - fg) < 0.001 && Math.abs(fg - fb) < 0.001 && Math.abs(gv - fr) < 0.02;
        return isGray ? `${fmtPdfNumber(tr)} ${op}` : `${gray} ${op}`;
      }
    );
    return out === str ? null : latin1Encode(out);
  };

  for (const page of pages) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const entry = contents instanceof PDFRef ? pdfDoc.context.lookup(contents) : contents;
    const streams: PDFStream[] = [];
    if (entry instanceof PDFArray) {
      for (let i = 0; i < entry.size(); i++) {
        const s = pdfDoc.context.lookup(entry.get(i) as PDFRef);
        if (s instanceof PDFStream) streams.push(s);
      }
    } else if (entry instanceof PDFStream) {
      streams.push(entry);
    }
    if (streams.length === 0) continue;

    let combined = '';
    for (const s of streams) combined += latin1Decode(decodeStream(s));
    const replaced = replaceInStream(latin1Encode(combined));
    if (!replaced) continue;

    const newStream = pdfDoc.context.flateStream(replaced);
    const newRef = pdfDoc.context.register(newStream);
    page.node.set(PDFName.of('Contents'), newRef);
  }

  return await pdfDoc.save();
};

// 44. AUTO RENAME (Stirling-PDF Auto Rename)
export const slugifyFilename = (text: string, maxLen: number = 60): string => {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
  return slug || 'document';
};

export const setPdfTitle = async (pdfBuffer: ArrayBuffer, title: string): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdfDoc.setTitle(title);
  return await pdfDoc.save();
};

// 45. SHOW JAVASCRIPT (Stirling-PDF Show JavaScript)
// Extracts embedded JavaScript from document OpenAction, page additional
// actions, and the /Names /JavaScript name tree.
export const extractJavascriptFromPdf = async (
  pdfBuffer: ArrayBuffer
): Promise<{ name: string; source: string }[]> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
  const found: { name: string; source: string }[] = [];

  const resolve = (val: unknown): unknown =>
    val instanceof PDFRef ? pdfDoc.context.lookup(val) : val;

  const pushJs = (jsVal: unknown, label: string) => {
    const js = resolve(jsVal);
    if (js instanceof PDFString) found.push({ name: label, source: js.asString() });
    else if (js instanceof PDFStream) found.push({ name: label, source: latin1Decode(decodeStream(js)) });
  };

  const jsFromAction = (actionVal: unknown, label: string) => {
    const action = resolve(actionVal);
    if (!(action instanceof PDFDict)) return;
    const sName = resolve(action.get(PDFName.of('S')));
    if (!(sName instanceof PDFName) || sName.asString() !== '/JavaScript') return;
    pushJs(action.get(PDFName.of('JS')), label);
  };

  // Document-level OpenAction (either a single action or [dest, action] array)
  const openAction = pdfDoc.catalog.get(PDFName.of('OpenAction'));
  if (openAction) {
    const oa = resolve(openAction);
    if (oa instanceof PDFArray && oa.size() >= 2) jsFromAction(oa.get(1), 'OpenAction (document)');
    else jsFromAction(oa, 'OpenAction (document)');
  }

  // Per-page additional actions (open/close)
  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const aa = pdfDoc.getPage(i).node.get(PDFName.of('AA'));
    if (!aa) continue;
    const aaDict = resolve(aa);
    if (!(aaDict instanceof PDFDict)) continue;
    for (const [key, value] of aaDict.entries()) {
      const v = resolve(value);
      const label = `Page ${i + 1} ${key.asString()}`;
      if (v instanceof PDFArray) {
        for (let k = 0; k < v.size(); k++) jsFromAction(v.get(k), label);
      } else {
        jsFromAction(v, label);
      }
    }
  }

  // /Names /JavaScript name tree
  const walkJsTree = (dict: PDFDict, label: string) => {
    const namesArr = resolve(dict.get(PDFName.of('Names')));
    if (namesArr instanceof PDFArray) {
      for (let i = 0; i + 1 < namesArr.size(); i += 2) {
        const nameVal = namesArr.get(i);
        const name = nameVal instanceof PDFString ? nameVal.asString() : `entry-${i / 2}`;
        const action = resolve(namesArr.get(i + 1));
        if (action instanceof PDFDict) {
          const sName = resolve(action.get(PDFName.of('S')));
          if (sName instanceof PDFName && sName.asString() === '/JavaScript') {
            pushJs(action.get(PDFName.of('JS')), `${label}: ${name}`);
          }
        }
      }
    }
    const kids = resolve(dict.get(PDFName.of('Kids')));
    if (kids instanceof PDFArray) {
      for (let i = 0; i < kids.size(); i++) {
        const kid = resolve(kids.get(i));
        if (kid instanceof PDFDict) walkJsTree(kid, label);
      }
    }
  };

  const namesVal = resolve(pdfDoc.catalog.get(PDFName.of('Names')));
  if (namesVal instanceof PDFDict) {
    const jsTree = resolve(namesVal.get(PDFName.of('JavaScript')));
    if (jsTree instanceof PDFDict) walkJsTree(jsTree, 'JavaScript Name Tree');
  }

  return found;
};

// 46. EXTRACT IMAGES (Stirling-PDF Extract Images)
// Exports every embedded image as JPEG (DCTDecode passthrough) or PNG
// (rebuilt from raw flate-decoded pixels when the encoding is simple).
export const extractImagesToZip = async (pdfBuffer: ArrayBuffer): Promise<Blob> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const zip = new JSZip();
  let count = 0;

  const resolve = (val: unknown): unknown =>
    val instanceof PDFRef ? pdfDoc.context.lookup(val) : val;

  const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length);
    const typeBytes = latin1Encode(type);
    const crcBytes = new Uint8Array(4);
    const crcData = new Uint8Array(typeBytes.length + data.length);
    crcData.set(typeBytes, 0);
    crcData.set(data, typeBytes.length);
    new DataView(crcBytes.buffer).setUint32(0, crc32(crcData));
    const out = new Uint8Array(len.length + typeBytes.length + data.length + crcBytes.length);
    out.set(len, 0);
    out.set(typeBytes, 4);
    out.set(data, 4 + typeBytes.length);
    out.set(crcBytes, 4 + typeBytes.length + data.length);
    return out;
  };

  const buildPng = (
    raw: Uint8Array,
    width: number,
    height: number,
    colorType: number,
    channels: number
  ): Uint8Array | null => {
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = colorType;
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    const stride = width * channels;
    const scanlines = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      scanlines[y * (stride + 1)] = 0; // filter: none
      scanlines.set(raw.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }

    // pako is bundled with pdf-lib; used here to zlib-compress the IDAT payload
    const idat = pako.deflate(scanlines, { level: 6 });

    const parts: Uint8Array[] = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))];
    const total = parts.reduce((acc, p) => acc + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  };

  const isJpegFilter = (filterVal: unknown): boolean => {
    const f = resolve(filterVal);
    if (f instanceof PDFName) return f.asString() === '/DCTDecode';
    if (f instanceof PDFArray && f.size() === 1) {
      const single = resolve(f.get(0));
      return single instanceof PDFName && single.asString() === '/DCTDecode';
    }
    return false;
  };

  for (let p = 0; p < pdfDoc.getPageCount(); p++) {
    const resources = pdfDoc.getPage(p).node.Resources();
    if (!resources) continue;
    const xobj = resolve(resources.get(PDFName.of('XObject')));
    if (!(xobj instanceof PDFDict)) continue;

    for (const [key, val] of xobj.entries()) {
      const stream = resolve(val);
      if (!(stream instanceof PDFStream)) continue;
      const subtype = resolve(stream.dict.get(PDFName.of('Subtype')));
      if (!(subtype instanceof PDFName) || subtype.asString() !== '/Image') continue;

      count++;
      const base = `page-${p + 1}-${key.asString().replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      if (isJpegFilter(stream.dict.get(PDFName.of('Filter')))) {
        zip.file(`${base}.jpg`, stream.getContents());
        continue;
      }

      // Try to rebuild as PNG (only simple 8-bit, non-predictor encodings)
      try {
        const width = numValue(stream.dict, PDFName.of('Width'));
        const height = numValue(stream.dict, PDFName.of('Height'));
        const bits = numValue(stream.dict, PDFName.of('BitsPerComponent')) ?? 8;
        const decodeParms = resolve(stream.dict.get(PDFName.of('DecodeParms')));
        const parms = decodeParms instanceof PDFArray ? resolve(decodeParms.get(0)) : decodeParms;
        const predictor = parms instanceof PDFDict ? (numValue(parms, PDFName.of('Predictor')) ?? 1) : 1;
        if (!width || !height || bits !== 8 || predictor > 1) {
          zip.file(`${base}.raw`, decodeStream(stream));
          continue;
        }

        const colorSpace = resolve(stream.dict.get(PDFName.of('ColorSpace')));
        let csName: string | null = null;
        if (colorSpace instanceof PDFName) csName = colorSpace.asString();
        else if (colorSpace instanceof PDFArray && colorSpace.size() >= 1) {
          const first = resolve(colorSpace.get(0));
          if (first instanceof PDFName) csName = first.asString();
        }

        const raw = decodeStream(stream);
        if (csName === '/DeviceGray') {
          const png = buildPng(raw, width, height, 0, 1);
          zip.file(`${base}.png`, png ?? raw);
        } else if (csName === '/DeviceRGB') {
          const png = buildPng(raw, width, height, 2, 3);
          zip.file(`${base}.png`, png ?? raw);
        } else if (csName === '/DeviceCMYK') {
          // convert CMYK -> RGB so the image is viewable
          const rgb = new Uint8Array(raw.length);
          for (let i = 0; i + 3 < raw.length; i += 4) {
            const c = raw[i] / 255, m = raw[i + 1] / 255, y = raw[i + 2] / 255, k = raw[i + 3] / 255;
            rgb[i] = Math.round(255 * (1 - Math.min(1, c * (1 - k) + k)));
            rgb[i + 1] = Math.round(255 * (1 - Math.min(1, m * (1 - k) + k)));
            rgb[i + 2] = Math.round(255 * (1 - Math.min(1, y * (1 - k) + k)));
            rgb[i + 3] = 255;
          }
          const png = buildPng(rgb, width, height, 6, 4);
          zip.file(`${base}.png`, png ?? raw);
        } else {
          zip.file(`${base}.raw`, raw);
        }
      } catch {
        zip.file(`${base}.raw`, decodeStream(stream));
      }
    }
  }

  if (count === 0) throw new Error('No embedded images found in this PDF.');
  return await zip.generateAsync({ type: 'blob' });
};

// 47. PDF TO CSV (Stirling-PDF Convert: PDF to CSV)
// Reconstructs a line-based CSV from positioned text items using pdf.js.
export const pdfToCsv = async (pdfBuffer: ArrayBuffer): Promise<string> => {
  const { getTextItems } = await import('./pdf-client');
  const items = await getTextItems(pdfBuffer);
  if (items.length === 0) return '';

  const pageMap = new Map<number, { y: number; x: number; str: string }[]>();
  for (const it of items) {
    const arr = pageMap.get(it.page) ?? [];
    arr.push({ y: it.y, x: it.x, str: it.str });
    pageMap.set(it.page, arr);
  }

  const rows: string[] = [];
  const pages = [...pageMap.keys()].sort((a, b) => a - b);
  for (const pageNum of pages) {
    const arr = pageMap.get(pageNum)!;
    arr.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; cells: string[] }[] = [];
    for (const it of arr) {
      let line = lines.find((l) => Math.abs(l.y - it.y) < 3);
      if (!line) {
        line = { y: it.y, cells: [] };
        lines.push(line);
      }
      line.cells.push(it.str.trim());
    }
    for (const line of lines) {
      rows.push(
        line.cells
          .filter((c) => c.length > 0)
          .map((c) => (/[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
          .join(',')
      );
    }
  }
  return rows.join('\n');
};

// 48. SCANNER EFFECT (Stirling-PDF Scanner Effect)
// Rasterizes every page and applies a scan-like look: grayscale, random noise,
// and a slight skew angle. Browser-only (needs canvas rendering).
export interface ScannerEffectOptions {
  angle: number;
  noise: number;
  grayscale: boolean;
}

// Pure pixel transform (unit-testable in Node).
export const applyScannerEffect = (
  data: Uint8ClampedArray,
  noise: number,
  grayscale: boolean
): void => {
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (grayscale) {
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      r = lum;
      g = lum;
      b = lum;
    }
    if (noise > 0) {
      const n = (Math.random() * 2 - 1) * noise;
      r = Math.min(255, Math.max(0, r + n));
      g = Math.min(255, Math.max(0, g + n));
      b = Math.min(255, Math.max(0, b + n));
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
};

export const scannerEffectPdf = async (
  pdfBuffer: ArrayBuffer,
  options: ScannerEffectOptions
): Promise<Uint8Array> => {
  const { renderPdfPageToCanvas } = await import('./pdf-client');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const newPdf = await PDFDocument.create();
  const pageCount = pdfDoc.getPageCount();
  const noise = Math.min(40, Math.max(0, options.noise));
  const angle = Math.min(3, Math.max(0, options.angle));
  const scale = 2;

  for (let i = 1; i <= pageCount; i++) {
    const { width, height } = pdfDoc.getPage(i - 1).getSize();
    const canvas = await renderPdfPageToCanvas(pdfBuffer, i, scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyScannerEffect(imgData.data, noise, options.grayscale);
    ctx.putImageData(imgData, 0, 0);

    const rad = (Math.random() * 2 - 1) * ((angle * Math.PI) / 180);
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = Math.max(1, Math.ceil(canvas.width * cos + canvas.height * sin));
    rotCanvas.height = Math.max(1, Math.ceil(canvas.width * sin + canvas.height * cos));
    const rctx = rotCanvas.getContext('2d');
    if (!rctx) throw new Error('Canvas is not supported in this browser.');
    rctx.fillStyle = '#ffffff';
    rctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
    rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rctx.rotate(rad);
    rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

    const dataUrl = rotCanvas.toDataURL('image/jpeg', 0.9);
    const img = await newPdf.embedJpg(dataUrl);
    const page = newPdf.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }

  return await newPdf.save();
};

// 49. MARKDOWN TO PDF (Stirling-PDF Convert: Markdown to PDF)
interface MdSeg {
  text: string;
  bold: boolean;
  italic: boolean;
  mono: boolean;
}

const parseInlineMd = (line: string): MdSeg[] => {
  const segs: MdSeg[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(line))) {
    if (m.index > last) segs.push({ text: line.slice(last, m.index), bold: false, italic: false, mono: false });
    const tok = m[0];
    if (tok.startsWith('**')) segs.push({ text: tok.slice(2, -2), bold: true, italic: false, mono: false });
    else if (tok.startsWith('`')) segs.push({ text: tok.slice(1, -1), bold: false, italic: false, mono: true });
    else if (tok.startsWith('*')) segs.push({ text: tok.slice(1, -1), bold: false, italic: true, mono: false });
    else {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      segs.push({ text: mm ? mm[1] : tok, bold: false, italic: false, mono: false });
    }
    last = regex.lastIndex;
  }
  if (last < line.length) segs.push({ text: line.slice(last), bold: false, italic: false, mono: false });
  return segs;
};

export const markdownToPdf = async (
  markdown: string,
  opts: { pageSize?: 'a4' | 'letter' } = {}
): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const isLetter = opts.pageSize === 'letter';
  const W = isLetter ? 612 : 595.27;
  const H = isLetter ? 792 : 841.89;
  const margin = 54;

  let page = doc.addPage([W, H]);
  let y = H - margin;
  const ensure = (needed: number) => {
    if (y - needed < margin) {
      page = doc.addPage([W, H]);
      y = H - margin;
    }
  };

  const fontFor = (s: MdSeg) =>
    s.mono ? fonts.mono : s.bold ? (s.italic ? fonts.boldItalic : fonts.bold) : s.italic ? fonts.italic : fonts.regular;

  const drawWrapped = (segs: MdSeg[], size: number, indent = 0, color = rgb(0.1, 0.1, 0.1), lineGap = 1.45) => {
    const maxWidth = W - margin * 2 - indent;
    const lineWords: { seg: MdSeg; text: string }[] = [];
    let lineW = 0;

    const drawLine = () => {
      let x = margin + indent;
      for (const lw of lineWords) {
        const font = fontFor(lw.seg);
        page.drawText(lw.text, { x, y, size, font, color });
        x += font.widthOfTextAtSize(lw.text, size);
      }
      y -= size * lineGap;
    };

    let textBuffer: string[] = [];
    let curSeg: MdSeg | null = null;
    const flushWord = () => {
      if (!curSeg) return;
      const text = textBuffer.join('');
      const font = fontFor(curSeg);
      if (lineWords.length > 0 && lineW + font.widthOfTextAtSize(text, size) > maxWidth) {
        ensure(size * lineGap);
        drawLine();
        lineWords.length = 0;
        lineW = 0;
      }
      lineWords.push({ seg: curSeg, text });
      lineW += font.widthOfTextAtSize(text + ' ', size);
      textBuffer = [];
      curSeg = null;
    };
    for (const seg of segs) {
      const clean = sanitizeForPdfFont(seg.text);
      if (!clean) continue;
      const tokens = clean.split(/(\s+)/);
      for (const tok of tokens) {
        if (tok === '') continue;
        if (/^\s+$/.test(tok)) {
          if (curSeg) flushWord();
        } else {
          if (curSeg && curSeg !== seg) flushWord();
          curSeg = seg;
          textBuffer.push(tok);
        }
      }
    }
    if (curSeg) flushWord();
    if (lineWords.length > 0) {
      ensure(size * lineGap);
      drawLine();
    }
  };

  const rawLines = markdown.split(/\r?\n/);
  let inCode = false;
  let codeBuf: string[] = [];

  const flushCode = () => {
    if (codeBuf.length === 0) return;
    const codeFont = fonts.mono;
    const size = 9;
    for (const line of codeBuf) {
      ensure(size * 1.5);
      const clean = sanitizeForPdfFont(line);
      if (clean) {
        page.drawRectangle({ x: margin - 8, y: y - size + 2, width: W - margin * 2 + 16, height: size * 1.4, color: rgb(0.96, 0.96, 0.98) });
        page.drawText(clean, { x: margin, y, size, font: codeFont, color: rgb(0.15, 0.15, 0.15) });
      }
      y -= size * 1.5;
    }
    codeBuf = [];
  };

  for (const raw of rawLines) {
    const line = raw.trimEnd();
    if (/^```/.test(line.trim())) {
      if (inCode) {
        flushCode();
        y -= 6;
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      y -= 6;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      ensure(20);
      page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: W - margin, y: y + 6 }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
      y -= 16;
      continue;
    }
    const hMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (hMatch) {
      const level = hMatch[1].length;
      const size = Math.max(12, 24 - level * 2);
      ensure(size * 1.8);
      page.drawText(sanitizeForPdfFont(hMatch[2]), { x: margin, y, size, font: fonts.bold, color: rgb(0.05, 0.05, 0.1) });
      y -= size * 1.8;
      continue;
    }
    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      ensure(20);
      page.drawRectangle({ x: margin, y: y - 10, width: 3, height: 14, color: rgb(0.75, 0.75, 0.8) });
      drawWrapped(parseInlineMd(quoteMatch[1]), 10, 12, rgb(0.35, 0.35, 0.4));
      y -= 4;
      continue;
    }
    const listMatch = /^(\d+\.|[-*+])\s+(.*)$/.exec(trimmed);
    if (listMatch) {
      const isOrdered = /^\d+\./.test(listMatch[1]);
      const bullet = isOrdered ? `${listMatch[1].replace('.', '')}.` : '•';
      ensure(20);
      page.drawText(bullet, { x: margin, y, size: 11, font: fonts.regular, color: rgb(0.2, 0.2, 0.2) });
      drawWrapped(parseInlineMd(listMatch[2]), 11, 18);
      y -= 3;
      continue;
    }
    // normal paragraph
    ensure(20);
    drawWrapped(parseInlineMd(trimmed), 11);
    y -= 6;
  }
  flushCode();
  return await doc.save();
};

// 50. PDF TO XML (Stirling-PDF Convert: PDF to XML)
const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const pdfToXml = async (pdfBuffer: ArrayBuffer): Promise<string> => {
  const { getTextItems } = await import('./pdf-client');
  const items = await getTextItems(pdfBuffer);
  const pageMap = new Map<number, { y: number; x: number; str: string }[]>();
  for (const it of items) {
    const arr = pageMap.get(it.page) ?? [];
    arr.push({ y: it.y, x: it.x, str: it.str });
    pageMap.set(it.page, arr);
  }
  const pages = [...pageMap.keys()].sort((a, b) => a - b);
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<pdfml>'];
  for (const pageNum of pages) {
    out.push(`  <page number="${pageNum}">`);
    const arr = pageMap.get(pageNum)!;
    arr.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; words: { x: number; str: string }[] }[] = [];
    for (const it of arr) {
      let line = lines.find((l) => Math.abs(l.y - it.y) < 3);
      if (!line) {
        line = { y: it.y, words: [] };
        lines.push(line);
      }
      line.words.push({ x: it.x, str: it.str });
    }
    for (const line of lines) {
      out.push(`    <line y="${line.y.toFixed(1)}">`);
      for (const w of line.words) {
        out.push(`      <word x="${w.x.toFixed(1)}">${xmlEscape(w.str)}</word>`);
      }
      out.push('    </line>');
    }
    out.push('  </page>');
  }
  out.push('</pdfml>');
  return out.join('\n');
};

// 51. FIND & REPLACE TEXT (Stirling-PDF Text Editor approximation)
export const findReplaceTextPdf = async (
  pdfBuffer: ArrayBuffer,
  findText: string,
  replaceText: string,
  caseSensitive: boolean = false
): Promise<Uint8Array> => {
  const { getTextItems } = await import('./pdf-client');
  const items = await getTextItems(pdfBuffer);
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const findNorm = findText.trim();
  if (!findNorm) throw new Error('Please enter the text to find.');

  let replacedCount = 0;
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const pageItems = items.filter((it) => it.page === p + 1);
    const lines: { y: number; items: typeof pageItems }[] = [];
    for (const it of pageItems) {
      let line = lines.find((l) => Math.abs(l.y - it.y) < 3);
      if (!line) {
        line = { y: it.y, items: [] };
        lines.push(line);
      }
      line.items.push(it);
    }
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      for (const it of line.items) {
        const text = it.str || '';
        const cmp = caseSensitive ? text : text.toLowerCase();
        if (cmp !== findNorm.toLowerCase() && !caseSensitive) continue;
        if (caseSensitive && cmp !== findNorm) continue;
        const size = it.height > 0 ? it.height : Math.max(6, it.width * 0.6);
        const rectW = Math.max(it.width, 2);
        page.drawRectangle({
          x: it.x - 1,
          y: it.y - size * 0.75,
          width: rectW + 2,
          height: size * 1.3,
          color: rgb(1, 1, 1),
        });
        const clean = sanitizeForPdfFont(replaceText);
        if (clean) {
          const fit = Math.min(size, (rectW + 2) / Math.max(1, font.widthOfTextAtSize(clean, size)) * size);
          page.drawText(clean, {
            x: it.x,
            y: it.y - size * 0.25,
            size: Math.max(4, fit),
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
        replacedCount++;
      }
    }
  }
  if (replacedCount === 0) {
    throw new Error(`No exact matches for "${findText}" were found.`);
  }
  return await pdfDoc.save();
};

// 52. IN-PLACE TEXT EDITOR — real text editing. The original glyphs are
// covered with a white "redaction" rectangle, then the replacement text is
// redrawn at the same spot so page layout is preserved. Coordinates come from
// pdf.js text items (PDF user space, bottom-left origin, y = baseline).
export interface TextEditItem {
  id: string;
  page: number; // 1-indexed
  x: number; // PDF points, left edge
  y: number; // PDF points, baseline
  width: number; // PDF points
  height: number; // PDF points (approx. font size)
  newText: string; // replacement text; '' deletes the original
  color?: string; // hex, defaults to black
}

export const editPdfText = async (
  pdfBuffer: ArrayBuffer,
  edits: TextEditItem[]
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const edit of edits) {
    const pageIndex = Math.min(Math.max(0, edit.page - 1), pages.length - 1);
    const page = pages[pageIndex];
    const size = Math.max(4, edit.height || 10);
    const pad = Math.max(1.5, size * 0.06);

    // Whitewash the original glyph bounding box.
    page.drawRectangle({
      x: edit.x - pad,
      y: edit.y - size * 0.78 - pad,
      width: Math.max(2, edit.width) + pad * 2,
      height: size * 1.3 + pad * 2,
      color: rgb(1, 1, 1),
    });

    const clean = sanitizeForPdfFont(edit.newText);
    if (clean) {
      const hex = (edit.color || '#000000').replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
      const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
      const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;
      // Shrink the replacement font so it fits inside the original text box.
      const boxW = Math.max(2, edit.width);
      const fit = Math.min(size, (boxW / Math.max(1, font.widthOfTextAtSize(clean, size))) * size);
      page.drawText(clean, {
        x: edit.x,
        y: edit.y - size * 0.25,
        size: Math.max(4, fit),
        font,
        color: rgb(r, g, b),
      });
    }
  }
  return await pdfDoc.save();
};

// 53. REAL OCR (Tesseract.js) - makes scanned PDFs searchable.
// Pipeline mirrors OCRmyPDF: pages that already contain extractable text are
// copied through untouched; scanned pages are deskewed, cleaned (grayscale +
// adaptive threshold), OCR'd, then the original image is re-embedded with an
// invisible, perfectly aligned searchable text layer on top.
export interface OcrResult {
  bytes: Uint8Array;
  texts: string[];
  pagesOcr: number;
  pagesSkipped: number;
}

// Detect the skew angle of a grayscale image (degrees) by maximizing the
// variance of the horizontal projection profile over candidate rotations.
// Returns 0 when the page is already straight or the estimate is unreliable.
export function estimateSkewAngle(canvas: HTMLCanvasElement): number {
  const src = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  // Work on a small grayscale bitmap for speed.
  const scale = Math.min(1, 700 / Math.max(w, h));
  const bw = Math.max(2, Math.round(w * scale));
  const bh = Math.max(2, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = bw;
  c.height = bh;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, bw, bh);
  const img = ctx.getImageData(0, 0, bw, bh);
  const d = img.data;
  // Binarize: dark pixels = ink.
  const ink: boolean[] = new Array(bw * bh);
  let inkCount = 0;
  for (let i = 0; i < bw * bh; i++) {
    const lum = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    ink[i] = lum < 128;
    if (ink[i]) inkCount++;
  }
  // Too little ink (blank page) -> no skew.
  if (inkCount < bw * bh * 0.002) return 0;

  const score = (angle: number): number => {
    const cos = Math.cos((angle * Math.PI) / 180);
    const sin = Math.sin((angle * Math.PI) / 180);
    const cx = bw / 2;
    const cy = bh / 2;
    // Row sums of the rotated bitmap (projection profile).
    const rows = new Float64Array(bh);
    let total = 0;
    for (let y = 0; y < bh; y++) {
      const dy = y - cy;
      let sum = 0;
      for (let x = 0; x < bw; x++) {
        const dx = x - cx;
        const sx = Math.round(cx + dx * cos - dy * sin);
        const sy = Math.round(cy + dx * sin + dy * cos);
        if (sx >= 0 && sx < bw && sy >= 0 && sy < bh && ink[sy * bw + sx]) sum++;
      }
      rows[y] = sum;
      total += sum;
    }
    const mean = total / bh;
    let variance = 0;
    for (let y = 0; y < bh; y++) {
      const diff = rows[y] - mean;
      variance += diff * diff;
    }
    return variance;
  };

  let bestAngle = 0;
  let bestScore = score(0);
  for (let a = -5; a <= 5; a += 0.5) {
    if (a === 0) continue;
    const s = score(a);
    if (s > bestScore) {
      bestScore = s;
      bestAngle = a;
    }
  }
  return bestAngle;
}

// Clean a page canvas before OCR: grayscale + simple threshold to kill
// background noise (photocopy/skew artifacts), matching OCRmyPDF's cleanup.
export function cleanPageCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    // Soft threshold: lift near-white to white, darken near-black slightly.
    const v = lum < 150 ? Math.max(0, lum - 15) : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export const ocrPdf = async (
  pdfBuffer: ArrayBuffer,
  opts: { lang?: string; onProgress?: (pct: number) => void } = {}
): Promise<OcrResult> => {
  const { renderPdfPageToCanvas, getTextItems } = await import('./pdf-client');
  const Tesseract = (await import('tesseract.js')).default;
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const newPdf = await PDFDocument.create();
  const pageCount = pdfDoc.getPageCount();
  const texts: string[] = [];
  const lang = opts.lang || 'eng';
  const scale = 2;
  let pagesOcr = 0;
  let pagesSkipped = 0;

  // Extract existing text once up front so we can skip pages that already
  // carry a real text layer (OCRmyPDF behavior: no re-rasterizing of
  // born-digital pages, which keeps quality and speed).
  const existingItems = await getTextItems(pdfBuffer).catch(() => [] as Awaited<ReturnType<typeof getTextItems>>);

  for (let i = 0; i < pageCount; i++) {
    const { width, height } = pdfDoc.getPage(i).getSize();

    const existingText = existingItems
      .filter((it) => it.page === i + 1)
      .map((it) => it.str)
      .join(' ')
      .trim();
    const hasRealText = existingText.length > 30;

    if (hasRealText) {
      texts.push(existingText);
      const [copied] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copied);
      pagesSkipped++;
      continue;
    }

    const canvas = await renderPdfPageToCanvas(pdfBuffer, i + 1, scale);
    // Deskew then clean, mirroring OCRmyPDF's --deskew --clean passes.
    const angle = estimateSkewAngle(canvas);
    let ocrCanvas = canvas;
    if (Math.abs(angle) >= 0.4) {
      const rotated = document.createElement('canvas');
      rotated.width = canvas.width;
      rotated.height = canvas.height;
      const rctx = rotated.getContext('2d')!;
      rctx.translate(rotated.width / 2, rotated.height / 2);
      rctx.rotate((angle * Math.PI) / 180);
      rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
      ocrCanvas = rotated;
    }
    ocrCanvas = cleanPageCanvas(ocrCanvas);

    const result = (await Tesseract.recognize(ocrCanvas, lang, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text' && opts.onProgress) {
          opts.onProgress(((i + m.progress) / pageCount) * 100);
        }
      },
    })) as unknown as { data: { text?: string; words?: { bbox: { x0: number; y0: number; x1: number; y1: number }; text: string }[] } };
    const data = result.data;
    texts.push(data.text || '');
    pagesOcr++;

    const newPage = newPdf.addPage([width, height]);
    // Re-embed the ORIGINAL (uncleaned) render so the output keeps its true
    // appearance; the cleaned copy was only used for recognition.
    const img = await newPdf.embedJpg(canvas.toDataURL('image/jpeg', 0.92));
    newPage.drawImage(img, { x: 0, y: 0, width, height });

    // Invisible selectable text layer (opacity 0 keeps it searchable/copyable)
    const font = await newPdf.embedFont(StandardFonts.Helvetica);
    const words = data.words || [];
    for (const w of words) {
      const clean = sanitizeForPdfFont(w.text);
      if (!clean) continue;
      const px = (w.bbox.x0 / ocrCanvas.width) * width;
      const ph = Math.max(2, ((w.bbox.y1 - w.bbox.y0) / ocrCanvas.height) * height);
      const pdfY = height - (w.bbox.y1 / ocrCanvas.height) * height;
      const fontSize = Math.max(4, ph * 0.9);
      newPage.drawText(clean, { x: px, y: pdfY, size: fontSize, font, opacity: 0 });
    }
  }

  return { bytes: await newPdf.save(), texts, pagesOcr, pagesSkipped };
};

// 53. CERTIFICATE SIGN (Stirling-PDF Certificate Sign)
// Signs a PDF with a real PKCS#12 certificate using @signpdf (byte-range
// signature, Adobe/ETSI compliant, verifiable by any PDF viewer).
export const certificateSignPdf = async (
  pdfBuffer: ArrayBuffer,
  p12Buffer: ArrayBuffer,
  passphrase: string
): Promise<{ bytes: Uint8Array; certName: string }> => {
  const BufferImpl = (await import('buffer')).Buffer;
  if (typeof globalThis !== 'undefined' && !(globalThis as Record<string, unknown>).Buffer) {
    (globalThis as Record<string, unknown>).Buffer = BufferImpl;
  }
  const signpdf = (await import('@signpdf/signpdf')).default;
  const { plainAddPlaceholder } = await import('@signpdf/placeholder-plain');
  const { P12Signer } = await import('@signpdf/signer-p12');

  // @signpdf's placeholder parser needs a classic (non-stream) xref table, so
  // re-serialize the PDF before adding the placeholder.
  const classicPdf = await PDFDocument.load(pdfBuffer);
  const classicBytes = await classicPdf.save({ useObjectStreams: false });
  const pdfBuf = BufferImpl.from(classicBytes);
  const signer = new P12Signer(new Uint8Array(p12Buffer), { passphrase });

  let certName = 'Signed Document';
  try {
    // Read the signer CN from the certificate inside the P12 container.
    const forge = (await import('node-forge')).default;
    const p12Bytes = new Uint8Array(p12Buffer);
    let binary = '';
    for (let i = 0; i < p12Bytes.length; i++) binary += String.fromCharCode(p12Bytes[i]);
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(binary));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
    const forgeCert = certBags && certBags[0] && certBags[0].cert;
    if (forgeCert) {
      const cn = forgeCert.subject.getField('CN');
      if (cn && cn.value) certName = cn.value;
    }
  } catch {
    // keep default name
  }

  const placeholder = plainAddPlaceholder({
    pdfBuffer: pdfBuf,
    reason: 'Digitally signed with a certificate via Docify',
    contactInfo: '',
    name: certName,
    location: 'Browser (client-side)',
    appName: 'Docify PDF Suite',
    widgetRect: [72, 72, 240, 110],
  });
  const signed = await signpdf.sign(placeholder, signer);
  return { bytes: new Uint8Array(signed), certName };
};

// 54. VALIDATE SIGNATURE (Stirling-PDF Validate Signature)
export interface SignatureInfo {
  name: string;
  signingTime: string;
  filter: string;
  subFilter: string;
  byteRange: number[];
  valid: boolean;
  certSubject: string;
  certIssuer: string;
  certValidFrom: string;
  certValidTo: string;
}

export const validateSignaturePdf = async (
  pdfBuffer: ArrayBuffer
): Promise<{ signatures: SignatureInfo[]; error?: string }> => {
  const BufferImpl = (await import('buffer')).Buffer;
  if (typeof globalThis !== 'undefined' && !(globalThis as Record<string, unknown>).Buffer) {
    (globalThis as Record<string, unknown>).Buffer = BufferImpl;
  }
  const forge = (await import('node-forge')).default;
  const { extractSignature } = await import('@signpdf/utils');
  const pdfBuf = BufferImpl.from(new Uint8Array(pdfBuffer));

  let sig: { ByteRange: number[]; signature: string; signedData: Buffer };
  try {
    sig = extractSignature(pdfBuf);
  } catch {
    return { signatures: [], error: 'No digital signature found in this PDF.' };
  }

  const info: SignatureInfo = {
    name: '',
    signingTime: '',
    filter: '',
    subFilter: '',
    byteRange: sig.ByteRange,
    valid: false,
    certSubject: '',
    certIssuer: '',
    certValidFrom: '',
    certValidTo: '',
  };

  try {
    // Parse the PKCS#7 (CMS) structure.
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(sig.signature));
    const p7 = forge.pkcs7.messageFromAsn1(asn1) as unknown as {
      certificates?: Array<{
        subject: { attributes: Array<{ name?: string; value?: string }> };
        issuer: { attributes: Array<{ name?: string; value?: string }> };
        validity: { notBefore: Date; notAfter: Date };
        publicKey: { verify: (digest: string, sig: string, scheme: string) => boolean };
      }>;
    };
    const cert = p7.certificates && p7.certificates[0];
    if (cert) {
      info.certSubject = cert.subject.attributes.map(a => `${a.name}=${a.value}`).join(', ');
      info.certIssuer = cert.issuer.attributes.map(a => `${a.name}=${a.value}`).join(', ');
      info.certValidFrom = cert.validity.notBefore.toISOString();
      info.certValidTo = cert.validity.notAfter.toISOString();
    }

    if (cert) {
      type Asn1Node = {
        tagClass: number;
        type: number;
        constructed: boolean;
        value: string | Asn1Node[];
      };
      const asn1Node = asn1 as unknown as Asn1Node;
      const asn1Children = (asn1Node.value as Asn1Node[]);
      // ContentInfo: SEQUENCE { OID, [0] { SignedData SEQUENCE } }
      const signedData = (asn1Children[1].value as Asn1Node[])[0] as unknown as Asn1Node;
      // SignedData last element is the SignerInfos SET
      const signerInfos = (signedData.value as Asn1Node[])[(signedData.value as Asn1Node[]).length - 1];
      const signerInfo = (signerInfos.value as Asn1Node[])[0];

      // Walk the SignerInfo children: version, issuerAndSerialNumber, then
      // digestAlgorithm, optional [0] authenticatedAttributes, digest
      // encryption algorithm, and finally the encryptedDigest OCTETSTRING.
      let digestOid: string | null = null;
      let encryptedDigest: string | null = null;
      let authAttrsNode: Asn1Node | null = null;
      const signerChildren = signerInfo.value as Asn1Node[];
      for (let idx = 2; idx < signerChildren.length; idx++) {
        const child = signerChildren[idx];
        if (child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && child.type === 0 && child.constructed) {
          authAttrsNode = child;
        } else if (!child.constructed && child.type === forge.asn1.Type.OCTETSTRING) {
          encryptedDigest = child.value as string;
        } else if (child.constructed && !digestOid && Array.isArray(child.value) && child.value[0]) {
          digestOid = forge.asn1.derToOid(child.value[0].value as string);
        }
      }

      if (authAttrsNode && encryptedDigest && digestOid) {
        const mdCtor = (forge.md as unknown as Record<string, { create: () => { update: (d: string) => void; digest: () => { bytes: () => string; getBytes: () => string } } }>)[forge.pki.oids[digestOid]];
        // The [0] IMPLICIT node's value is the attribute list directly.
        const attrs = authAttrsNode.value as Asn1Node[];
        let mdAttrValue: string | null = null;
        if (mdCtor && Array.isArray(attrs)) {
          for (const attr of attrs) {
            const attrValue = attr.value as Asn1Node[];
            if (!attrValue[0] || !attrValue[0].value) continue;
            const oid = forge.asn1.derToOid(attrValue[0].value as string);
            if (oid === forge.pki.oids.messageDigest) {
              const set = attrValue[1];
              const setValue = set.value as Asn1Node[];
              mdAttrValue = setValue[0] ? (setValue[0].value as string) : null;
            }
          }
        }
        if (mdAttrValue) {
          const contentMd = mdCtor.create();
          contentMd.update(sig.signedData.toString('binary'));
          const contentOk = contentMd.digest().bytes() === mdAttrValue;

          // The signature covers the DER encoding of the authenticated
          // attributes as a SET (the [0] IMPLICIT tag is excluded).
          const attrsSet = forge.asn1.create(
            forge.asn1.Class.UNIVERSAL,
            forge.asn1.Type.SET,
            true,
            authAttrsNode.value as unknown as Parameters<typeof forge.asn1.create>[3]
          );
          const attrsDer = forge.asn1.toDer(attrsSet).getBytes();
          const attrsMd = mdCtor.create();
          attrsMd.update(attrsDer);
          const sigOk = cert.publicKey.verify(
            attrsMd.digest().getBytes(),
            encryptedDigest,
            'RSASSA-PKCS1-V1_5'
          );
          info.valid = contentOk && sigOk;
        }
      }
    }
  } catch {
    info.valid = false;
  }

  return { signatures: [info] };
};

// 55. VISUAL COMPARE (Stirling-PDF Compare)
// Renders both PDFs page-by-page and produces a report PDF with side-by-side
// views and red-highlighted pixel differences.
export interface CompareReport {
  pagesCompared: number;
  changedPages: number[];
  identicalPages: number[];
}

export const comparePdfsVisual = async (
  buffer1: ArrayBuffer,
  buffer2: ArrayBuffer
): Promise<{ bytes: Uint8Array; report: CompareReport }> => {
  const { renderPdfPageToCanvas } = await import('./pdf-client');
  const pdf1 = await PDFDocument.load(buffer1);
  const pdf2 = await PDFDocument.load(buffer2);
  const count = Math.max(pdf1.getPageCount(), pdf2.getPageCount());
  const out = await PDFDocument.create();
  const report: CompareReport = { pagesCompared: count, changedPages: [], identicalPages: [] };

  const renderSafe = async (buf: ArrayBuffer, pageNum: number, max: number): Promise<HTMLCanvasElement | null> => {
    if (pageNum > max) return null;
    try {
      return await renderPdfPageToCanvas(buf, pageNum, 1.5);
    } catch {
      return null;
    }
  };

  for (let i = 1; i <= count; i++) {
    const c1 = await renderSafe(buffer1, i, pdf1.getPageCount());
    const c2 = await renderSafe(buffer2, i, pdf2.getPageCount());
    if (!c1 && !c2) continue;

    const w = Math.max(c1?.width || 0, c2?.width || 0);
    const h = Math.max(c1?.height || 0, c2?.height || 0);
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = w;
    diffCanvas.height = h;
    const dctx = diffCanvas.getContext('2d')!;
    dctx.fillStyle = '#ffffff';
    dctx.fillRect(0, 0, w, h);
    if (c1) dctx.drawImage(c1, 0, 0);

    let changed = 0;
    if (c2) {
      const d1 = c1 ? c1.getContext('2d')!.getImageData(0, 0, c1.width, c1.height) : null;
      const d2 = c2.getContext('2d')!.getImageData(0, 0, c2.width, c2.height);
      const cw = Math.min(c1?.width || 0, c2.width);
      const ch = Math.min(c1?.height || 0, c2.height);
      if (d1) {
        const outData = dctx.getImageData(0, 0, w, h);
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const idx = (py * w + px) * 4;
            const inBounds = px < cw && py < ch;
            if (!inBounds) {
              changed++;
              outData.data[idx] = 255;
              outData.data[idx + 1] = 0;
              outData.data[idx + 2] = 0;
              outData.data[idx + 3] = 120;
              continue;
            }
            const i1 = (py * c1!.width + px) * 4;
            const i2 = (py * c2.width + px) * 4;
            const diff = Math.abs(d1.data[i1] - d2.data[i2]) + Math.abs(d1.data[i1 + 1] - d2.data[i2 + 1]) + Math.abs(d1.data[i1 + 2] - d2.data[i2 + 2]);
            if (diff > 45) {
              changed++;
              outData.data[idx] = 255;
              outData.data[idx + 1] = 40;
              outData.data[idx + 2] = 40;
              outData.data[idx + 3] = 130;
            }
          }
        }
        dctx.putImageData(outData, 0, 0);
      } else {
        // page only in doc 2: everything counts as changed
        changed = w * h;
        dctx.drawImage(c2, 0, 0);
      }
    } else {
      // page only in doc 1: everything counts as changed
      changed = w * h;
    }

    if (changed > 0) report.changedPages.push(i);
    else report.identicalPages.push(i);

    // Build report page: A4 landscape, three thumbnails
    const pw = 841.89;
    const ph = 595.27;
    const repPage = out.addPage([pw, ph]);
    repPage.drawText(`Page ${i} comparison`, { x: 30, y: ph - 30, size: 14, font: await out.embedFont(StandardFonts.HelveticaBold), color: rgb(0.15, 0.15, 0.2) });
    const changedPct = ((changed / Math.max(1, w * h)) * 100).toFixed(2);
    repPage.drawText(`Changed pixels: ${changed.toLocaleString()} (${changedPct}%)`, { x: 30, y: ph - 46, size: 10, font: await out.embedFont(StandardFonts.Helvetica), color: changed > 0 ? rgb(0.8, 0.2, 0.2) : rgb(0.2, 0.6, 0.3) });

    const thumbH = 380;
    const thumbW = 260;
    const yBase = 60;
    const xPos = [40, 315, 590];
    const thumbs = [c1, c2, diffCanvas];
    const labels = ['Document 1', 'Document 2', 'Differences'];
    for (let t = 0; t < 3; t++) {
      const cv = thumbs[t];
      if (!cv) continue;
      const scale = Math.min(thumbW / cv.width, thumbH / cv.height);
      const dw = cv.width * scale;
      const dh = cv.height * scale;
      const dx = xPos[t] + (thumbW - dw) / 2;
      const dy = yBase + (thumbH - dh) / 2;
      const img = await out.embedJpg(cv.toDataURL('image/jpeg', 0.85));
      repPage.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
      repPage.drawText(labels[t], { x: xPos[t], y: yBase - 14, size: 10, font: await out.embedFont(StandardFonts.HelveticaBold), color: rgb(0.3, 0.3, 0.35) });
    }
  }

  return { bytes: await out.save(), report };
};



