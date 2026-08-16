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

export interface TextItemPosition {
  page: number;
  x: number;
  y: number;
  str: string;
  width: number;
  height: number;
}

// Structured text extraction (per-item position) used for CSV/table export.
export async function getTextItems(buffer: ArrayBuffer): Promise<TextItemPosition[]> {
  const pdf = await getPdfDoc(buffer);
  const items: TextItemPosition[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const ti = item as unknown as {
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
      };
      if (!ti || !ti.str) continue;
      const transform = ti.transform;
      items.push({
        page: i,
        x: transform ? transform[4] : 0,
        y: transform ? transform[5] : 0,
        str: ti.str,
        width: ti.width || 0,
        height: ti.height || 0,
      });
    }
  }
  return items;
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

export interface TextOverlayItem {
  str: string;
  x: number; // PDF user-space left edge (bottom-left origin)
  y: number; // PDF user-space baseline (bottom-left origin)
  width: number; // PDF points
  height: number; // PDF points (approx. font size)
  cssLeft: number; // rendered-viewport top-left X, CSS px at scale 1
  cssTop: number; // rendered-viewport top-left Y, CSS px at scale 1
  cssWidth: number;
  cssHeight: number;
  fontSize: number; // CSS px at scale 1 (≈ PDF font size)
}

// Text items pre-mapped to rendered-viewport (top-left) coordinates so they can
// be overlaid directly onto a page rendered at `scale` via renderPdfPageToCanvas.
// Also carries the original user-space coords needed to redraw edited text.
export async function getTextOverlayItems(
  buffer: ArrayBuffer,
  pageNum: number,
  scale: number = 2
): Promise<TextOverlayItem[]> {
  const pdf = await getPdfDoc(buffer);
  const safePage = Math.min(Math.max(1, pageNum), pdf.numPages || 1);
  const page = await pdf.getPage(safePage);
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent();
  const out: TextOverlayItem[] = [];

  for (const raw of content.items) {
    const item = raw as unknown as {
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
    };
    if (!item || !item.str) continue;
    const str = item.str;
    if (!str.trim()) continue;
    const t = item.transform || [1, 0, 0, 1, 0, 0];
    const x = t[4];
    const y = t[5];
    const w = item.width || 0;
    const h = item.height || 0;
    if (w <= 1 || h <= 1) continue;

    // Convert the text box corners (user space, bottom-left origin) into the
    // rendered viewport so rotated pages still line up correctly.
    const p0 = viewport.convertToViewportPoint(x, y);
    const p1 = viewport.convertToViewportPoint(x + w, y);
    const p2 = viewport.convertToViewportPoint(x, y + h);
    const p3 = viewport.convertToViewportPoint(x + w, y + h);
    const xs = [p0[0], p1[0], p2[0], p3[0]];
    const ys = [p0[1], p1[1], p2[1], p3[1]];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    out.push({
      str,
      x,
      y,
      width: w,
      height: h,
      cssLeft: minX / scale,
      cssTop: minY / scale,
      cssWidth: Math.max(4, (maxX - minX) / scale),
      cssHeight: Math.max(4, (maxY - minY) / scale),
      fontSize: Math.min(144, Math.max(5, h / scale)),
    });
  }
  return out;
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
