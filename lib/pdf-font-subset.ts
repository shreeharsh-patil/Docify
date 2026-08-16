// PDF font subsetting via harfbuzz hb-subset (WASM).
//
// Strategy (mirrors how qpdf/PDF-A-go-slim subset embedded fonts):
//   1. Parse each page's content stream and record every character code shown
//      with each font (tracking `/F1 12 Tf` state across `Tj`/`TJ`/'/'"' ops).
//   2. For each embedded TrueType/CFF font, map those char codes to either
//      glyph IDs (Identity-H/V composite fonts, where code === glyph ID) or
//      Unicode (via the font's ToUnicode CMap).
//   3. Run hb-subset with HB_SUBSET_FLAGS_RETAIN_GIDS so the produced font
//      keeps the same glyph indices — the PDF's /Widths, /Encoding and
//      ToUnicode CMap therefore stay valid and only the font program shrinks.
//
// hb-subset.wasm is served from /wasm/hb-subset.wasm (public/wasm/). The wasm
// is lazy-loaded, and fonts that can't be safely mapped are left untouched.
import {
  PDFDocument, PDFName, PDFDict, PDFRef, PDFArray, PDFStream,
  PDFRawStream, PDFObject, PDFNumber, decodePDFRawStream,
} from 'pdf-lib';

const latin1Decode = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
};

interface Hbs {
  malloc: (n: number) => number;
  free: (p: number) => void;
  hb_subset_input_create_or_fail: () => number;
  hb_subset_input_destroy: (i: number) => void;
  hb_subset_input_unicode_set: (i: number) => number;
  hb_subset_input_glyph_set: (i: number) => number;
  hb_subset_input_set_flags: (i: number, f: number) => void;
  hb_subset_input_get_flags: (i: number) => number;
  hb_blob_create: (d: number, l: number, mode: number, ctx: number, destroy: number) => number;
  hb_blob_destroy: (b: number) => void;
  hb_blob_get_data: (b: number, l: number) => number;
  hb_blob_get_length: (b: number) => number;
  hb_face_create: (blob: number, index: number) => number;
  hb_face_destroy: (f: number) => void;
  hb_face_reference_blob: (f: number) => number;
  hb_set_add: (set: number, v: number) => void;
  hb_set_destroy: (set: number) => void;
  hb_subset_or_fail: (face: number, input: number) => number;
}

interface LoadedHbs extends Hbs {
  heapu8: Uint8Array;
}

let hbsPromise: Promise<LoadedHbs> | null = null;

async function loadHbs(): Promise<LoadedHbs> {
  if (!hbsPromise) {
    hbsPromise = (async () => {
      const isNode = typeof process !== 'undefined' && !!process.versions?.node;
      let wasmBytes: Uint8Array;
      if (isNode) {
        // Node test path: locate the wasm beside the package.
        const { readFile } = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        const wasmPath = fileURLToPath(
          new URL('../node_modules/harfbuzzjs/hb-subset.wasm', import.meta.url)
        );
        wasmBytes = new Uint8Array(await readFile(wasmPath));
      } else {
        const res = await fetch('/wasm/hb-subset.wasm');
        wasmBytes = new Uint8Array(await res.arrayBuffer());
      }
      const instance = (await WebAssembly.instantiate(wasmBytes, {})) as unknown as {
        instance: { exports: Record<string, unknown> };
      };
      const hbs = instance.instance.exports as unknown as Hbs;
      // The wasm memory can grow; read the buffer fresh on each call instead
      // of caching it, and re-wrap the exported functions with a heap view.
      const mem = hbs as unknown as { memory: WebAssembly.Memory };
      const heapu8 = (): Uint8Array => new Uint8Array(mem.memory.buffer);
      const wrapped: LoadedHbs = {
        ...hbs,
        get heapu8() {
          return heapu8();
        },
      };
      return wrapped;
    })();
  }
  return hbsPromise;
}

// TrueType fonts are structured; all we need is the raw font program bytes.
function decodeFontFileBytes(stream: PDFStream): Uint8Array | null {
  try {
    return decodePDFRawStream(stream as PDFRawStream).decode();
  } catch {
    return null;
  }
}

