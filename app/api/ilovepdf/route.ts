import { NextRequest, NextResponse } from 'next/server';
import { processWithILovePDF, getKeyPairs } from '@/lib/ilovepdf-service';

export async function POST(req: NextRequest) {
  try {
    const pairs = getKeyPairs();
    if (pairs.length === 0) {
      return NextResponse.json(
        { error: 'iLovePDF API keys not configured. Get free keys at https://developer.ilovepdf.com and set ILOVEPDF_PUBLIC_KEY_1 / ILOVEPDF_SECRET_KEY_1 in .env.local' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const tool = formData.get('tool') as string;
    const filesRaw = formData.getAll('files') as File[];
    const optionsRaw = formData.get('options') as string | null;

    if (!tool || filesRaw.length === 0) {
      return NextResponse.json({ error: 'Missing tool or files' }, { status: 400 });
    }

    const options = optionsRaw ? JSON.parse(optionsRaw) : undefined;

    const ilovepdfTool = tool
      .replace('word-to-pdf', 'officepdf')
      .replace('excel-to-pdf', 'officepdf')
      .replace('ppt-to-pdf', 'officepdf')
      .replace('jpg-to-pdf', 'imagepdf')
      .replace('pdf-to-jpg', 'pdfjpg')
      .replace('pdf-to-word', 'pdfextract')
      .replace('pdf-to-excel', 'pdfextract')
      .replace('pdf-to-ppt', 'pdfextract')
      .replace('pdf-to-pdfa', 'pdfa')
      .replace('compress', 'compress')
      .replace('repair', 'repair')
      .replace('merge', 'merge')
      .replace('split', 'split')
      .replace('rotate', 'rotate')
      .replace('watermark', 'watermark')
      .replace('protect', 'protect')
      .replace('unlock', 'unlock')
      .replace('ocr', 'pdfocr')
      .replace('page-numbers', 'pagenumber')
      .replace('html-to-pdf', 'htmlpdf')
      .replace('remove-pages', 'extract')
      .replace('extract-pages', 'extract')
      .replace('ai-summarizer', 'summarize')
      .replace('redact', 'editpdf')
      .replace('pdf-to-markdown', 'pdfmarkdown')
      .replace('validate-pdfa', 'validatepdfa');

    const fileBuffers = await Promise.all(
      filesRaw.map(async (f) => ({
        buffer: await f.arrayBuffer(),
        name: f.name,
      }))
    );

    const result = await processWithILovePDF({
      tool: ilovepdfTool,
      files: fileBuffers,
      options,
    });

    const ext = ilovepdfTool === 'pdfjpg' || ilovepdfTool === 'pdfextract' ? 'zip' : 'pdf';
    const contentType = ext === 'zip' ? 'application/zip' : 'application/pdf';

    return new NextResponse(result.buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
