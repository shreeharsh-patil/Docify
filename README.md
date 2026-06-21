# Docify

> Every PDF tool you need, in one place. 100% free, client-side processing — no file uploads.

Docify is a privacy-first, browser-based PDF utility suite. Merge, split, compress, convert, encrypt, annotate, and more — all processed locally using `pdf-lib` and `pdfjs-dist`, with optional Groq/Gemini AI integration for summarization and translation.

## Features

### Organize

Merge, Split, Reorder, Rotate, Repair, Remove/Extract Pages, Page Numbers, Add Blank Pages

### Convert

- **To PDF:** JPG, Word (DOCX), Excel (XLSX), PPT, HTML
- **From PDF:** JPG, Word, Excel, PPT, PDF/A, Markdown, TXT
- **Validate:** PDF/A conformance checking

### Security & Optimize

Compress, Watermark, Crop, Encrypt/Decrypt, Sign, Redact, Fill Forms, Flatten, Edit Metadata, Header & Footer, Compare, Scan to PDF, OCR

### AI-Powered

- **AI Summarizer** — Generate document summaries via Groq / Gemini
- **Translate PDF** — Extract and translate text into 6+ languages

### Client-Side First

Everything runs in your browser. Your files never leave your machine. When API keys are configured, advanced features like OCR and certain conversions are available — otherwise, every tool falls back to pure client-side processing.

## Architecture

```
app/
  page.tsx           — Tool definitions, grid dashboard, footer
  api/
    ai/route.ts      — Groq → Gemini fallback for AI features
components/
  PdfWorkspace.tsx   — Main workspace with all tool processing
lib/
  pdfProcessor.ts    — Client-side pdf-lib functions (merge, split, rotate, etc.)
  pdf-client.ts      — Client-side pdfjs-dist wrapper (text extraction, page render)
  ai-client.ts       — Fetch wrapper for /api/ai
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional: AI API Keys

Set these in `.env.local` for AI Summarizer and Translate features:

```env
GROQ_API_KEY=...
GEMINI_API_KEY=...
```

Without them, AI features fall back to client-side processing.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **UI:** React 19, Tailwind CSS 4, Lucide Icons
- **PDF:** pdf-lib, pdfjs-dist
- **AI:** Groq, Gemini
- **Build:** TypeScript, ESLint

## Deployment

```bash
npm run build
npm start
```


---

Made by **Shreeharsh**