/** Parse a ToUnicode CMap (bfchar/bfrange) into a Map<code, codepoint>. */
function parseToUnicode(cmap: PDFStream): Map<number, number> {
  const bytes = decodeFontFileBytes(cmap);
  if (!bytes) return new Map();
  const str = latin1Decode(bytes);
  const map = new Map<number, number>();
  // <0001> <0041>   (bfchar)
  const bfchar = /<([0-9A-Fa-f]{2,4})>\s*<([0-9A-Fa-f]{2,4})>/g;
  let m: RegExpExecArray | null;
  while ((m = bfchar.exec(str))) {
    map.set(parseInt(m[1], 16), parseInt(m[2], 16));
  }
  // <0041> <0044> <0041>  (bfrange, single dst) — also handles array dst via 3rd group
  const bfrange = /<([0-9A-Fa-f]{2,4})>\s*<([0-9A-Fa-f]{2,4})>\s*<([0-9A-Fa-f]{2,4})>/g;
  while ((m = bfrange.exec(str))) {
    const lo = parseInt(m[1], 16);
    const hi = parseInt(m[2], 16);
    const dst = parseInt(m[3], 16);
    for (let c = lo; c <= hi; c++) map.set(c, dst + (c - lo));
  }
  return map;
}

/** Check if a font's CMap/Encoding maps char codes directly to glyph IDs. */
function isIdentityEncoding(fontDict: PDFDict, ctx: { lookup: (o: PDFRef | PDFObject) => unknown }): boolean {
  const enc = fontDict.get(PDFName.of('Encoding'));
  if (enc instanceof PDFName) {
    const name = enc.asString();
    return name === '/Identity-H' || name === '/Identity-V';
  }
  if (enc instanceof PDFRef) {
    const obj = ctx.lookup(enc) as PDFDict | undefined;
    if (obj instanceof PDFDict) {
      const base = obj.get(PDFName.of('BaseEncoding'));
      if (base instanceof PDFName && (base.asString() === '/Identity-H' || base.asString() === '/Identity-V')) {
        return true;
      }
    }
  }
  return false;
}

// Minimal PDF content-stream tokenizer: finds text-showing operators and the
// font resource active at each one, plus the raw string operands.
interface TextRun {
  fontName: string | null;
  codes: number[];
}

function parseContentForText(content: string): TextRun[] {
  const runs: TextRun[] = [];
  // Lexer: scan for `(str)` or `<hex>` string literals, `/Name` names, numbers,
  // and operators Tf / Tj / TJ / ' / ".
  const re = /(\/[A-Za-z0-9_!#$%&*+\-./:;=?@\\^`|~]+|\()|<([0-9A-Fa-f\s]+)>|(Tf|Tj|TJ|'|")/g;
  let currentFont: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m[1] && m[1].startsWith('/')) {
      // Could be a font name or another name; only treat as font when followed
      // by a number and Tf — handled below by peeking.
      const peek = content.slice(re.lastIndex).match(/^\s*[-\d.]+\s+Tf\b/);
      if (peek) {
        currentFont = m[1].slice(1);
      }
    } else if (m[2] !== undefined) {
      // Hex string — bytes as-is.
      const hex = m[2].replace(/\s+/g, '');
      const codes: number[] = [];
      for (let i = 0; i + 1 < hex.length; i += 2) codes.push(parseInt(hex.slice(i, i + 2), 16));
      runs.push({ fontName: currentFont, codes });
    } else if (m[1] !== undefined) {
      // Literal string `(...)`.
      const raw = m[1].slice(1);
      const codes: number[] = [];
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '\\') {
          const nxt = raw[i + 1];
          if (nxt === 'n') { codes.push(10); i++; }
          else if (nxt === 'r') { codes.push(13); i++; }
          else if (nxt === 't') { codes.push(9); i++; }
          else if (nxt === 'b') { codes.push(8); i++; }
          else if (nxt === 'f') { codes.push(12); i++; }
          else if (nxt === '(' || nxt === ')' || nxt === '\\') { codes.push(nxt.charCodeAt(0)); i++; }
          else if (nxt >= '0' && nxt <= '7') {
            let oct = nxt;
            i++;
            for (let k = 0; k < 2 && raw[i + 1] >= '0' && raw[i + 1] <= '7'; k++) { oct += raw[++i]; }
            codes.push(parseInt(oct, 8));
          }
        } else {
          codes.push(ch.charCodeAt(0));
        }
      }
      runs.push({ fontName: currentFont, codes });
    }
  }
  return runs;
}

