import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // qpdf-wasm is an Emscripten bundle that statically imports Node built-ins
  // (fs, path) — those are only used in its Node branch, so alias them to an
  // empty shim for the browser bundle. WASM files themselves are served from
  // public/wasm/ and lazy-loaded at runtime.
  turbopack: {
    resolveAlias: {
      fs: "./lib/empty-module.ts",
    },
  },
};

export default nextConfig;
