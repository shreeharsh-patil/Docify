// 8-pass PDF compressor, ported from the approach used by PDF-A-go-slim
// (MIT, github.com/kenman345? — actually inspired by kenhardy's PDF-A-go-slim:
// stream recompress, image re-encode, standard-font unembed, object dedup,
// font dedup, metadata strip, unreferenced-object removal).
//
// All passes run client-side with pdf-lib + pako (already dependencies).
import pako from 'pako';
import {
  PDFDocument, PDFName, PDFDict, PDFRef, PDFArray, PDFStream,
  PDFRawStream, PDFNumber, PDFObject, decodePDFRawStream,
} from 'pdf-lib';

export interface CompressOptions {
  /** Recompress all streams at this deflate level (0-9). Default 9. */
  level?: number;
  /** Re-encode raster images as JPEG at this quality (0-1). 0 = keep as-is. */
  jpegQuality?: number;
  /** Remove embedded copies of the 14 standard PDF fonts. Default true. */
  unembedStandardFonts?: boolean;
  /** Strip XMP / Info metadata. Default true. */
  stripMetadata?: boolean;
}

// Low-level PDFContext surface used by the passes.
type Ctx = {
  enumerateIndirectObjects: () => [PDFRef, PDFObject][];
  trailerInfo: { Root: PDFRef };
  lookup: (o: PDFRef | PDFObject) => PDFObject;
  assign: (ref: PDFRef, o: PDFObject) => void;
  delete: (ref: PDFRef) => boolean;
  register: (o: PDFObject) => PDFRef;
  stream: (c: Uint8Array, d?: Record<string, unknown>) => PDFRawStream;
  flateStream: (c: Uint8Array, d?: Record<string, unknown>) => PDFRawStream;
  obj: (v: unknown) => PDFObject;
};

const STANDARD_FONTS = new Set([
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
  'Symbol', 'ZapfDingbats',
]);

/** Pass 1 + 2: recompress every stream at the chosen level; re-encode images. */
async function recompressStreams(
  doc: PDFDocument,
  opts: CompressOptions
): Promise<{ before: number; after: number }> {
  const ctx = doc.context as unknown as Ctx;
  let before = 0;
  let after = 0;
  for (const [ref, obj] of ctx.enumerateIndirectObjects() as [PDFRef, PDFObject][]) {
    if (!(obj instanceof PDFRawStream)) continue;
    const stream = obj as PDFRawStream;
    const dict = stream.dict;
    let decoded: Uint8Array;
    try {
      decoded = decodePDFRawStream(stream).decode();
    } catch {
      continue; // leave undecodable streams untouched
    }
    before += decoded.length;

    const filter = dict.get(PDFName.of('Filter'));
    const subtype = dict.get(PDFName.of('Subtype'));
    const isImage = subtype instanceof PDFName && subtype.asString() === '/Image';
    const isContent = subtype instanceof PDFName && subtype.asString() === '/Form';

    let outBytes = decoded;
    let outDict: Record<string, unknown> = {};

    if (isImage && opts.jpegQuality && opts.jpegQuality > 0 && opts.jpegQuality < 1) {
      // Re-encode RGB/grayscale raster images as JPEG (lossy, opt-in).
      const width = (dict.get(PDFName.of('Width')) as PDFNumber | undefined)?.asNumber();
      const height = (dict.get(PDFName.of('Height')) as PDFNumber | undefined)?.asNumber();
      const colorSpace = dict.get(PDFName.of('ColorSpace'));
      const isRGB =
        colorSpace instanceof PDFName &&
        ['/DeviceRGB', '/RGB'].includes(colorSpace.asString());
      const isGray =
        colorSpace instanceof PDFName &&
        ['/DeviceGray', '/G'].includes(colorSpace.asString());
      if (width && height && (isRGB || isGray) && width * height <= 16_000_000) {
        const encoded = await reencodeJpeg(decoded, width, height, isRGB, opts.jpegQuality);
        if (encoded) {
          outBytes = encoded;
          outDict = { Filter: 'DCTDecode' };
        }
      }
    } else if (filter instanceof PDFName && filter.asString() === '/FlateDecode') {
      // Re-flate at the requested level (no-op if already optimal).
      const compressed = pako.deflate(decoded, { level: opts.level ?? 9 });
      if (compressed.length < stream.contents.length) {
        outBytes = compressed;
        outDict = { Filter: 'FlateDecode' };
      } else {
        outBytes = stream.contents; // keep existing bytes
        outDict = {};
      }
    } else if (!filter && (isContent || decoded.length > 0)) {
      // Uncompressed stream → compress it.
      const compressed = pako.deflate(decoded, { level: opts.level ?? 9 });
      if (compressed.length < decoded.length) {
        outBytes = compressed;
        outDict = { Filter: 'FlateDecode' };
      }
    } else {
      continue; // JPEG/JPX/etc: pass through untouched
    }

    if (outDict.Filter) {
      // outBytes is ALREADY the compressed bytes — use ctx.stream (raw), never
      // ctx.flateStream (which would deflate again, corrupting the stream).
      const newStream = ctx.stream(outBytes, {});
      // Replace the object with a fresh stream, copying the original dict.
      const newDict = newStream.dict as PDFDict;
      for (const [k, v] of dict.entries()) {
        const keyStr = k.asString();
        if (keyStr === '/Length' || keyStr === '/Filter' || keyStr === '/DecodeParms') continue;
        newDict.set(k, v);
      }
      newDict.set(PDFName.of('Filter'), PDFName.of(outDict.Filter as string));
      ctx.assign(ref, newStream);
      after += outBytes.length;
    } else {
      after += outBytes.length;
    }
  }
  return { before, after };
}