/** Collect used char codes per font resource name from all pages. */
function collectUsedCodes(doc: PDFDocument): Map<string, Set<number>> {
  const used = new Map<string, Set<number>>();
  const pages = doc.getPages();
  for (const page of pages) {
    const contents = (page.node as unknown as { Contents: () => PDFRef | PDFStream | PDFArray | undefined }).Contents();
    if (!contents) continue;
    const ctx = doc.context as unknown as { lookup: (o: PDFRef | PDFObject) => unknown };
    const streams: PDFStream[] = [];
    if (contents instanceof PDFArray) {
      for (let i = 0; i < (contents as PDFArray).size(); i++) {
        const s = ctx.lookup(contents.get(i) as PDFRef) as PDFStream | undefined;
        if (s instanceof PDFStream) streams.push(s);
      }
    } else if (contents instanceof PDFRef) {
      const s = ctx.lookup(contents) as PDFStream | undefined;
      if (s instanceof PDFStream) streams.push(s);
    } else if (contents instanceof PDFStream) {
      streams.push(contents);
    }
    let combined = '';
    for (const s of streams) {
      try {
        combined += latin1Decode(decodePDFRawStream(s as PDFRawStream).decode());
      } catch {
        /* skip undecodable */
      }
    }
    for (const run of parseContentForText(combined)) {
      if (!run.fontName) continue;
      let set = used.get(run.fontName);
      if (!set) {
        set = new Set();
        used.set(run.fontName, set);
      }
      for (const c of run.codes) set.add(c);
    }
  }
  return used;
}

/** Subset a font program; returns new font bytes or null on failure. */
async function subsetFontBytes(
  fontBytes: Uint8Array,
  mode: 'unicode' | 'glyphs',
  values: Set<number>
): Promise<Uint8Array | null> {
  const hbs = await loadHbs();
  try {
    const input = hbs.hb_subset_input_create_or_fail();
    if (!input) return null;
    try {
      // RETAIN_GIDS: keep glyph indices stable so the PDF's encoding/widths
      // remain valid. NO_LAYOUT_CLOSURE avoids pulling in extra glyphs.
      const flags = hbs.hb_subset_input_get_flags(input) | 0x00000002 | 0x00000200;
      hbs.hb_subset_input_set_flags(input, flags);

      const set =
        mode === 'unicode'
          ? hbs.hb_subset_input_unicode_set(input)
          : hbs.hb_subset_input_glyph_set(input);
      for (const v of values) hbs.hb_set_add(set, v);

      const bufPtr = hbs.malloc(fontBytes.byteLength);
      hbs.heapu8.set(fontBytes, bufPtr);
      const blob = hbs.hb_blob_create(bufPtr, fontBytes.byteLength, 2, 0, 0);
      const face = hbs.hb_face_create(blob, 0);
      hbs.hb_blob_destroy(blob);

      const subsetFace = hbs.hb_subset_or_fail(face, input);
      hbs.hb_face_destroy(face);
      if (!subsetFace) {
        hbs.free(bufPtr);
        return null;
      }

      const outBlob = hbs.hb_face_reference_blob(subsetFace);
      const outLen = hbs.hb_blob_get_length(outBlob);
      const outPtr = hbs.hb_blob_get_data(outBlob, 0);
      const outBytes = new Uint8Array(outLen);
      outBytes.set(hbs.heapu8.subarray(outPtr, outPtr + outLen));

      hbs.hb_blob_destroy(outBlob);
      hbs.hb_face_destroy(subsetFace);
      hbs.free(bufPtr);
      return outBytes.length > 0 ? outBytes : null;
    } finally {
      hbs.hb_subset_input_destroy(input);
    }
  } catch {
    return null;
  }
}

/**
 * Subset all embedded fonts in the PDF down to the glyphs actually used.
 * Returns the optimized bytes and a per-font report. Never throws — fonts
 * that can't be safely subset are kept as-is.
 */
