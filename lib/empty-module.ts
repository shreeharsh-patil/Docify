// Empty shim for Node built-ins (fs, path, etc.) referenced by Emscripten
// WASM bundles (qpdf-wasm). The bundled code only uses these inside Node-only
// branches, so an empty module is safe in the browser.
export {};
