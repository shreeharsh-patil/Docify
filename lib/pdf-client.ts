async function getPdfjs() {
  return await import('pdfjs-dist');
}

async function getPdfDoc(buffer: ArrayBuffer) {
  const pdfjsLib = await getPdfjs();
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  return await loadingTask.promise;
}

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getPdfDoc(buffer);
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str ?? '' : '')).join(' ');
    pages.push(`--- Page ${i} ---\n${text}`);
  }
  return pages.join('\n\n');
}

export async function renderPdfPageToCanvas(
  buffer: ArrayBuffer,
  pageNum: number = 1,
  scale: number = 1.5
): Promise<HTMLCanvasElement> {
  const pdf = await getPdfDoc(buffer);
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

interface PageInfo {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
}

export async function getPdfPageInfos(buffer: ArrayBuffer): Promise<PageInfo[]> {
  const pdf = await getPdfDoc(buffer);
  const infos: PageInfo[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str ?? '' : '')).join(' ');
    const viewport = page.getViewport({ scale: 1 });
    infos.push({
      pageNumber: i,
      text,
      width: viewport.width,
      height: viewport.height,
    });
  }
  return infos;
}

export async function pdfToZipOfJpgs(buffer: ArrayBuffer): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
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