export async function subsetPdfFonts(
  pdfBuffer: ArrayBuffer,
  opts: { onProgress?: (pct: number) => void } = {}
): Promise<{ bytes: Uint8Array; subsetted: number; skipped: number; report: string[] }> {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const ctx = doc.context as unknown as { lookup: (o: PDFRef | PDFObject) => unknown };
  const usedCodes = collectUsedCodes(doc);

  // Map font resource name -> font dict object (via page resources /Font).
  const fontByName = new Map<string, PDFDict | PDFRef>();
  for (const page of doc.getPages()) {
    const res = page.node.get(PDFName.of('Resources'));
    const resDict = res instanceof PDFRef ? ctx.lookup(res) as PDFDict : res as PDFDict | undefined;
    if (!(resDict instanceof PDFDict)) continue;
    const fonts = resDict.get(PDFName.of('Font'));
    if (!fonts) continue;
    const fontsDict = fonts instanceof PDFRef ? ctx.lookup(fonts) as PDFDict : fonts as PDFDict;
    if (!(fontsDict instanceof PDFDict)) continue;
    for (const [k, v] of (fontsDict as PDFDict).entries()) {
      const value = v instanceof PDFRef ? v : (v as PDFDict);
      if (value instanceof PDFDict || value instanceof PDFRef) {
        fontByName.set(k.asString().slice(1), value);
      }
    }
  }

  // Dedupe font dict objects (the same font can be referenced under several names).
  const fontObjects = new Map<PDFDict, { name: string; codes: Set<number> }>();
  for (const [name, ref] of fontByName) {
    const obj = ref instanceof PDFRef ? ctx.lookup(ref) as PDFDict : ref as PDFDict;
    if (!(obj instanceof PDFDict)) continue;
    const entry = fontObjects.get(obj);
    const codes = usedCodes.get(name);
    if (entry) {
      if (codes) for (const c of codes) entry.codes.add(c);
    } else {
      fontObjects.set(obj, { name, codes: codes ? new Set(codes) : new Set() });
    }
  }

  const report: string[] = [];
  let subsetted = 0;
  let skipped = 0;
  let processed = 0;
  const total = fontObjects.size;

  for (const [fontDict, entry] of fontObjects) {
    processed++;
    const baseFontName = fontDict.get(PDFName.of('BaseFont'));
    const fontName = (baseFontName instanceof PDFName ? baseFontName.asString().slice(1) : '') || entry.name;
    // The font program lives on the FontDescriptor (FontFile/FontFile2/
    // FontFile3). For composite fonts (CIDFontType2) the descriptor is on the
    // descendant CIDFont referenced by /DescendantFonts; simple fonts carry it
    // directly.
    let descRef: PDFObject | undefined = fontDict.get(PDFName.of('FontDescriptor'));
    const descendants = fontDict.get(PDFName.of('DescendantFonts'));
    if (descendants instanceof PDFArray && (descendants as PDFArray).size() > 0) {
      const first = (descendants as PDFArray).get(0);
      const cidFont = first instanceof PDFRef ? ctx.lookup(first) as PDFDict : first as PDFDict;
      if (cidFont instanceof PDFDict) {
        descRef = cidFont.get(PDFName.of('FontDescriptor'));
      }
    }
    let fontFile: PDFObject | undefined;
    if (descRef instanceof PDFRef) {
      const desc = ctx.lookup(descRef) as PDFDict | undefined;
      if (desc instanceof PDFDict) {
        fontFile =
          desc.get(PDFName.of('FontFile2')) ||
          desc.get(PDFName.of('FontFile3')) ||
          desc.get(PDFName.of('FontFile'));
      }
    }
    if (!fontFile) {
      skipped++;
      continue;
    }
    const stream = fontFile instanceof PDFRef ? ctx.lookup(fontFile) as PDFStream : fontFile as PDFStream;
    if (!(stream instanceof PDFStream)) {
      skipped++;
      continue;
    }
    const fontBytes = decodeFontFileBytes(stream);
    if (!fontBytes || fontBytes.length < 512) {
      skipped++; // too small to matter
      continue;
    }

    // Map used char codes -> glyph IDs or Unicode.
    let mode: 'unicode' | 'glyphs' = 'unicode';
    const values = new Set<number>();
    if (entry.codes.size === 0) {
      // No text found with this font — still drop to just .notdef? Safer to skip.
      skipped++;
      continue;
    }
    if (isIdentityEncoding(fontDict, ctx)) {
      mode = 'glyphs';
      for (const c of entry.codes) values.add(c);
    } else {
      const toUnicode = fontDict.get(PDFName.of('ToUnicode'));
      if (toUnicode) {
        const cmap = toUnicode instanceof PDFRef ? ctx.lookup(toUnicode) as PDFStream : toUnicode as PDFStream;
        if (cmap instanceof PDFStream) {
          const map = parseToUnicode(cmap);
          for (const c of entry.codes) {
            const cp = map.get(c);
            if (cp !== undefined) values.add(cp);
          }
        }
      }
      // Fallback for simple fonts without ToUnicode: WinAnsi byte -> codepoint.
      if (values.size === 0) {
        for (const c of entry.codes) {
          if (c < 128) values.add(c);
          else {
            const cp = WIN_ANSI[c - 128];
            if (cp !== undefined) values.add(cp);
          }
        }
      }
    }
    // Always keep .notdef (glyph 0) + space.
    if (mode === 'glyphs') {
      values.add(0);
      values.add(32);
    } else {
      values.add(32);
    }

    const subset = await subsetFontBytes(fontBytes, mode, values);
    if (!subset || subset.length >= fontBytes.length) {
      skipped++;
      report.push(`${fontName}: kept (subset not smaller)`);
      continue;
    }

    // Replace the font program stream.
    const ctxAny = doc.context as unknown as {
      stream: (c: Uint8Array, d: Record<string, unknown>) => PDFStream;
      register: (o: PDFObject) => PDFRef;
      assign: (ref: PDFRef, o: PDFObject) => void;
      obj: (v: number) => PDFNumber;
    };
    const newStream = ctxAny.stream(subset, {});
    const newDict = (newStream as PDFRawStream).dict as PDFDict;
    // Copy original dict entries (Length, Filter etc. recomputed on save).
    if (stream instanceof PDFRawStream) {
      for (const [k, v] of (stream as PDFRawStream).dict.entries()) {
        const ks = k.asString();
        if (ks === '/Length' || ks === '/Filter' || ks === '/DecodeParms') continue;
        newDict.set(k, v);
      }
    }
    const newRef = ctxAny.register(newStream);
    if (fontFile instanceof PDFRef) {
      ctxAny.assign(fontFile, newStream);
    } else if (descRef instanceof PDFRef) {
      const desc = ctx.lookup(descRef) as PDFDict | undefined;
      if (desc instanceof PDFDict) {
        desc.set(PDFName.of('FontFile2'), newRef);
      }
    } else {
      fontDict.set(PDFName.of('FontFile2'), newRef);
    }
    // Keep FontDescriptor consistent (Length1 = program size).
    if (descRef instanceof PDFRef) {
      const desc = ctx.lookup(descRef) as PDFDict | undefined;
      if (desc instanceof PDFDict) {
        desc.set(PDFName.of('Length1'), ctxAny.obj(subset.length));
      }
    }

    subsetted++;
    report.push(
      `${fontName}: ${fontBytes.length} -> ${subset.length} bytes (${Math.round((subset.length / fontBytes.length) * 100)}%)`
    );
    if (opts.onProgress) opts.onProgress((processed / total) * 100);
  }

  return { bytes: await doc.save({ useObjectStreams: true }), subsetted, skipped, report };
}

