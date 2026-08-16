// qpdf (C++ → WASM) integration for lossless PDF operations.
//
// Why: pdf-lib's copyPages() re-embeds every page object and re-compresses all
// streams, which bloats files and chokes on unusual encodings (JPX, JBIG2,
// non-flate streams). qpdf copies objects verbatim, so merge/split/repair are
// lossless and far more robust. The WASM module (~1.3MB) is lazy-loaded only
// when one of these tools actually runs, and the .wasm file is served from
// /wasm/qpdf.wasm (public/wasm/qpdf.wasm).
import type { QpdfInstance } from '@neslinesli93/qpdf-wasm';

let qpdfPromise: Promise<QpdfInstance> | null = null;

async function getQpdf(): Promise<QpdfInstance> {
  if (!qpdfPromise) {
    qpdfPromise = (async () => {
      const mod = (await import('@neslinesli93/qpdf-wasm')).default;
      // In Node (tests) locate the wasm beside the package; in the browser it
      // is served from /wasm/qpdf.wasm (copied from the package at build time).
      const isNode = typeof process !== 'undefined' && !!process.versions?.node;
      let wasmUrl = '/wasm/qpdf.wasm';
      if (isNode) {
        const { fileURLToPath } = await import('node:url');
        wasmUrl = fileURLToPath(new URL('../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', import.meta.url));
      }
      const instance = await mod({ locateFile: () => wasmUrl });
      return instance;
    })();
  }
  return qpdfPromise;
}

export interface QpdfFile {
  name: string;
  data: Uint8Array;
}

/**
 * Run a qpdf command in the virtual filesystem. Returns the output file's
 * bytes (reads it from /out/<name>). Throws with qpdf's stderr on failure.
 */
async function qpdfRun(args: string[], input: QpdfFile[], outName: string): Promise<Uint8Array> {
  const qpdf = await getQpdf();
  const fs = qpdf.FS as unknown as {
    mkdir: (p: string) => void;
    writeFile: (p: string, data: Uint8Array) => void;
    readFile: (p: string) => Uint8Array;
  };
  try {
    fs.mkdir('/in');
  } catch {
    /* already exists */
  }
  try {
    fs.mkdir('/out');
  } catch {
    /* already exists */
  }

  for (const f of input) {
    fs.writeFile(`/in/${f.name}`, f.data);
  }

  const fullArgs = [...args, `--`, `/out/${outName}`];
  const exitCode = qpdf.callMain(fullArgs);
  if (exitCode !== 0) {
    throw new Error(`qpdf failed with exit code ${exitCode}: ${fullArgs.join(' ')}`);
  }
  return fs.readFile(`/out/${outName}`);
}

/**
 * Lossless merge: copies page objects verbatim, preserving stream encoding.
 * Falls back to pdf-lib merge if qpdf can't load or the PDF is unsupported.
 */
export async function mergePdfsLossless(buffers: ArrayBuffer[]): Promise<Uint8Array> {
  const files: QpdfFile[] = buffers.map((b, i) => ({
    name: `input${i}.pdf`,
    data: new Uint8Array(b),
  }));
  const pageArgs: string[] = [];
  for (let i = 0; i < files.length; i++) {
    pageArgs.push(`/in/input${i}.pdf`, '1-z');
  }
  const args = ['--empty', '--stream-data=preserve', '--object-streams=preserve', '--pages', ...pageArgs];
  return qpdfRun(args, files, 'merged.pdf');
}

/**
 * Lossless split: extract a page range with streams preserved.
 */
export async function splitPdfLossless(buffer: ArrayBuffer, start: number, end: number): Promise<Uint8Array> {
  const args = ['/in/input0.pdf', '--stream-data=preserve', '--object-streams=preserve', '--pages', '.', `${start}-${end}`];
  return qpdfRun(args, [{ name: 'input0.pdf', data: new Uint8Array(buffer) }], 'split.pdf');
}

/**
 * Lossless repair: rewrite xref table and trailer, fixing broken files
 * without touching stream contents.
 */
export async function repairPdfLossless(buffer: ArrayBuffer): Promise<Uint8Array> {
  const args = ['/in/input0.pdf', '--stream-data=preserve', '--object-streams=preserve'];
  return qpdfRun(args, [{ name: 'input0.pdf', data: new Uint8Array(buffer) }], 'repaired.pdf');
}

/** Try qpdf; returns null if it's unavailable (SSR, fetch failure, etc.). */
export async function qpdfAvailable(): Promise<boolean> {
  try {
    await getQpdf();
    return true;
  } catch {
    return false;
  }
}
