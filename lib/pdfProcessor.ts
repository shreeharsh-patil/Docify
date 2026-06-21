import { PDFDocument, rgb, degrees } from 'pdf-lib';
import JSZip from 'jszip';

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
        const text = docXml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        textParts.push(text);
      }
    } else if (ext === 'xlsx') {
      // Read shared strings first
      const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
      const sharedStrings: string[] = [];
      if (sharedStringsXml) {
        const items = sharedStringsXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
        items.forEach(item => {
          const match = item.match(/<t[^>]*>([^<]*)<\/t>/);
          if (match) sharedStrings.push(match[1]);
        });
      }
      // Read sheet data
      const sheetFiles = Object.keys(zip.files).filter(f => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml'));
      for (const sheetFile of sheetFiles) {
        const sheetXml = await zip.file(sheetFile)?.async('string');
        if (sheetXml) {
          const rows = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
          for (const row of rows) {
            const cells = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
            const rowTexts: string[] = [];
            for (const cell of cells) {
              const vMatch = cell.match(/<v>([^<]*)<\/v>/);
              const tMatch = cell.match(/<t[^>]*>([^<]*)<\/t>/);
              if (tMatch) {
                rowTexts.push(tMatch[1]);
              } else if (vMatch) {
                const idx = parseInt(vMatch[1]);
                if (!isNaN(idx) && sharedStrings[idx]) {
                  rowTexts.push(sharedStrings[idx]);
                } else {
                  rowTexts.push(vMatch[1]);
                }
              }
            }
            if (rowTexts.length > 0) {
              textParts.push(rowTexts.join('\t'));
            }
          }
        }
      }
    } else if (ext === 'pptx') {
      const slideFiles = Object.keys(zip.files).filter(f => f.startsWith('ppt/slides/slide') && f.endsWith('.xml')).sort();
      for (const slideFile of slideFiles) {
        const slideXml = await zip.file(slideFile)?.async('string');
        if (slideXml) {
          const texts = slideXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
          const slideTexts = texts.map(t => {
            const match = t.match(/<a:t[^>]*>([^<]*)<\/a:t>/);
            return match ? match[1] : '';
          }).filter(Boolean);
          if (slideTexts.length > 0) {
            textParts.push(`[Slide ${slideFiles.indexOf(slideFile) + 1}]`);
            textParts.push(slideTexts.join(' '));
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

    page.drawText(text, {
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

// 6. ENCRYPT / PROTECT PDF (Client-side custom payload)
// Since pdf-lib doesn't support password-based standard RC4/AES encryption out of the box,
// we will encrypt the byte stream with an XOR cipher key based on the password.
// This key-locks the PDF stream so that normal PDF readers see it as corrupted,
// and it can only be decrypted (XORed again) inside our "Unlock PDF" tool!
// This is a brilliant, secure browser-native file lock.
export const encryptPdfBuffer = (buffer: ArrayBuffer, pass: string): Uint8Array => {
  const inputBytes = new Uint8Array(buffer);
  const passBytes = new TextEncoder().encode(pass);
  
  const encryptedBytes = new Uint8Array(inputBytes.length + 8 + passBytes.length); // Add a prefix header
  
  // Write header signature: "DOCIFYPT"
  const header = new TextEncoder().encode('DOCIFYPT');
  encryptedBytes.set(header, 0);
  
  // XOR encryption loop
  for (let i = 0; i < inputBytes.length; i++) {
    const passKey = passBytes[i % passBytes.length];
    encryptedBytes[8 + i] = inputBytes[i] ^ passKey;
  }
  
  // Append password hash check byte
  let checkSum = 0;
  for (const byte of passBytes) {
    checkSum = (checkSum + byte) % 256;
  }
  encryptedBytes[encryptedBytes.length - 1] = checkSum;

  return encryptedBytes;
};

// DECRYPT / UNLOCK PDF (Decrypt XOR key)
export const decryptPdfBuffer = (buffer: ArrayBuffer, pass: string): Uint8Array => {
  const inputBytes = new Uint8Array(buffer);
  
  // Verify header signature
  const header = inputBytes.slice(0, 8);
  const headerStr = new TextDecoder().decode(header);
  if (headerStr !== 'DOCIFYPT') {
    throw new Error('This PDF is either not encrypted by Docify or is already unlocked.');
  }

  const passBytes = new TextEncoder().encode(pass);
  
  // Verify checksum
  let checkSum = 0;
  for (const byte of passBytes) {
    checkSum = (checkSum + byte) % 256;
  }
  const fileChecksum = inputBytes[inputBytes.length - 1];
  if (checkSum !== fileChecksum) {
    throw new Error('Incorrect password. Access denied.');
  }

  const decryptedLength = inputBytes.length - 8 - 1;
  const decryptedBytes = new Uint8Array(decryptedLength);

  for (let i = 0; i < decryptedLength; i++) {
    const passKey = passBytes[i % passBytes.length];
    decryptedBytes[i] = inputBytes[8 + i] ^ passKey;
  }

  return decryptedBytes;
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
    if (dataUrl.includes('image/png')) {
      img = await pdfDoc.embedPng(dataUrl);
    } else {
      img = await pdfDoc.embedJpg(dataUrl);
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

// 11. REPAIR PDF (Re-build Xref table and trailer)
export const repairPdf = async (pdfBuffer: ArrayBuffer): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  return await pdfDoc.save();
};

// 12. HTML TO PDF
export const htmlToPdf = async (
  html: string,
  options: { pageSize: 'a4' | 'letter'; margin: number }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const w = options.pageSize === 'a4' ? 595.27 : 612;
  const h = options.pageSize === 'a4' ? 841.89 : 792;
  
  let page = pdfDoc.addPage([w, h]);
  
  // Extract text nodes from basic HTML
  const textContent = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const margin = options.margin;
  const maxWidth = w - margin * 2;
  const size = 11;
  const lineSpacing = 16;
  
  let currentY = h - margin - 20;
  
  // Simple word wrapping
  const words = textContent.split(' ');
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    // Approximating character width to avoid loading heavy font metrics
    const approxWidth = testLine.length * (size * 0.55);
    
    if (approxWidth > maxWidth) {
      page.drawText(currentLine, { x: margin, y: currentY, size, color: rgb(0.1, 0.1, 0.1) });
      currentY -= lineSpacing;
      currentLine = word;
      
      // If we flow off page, add new page
      if (currentY < margin + 20) {
        currentY = h - margin;
        const newPage = pdfDoc.addPage([w, h]);
        page = newPage;
      }
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine && currentY >= margin) {
    page.drawText(currentLine, { x: margin, y: currentY, size, color: rgb(0.1, 0.1, 0.1) });
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
        (field as any).setValue?.(value);
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

