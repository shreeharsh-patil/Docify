import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">About Docify</h1>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">
          Docify was built with a simple belief: PDF tools should be free, fast, and private. No uploads, no queues, no hidden costs.
        </p>
        <div className="mt-12 space-y-6 text-sm text-slate-600 leading-relaxed">
          <p>
            Every tool runs entirely in your browser using <strong>pdf-lib</strong> and <strong>PDF.js</strong>. Your files never hit a server. For advanced features like OCR and format conversion, we offer optional API integration — but the core experience is always local.
          </p>
          <p>
            Built with Next.js, Tailwind CSS, and TypeScript. Designed for modern browsers. Optimized for privacy.
          </p>
        </div>
        <div className="mt-12 bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-slate-900">Tech Stack</h3>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-500">
            {['Next.js 16', 'React 19', 'TypeScript', 'Tailwind CSS 4', 'pdf-lib', 'PDF.js'].map((t) => (
              <div key={t} className="bg-slate-50 rounded-lg px-3 py-2 font-medium text-slate-700">{t}</div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