// WinAnsi (CP1252) mapping for bytes 0x80-0xFF — needed when a font has no
// ToUnicode CMap and no Differences. Bytes below 0x80 map to themselves.
const WIN_ANSI: (number | undefined)[] = [
  0x20ac, undefined, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, undefined, 0x017d, undefined,
  undefined, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, undefined, 0x017e, 0x0178,
  0x00a0, 0x00a1, 0x00a2, 0x00a3, 0x00a4, 0x00a5, 0x00a6, 0x00a7,
  0x00a8, 0x00a9, 0x00aa, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x00af,
  0x00b0, 0x00b1, 0x00b2, 0x00b3, 0x00b4, 0x00b5, 0x00b6, 0x00b7,
  0x00b8, 0x00b9, 0x00ba, 0x00bb, 0x00bc, 0x00bd, 0x00be, 0x00bf,
  0x00c0, 0x00c1, 0x00c2, 0x00c3, 0x00c4, 0x00c5, 0x00c6, 0x00c7,
  0x00c8, 0x00c9, 0x00ca, 0x00cb, 0x00cc, 0x00cd, 0x00ce, 0x00cf,
  0x00d0, 0x00d1, 0x00d2, 0x00d3, 0x00d4, 0x00d5, 0x00d6, 0x00d7,
  0x00d8, 0x00d9, 0x00da, 0x00db, 0x00dc, 0x00dd, 0x00de, 0x00df,
  0x00e0, 0x00e1, 0x00e2, 0x00e3, 0x00e4, 0x00e5, 0x00e6, 0x00e7,
  0x00e8, 0x00e9, 0x00ea, 0x00eb, 0x00ec, 0x00ed, 0x00ee, 0x00ef,
  0x00f0, 0x00f1, 0x00f2, 0x00f3, 0x00f4, 0x00f5, 0x00f6, 0x00f7,
  0x00f8, 0x00f9, 0x00fa, 0x00fb, 0x00fc, 0x00fd, 0x00fe, 0x00ff,
];