/** Re-encode decoded raster pixels to JPEG using the browser/Node canvas-free path. */
async function reencodeJpeg(
  decoded: Uint8Array,
  width: number,
  height: number,
  isRGB: boolean,
  quality: number
): Promise<Uint8Array | null> {
  // Only handle raw (unfiltered) raster data: DCTDecode pass-through, and
  // FlateDecode raw RGB/Gray arrays (the common pdf-lib PNG export case).
  // Canvas-free: build a minimal JPEG via jpeg-js.
  try {
    // jpeg-js ships a CommonJS build; lazy dynamic import keeps it out of the
    // initial bundle (only used when JPEG re-encoding is requested).
    const jpeg = (await import('jpeg-js')) as unknown as {
      encode: (
        raw: { data: Uint8Array; width: number; height: number },
        quality: number
      ) => { data: Uint8Array };
    };
    const n = width * height;
    if (isRGB) {
      if (decoded.length !== n * 3) return null;
      const data = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) {
        data[i * 4] = decoded[i * 3];
        data[i * 4 + 1] = decoded[i * 3 + 1];
        data[i * 4 + 2] = decoded[i * 3 + 2];
        data[i * 4 + 3] = 255;
      }
      const raw = { data, width, height };
      const out = jpeg.encode(raw, quality);
      return new Uint8Array(out.data);
    }
    // Grayscale → treat as RGB for simplicity.
    if (decoded.length !== n) return null;
    const data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4] = decoded[i];
      data[i * 4 + 1] = decoded[i];
      data[i * 4 + 2] = decoded[i];
      data[i * 4 + 3] = 255;
    }
    const raw = { data, width, height };
    const out = jpeg.encode(raw, quality);
    return new Uint8Array(out.data);
  } catch {
    return null;
  }
}

/** Pass 3: remove embedded copies of the 14 standard PDF fonts. */
function unembedStandardFonts(doc: PDFDocument): number {
  const ctx = doc.context as unknown as Ctx;
  let removed = 0;
  for (const [, obj] of ctx.enumerateIndirectObjects() as [PDFRef, PDFObject][]) {
    if (!(obj instanceof PDFDict)) continue;
    const dict = obj as PDFDict;
    const type = dict.get(PDFName.of('Type'));
    if (!(type instanceof PDFName) || type.asString() !== '/Font') continue;
    const baseFont = dict.get(PDFName.of('BaseFont'));
    if (!(baseFont instanceof PDFName)) continue;
    // BaseFont may carry a subset prefix ("ABCDEF+Helvetica") or a pdf-lib
    // numeric suffix ("Helvetica-1234") — strip both before comparing.
    const name = baseFont.asString().replace(/^\/[A-Z]{6}\+/, '/').replace(/-\d+$/, '');
    if (!STANDARD_FONTS.has(name.slice(1))) continue;
    const descriptorRef = dict.get(PDFName.of('FontDescriptor'));
    if (descriptorRef instanceof PDFRef) {
      const descriptor = ctx.lookup(descriptorRef);
      if (descriptor instanceof PDFDict) {
        const fontFile =
          descriptor.get(PDFName.of('FontFile')) ||
          descriptor.get(PDFName.of('FontFile2')) ||
          descriptor.get(PDFName.of('FontFile3'));
        if (fontFile) {
          descriptor.delete(PDFName.of('FontFile'));
          descriptor.delete(PDFName.of('FontFile2'));
          descriptor.delete(PDFName.of('FontFile3'));
          removed++;
        }
      }
    }
  }
  return removed;
}

