import Link from 'next/link';

const categories = [
  { name: 'Organize', tools: ['Merge', 'Split', 'Reorder', 'Rotate', 'Repair', 'Remove Pages', 'Extract Pages', 'Page Numbers', 'Add Blank Pages'] },
  { name: 'Convert', tools: ['JPG to PDF', 'Word to PDF', 'Excel to PDF', 'PPT to PDF', 'HTML to PDF', 'PDF to JPG', 'PDF to Word', 'PDF to Excel', 'PDF to PPT', 'PDF to PDF/A', 'PDF to Markdown', 'PDF to TXT'] },
  { name: 'Security', tools: ['Encrypt', 'Decrypt', 'Sign', 'Redact', 'Flatten', 'Fill Forms', 'Compare', 'Scan to PDF', 'OCR'] },
  { name: 'Optimize', tools: ['Compress', 'Watermark', 'Crop', 'Edit Metadata', 'Header & Footer', 'Validate PDF/A'] },
  { name: 'AI', tools: ['AI Summarizer', 'Translate PDF'] },
];

export default function FeaturesPage() {
  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 max-w-5xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">All Features</h1>
        <p className="mt-3 text-sm text-slate-500 max-w-xl">Over 30 PDF tools — every one free to use, every one processing locally in your browser.</p>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <div key={cat.name} className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-red-600 uppercase tracking-wider">{cat.name}</h3>
              <ul className="mt-4 space-y-2">
                {cat.tools.map((t) => (
                  <li key={t} className="text-sm text-slate-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
