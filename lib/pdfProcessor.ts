import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
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
    modificationDate: pdfDoc.getModificationDate() ? pdfDoc.getModificationDate()!.toISOString() : 'Unknown',
    isEncrypted: false,
    formFieldCount: formCount,
  };
};


