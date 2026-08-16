// pako is a transitive dependency of pdf-lib and ships without TypeScript
// types. We only use its `deflate` helper when rebuilding PNG images during
// image extraction.
declare module 'pako' {
  const pako: {
    deflate(data: Uint8Array, options?: { level?: number }): Uint8Array;
  };
  export default pako;
}
