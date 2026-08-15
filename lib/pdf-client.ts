async function getPdfjs() {
  return await import('pdfjs-dist');
}

async function getPdfDoc(buffer: ArrayBuffer) {
  const pdfjsLib = await getPdfjs();
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;
    }
  }
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) });
  return await loadingTask.promise;
}

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getPdfDoc(buffer);
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    let lastY: number | null = null;
    let lastX: number | null = null;

    for (const item of content.items) {
      if ('str' in item) {
        const text = item.str;
        if (!text) continue;
        const transform = item.transform;
        const y = transform ? transform[5] : null;
        const x = transform ? transform[4] : null;

        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
          pageText += '\n' + text;
        } else if (lastX !== null && x !== null && x - lastX > 30) {
          pageText += '\t' + text;
        } else {
          pageText += (pageText && !pageText.endsWith('\n') && !pageText.endsWith(' ') && !pageText.endsWith('\t') ? ' ' : '') + text;
        }
        if (y !== null) lastY = y;
        if (x !== null) lastX = x + (item.width || 0);
        if ((item as any).hasEOL) {
          pageText += '\n';
          lastY = null;
          lastX = null;
        }
      }
    }
    pages.push(`--- Page ${i} ---\n${pageText.trim()}`);
  }
  return pages.join('\n\n');
}

export async function renderPdfPageToCanvas(
  buffer: ArrayBuffer,
  pageNum: number = 1,
  scale: number = 1.5
): Promise<HTMLCanvasElement> {
  const pdf = await getPdfDoc(buffer);
  const safePageNum = Math.min(Math.max(1, pageNum), pdf.numPages || 1);
  const page = await pdf.getPage(safePageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const canvasContext = canvas.getContext('2d')!;
  // @ts-ignore
  await page.render({ canvasContext, viewport }).promise;
  return canvas;
}

export interface PageInfo {
  pageNumber: number;
  text: string;
  lines: string[];
  width: number;
  height: number;
}

export async function getPdfPageInfos(buffer: ArrayBuffer): Promise<PageInfo[]> {
  const pdf = await getPdfDoc(buffer);
  const infos: PageInfo[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    let lastY: number | null = null;
    let lastX: number | null = null;

    for (const item of content.items) {
      if ('str' in item) {
        const text = item.str;
        if (!text) continue;
        const transform = item.transform;
        const y = transform ? transform[5] : null;
        const x = transform ? transform[4] : null;

        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
          pageText += '\n' + text;
        } else if (lastX !== null && x !== null && x - lastX > 30) {
          pageText += '\t' + text;
        } else {
          pageText += (pageText && !pageText.endsWith('\n') && !pageText.endsWith(' ') && !pageText.endsWith('\t') ? ' ' : '') + text;
        }
        if (y !== null) lastY = y;
        if (x !== null) lastX = x + (item.width || 0);
        if ((item as any).hasEOL) {
          pageText += '\n';
          lastY = null;
          lastX = null;
        }
      }
    }
    const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
    const viewport = page.getViewport({ scale: 1 });
    infos.push({
      pageNumber: i,
      text: pageText.trim(),
      lines,
      width: viewport.width,
      height: viewport.height,
    });
  }
  return infos;
}

export async function pdfToZipOfJpgs(buffer: ArrayBuffer): Promise<Blob> {
  const jszipModule = await import('jszip');
  const JSZip = (jszipModule as any).default || jszipModule;
  const pdf = await getPdfDoc(buffer);
  const zip = new JSZip();

  for (let i = 1; i <= pdf.numPages; i++) {
    const canvas = await renderPdfPageToCanvas(buffer, i, 2);
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85);
    });
    zip.file(`page_${i}.jpg`, blob);
  }

  return await zip.generateAsync({ type: 'blob' });
}