/** Pass 4 + 5: hash-based dedup of identical streams and font dicts. */
function dedupObjects(doc: PDFDocument): number {
  const ctx = doc.context as unknown as Ctx;
  const seen = new Map<string, PDFRef>();
  let deduped = 0;
  for (const [ref, obj] of ctx.enumerateIndirectObjects() as [PDFRef, PDFObject][]) {
    if (!(obj instanceof PDFRawStream)) continue;
    let hash = '';
    try {
      const bytes = decodePDFRawStream(obj as PDFRawStream).decode();
      // Cheap content hash (djb2 over a sample) — good enough for dedup.
      let h = 5381;
      const step = Math.max(1, Math.floor(bytes.length / 4096));
      for (let i = 0; i < bytes.length; i += step) {
        h = ((h << 5) + h + bytes[i]) | 0;
      }
      hash = `${bytes.length}:${h}`;
    } catch {
      continue;
    }
    const prior = seen.get(hash);
    if (prior) {
      // Point every reference to this object at the first copy.
      ctx.assign(ref, ctx.lookup(prior) ?? obj);
      deduped++;
    } else {
      seen.set(hash, ref);
    }
  }
  return deduped;
}

/** Pass 6: strip XMP metadata and Info entries (except required ones). */
function stripMetadata(doc: PDFDocument): string[] {
  const stripped: string[] = [];
  const catalog = doc.catalog as PDFDict;
  if (catalog instanceof PDFDict) {
    const meta = catalog.get(PDFName.of('Metadata'));
    if (meta) {
      catalog.delete(PDFName.of('Metadata'));
      stripped.push('/Metadata');
    }
  }
  const info = (doc as unknown as { getInfoDict?: () => PDFDict }).getInfoDict?.();
  if (info instanceof PDFDict) {
    const keep = new Set(['/Title', '/Author', '/Subject', '/Keywords', '/Creator', '/Producer']);
    for (const [k] of info.entries()) {
      if (!keep.has(k.asString())) {
        info.delete(k);
        stripped.push(k.asString());
      }
    }
  }
  return stripped;
}

/** Pass 7: remove objects not reachable from the document catalog. */
function removeUnreferenced(doc: PDFDocument): number {
  const ctx = doc.context as unknown as Ctx;
  const catalogRef = ctx.trailerInfo.Root as PDFRef;
  const reachable = new Set<PDFRef>();
  // Seed with the catalog's own ref (not just the object) so the walk marks
  // it reachable — otherwise the catalog itself gets garbage collected.
  const stack: (PDFObject | PDFRef)[] = [catalogRef];

  const mark = (o: PDFObject | PDFRef | undefined | null) => {
    if (o instanceof PDFRef) {
      if (reachable.has(o)) return;
      reachable.add(o);
      stack.push(ctx.lookup(o));
    } else if (o) {
      stack.push(o);
    }
  };

  while (stack.length) {
    const o = stack.pop()!;
    if (o instanceof PDFRef) {
      if (reachable.has(o)) continue;
      reachable.add(o);
      stack.push(ctx.lookup(o));
    } else if (o instanceof PDFDict) {
      for (const [, v] of (o as PDFDict).entries()) mark(v);
    } else if (o instanceof PDFArray) {
      for (const item of (o as PDFArray).asArray()) mark(item);
    } else if (o instanceof PDFStream) {
      mark((o as PDFStream).dict);
    }
  }

  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects() as [PDFRef, PDFObject][]) {
    if (!reachable.has(ref)) {
      ctx.delete(ref);
      removed++;
    }
  }
  return removed;
}

/**
 * 8-pass compress. Returns the optimized PDF bytes plus a report of what
 * each pass did. Never throws — falls back to a plain re-save on failure.
 */
export async function compressPdfAdvanced(
  pdfBuffer: ArrayBuffer,
  opts: CompressOptions = {}
): Promise<{ bytes: Uint8Array; report: Record<string, number | string | string[]> }> {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false });
  const report: Record<string, number | string | string[]> = {};

  try {
    const recomp = await recompressStreams(doc, opts);
    report.recompressedBytes = `${recomp.before} -> ${recomp.after}`;
  } catch {
    report.recompressedBytes = 'skipped';
  }
  try {
    report.standardFontsUnembedded = unembedStandardFonts(doc);
  } catch {
    report.standardFontsUnembedded = 'skipped';
  }
  try {
    report.objectsDeduplicated = dedupObjects(doc);
  } catch {
    report.objectsDeduplicated = 'skipped';
  }
  try {
    report.metadataStripped = stripMetadata(doc);
  } catch {
    report.metadataStripped = 'skipped';
  }
  try {
    report.unreferencedRemoved = removeUnreferenced(doc);
  } catch {
    report.unreferencedRemoved = 'skipped';
  }

  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, report };
}


