import Link from 'next/link';

const faqs = [
  { q: 'How do I use a tool?', a: 'Select any tool from the dashboard. Upload your file, configure options in the sidebar, and click the red action button to process.' },
  { q: 'Are my files uploaded to a server?', a: 'No. All processing happens locally in your browser using client-side libraries like pdf-lib and PDF.js. Your files never leave your device.' },
  { q: 'What are the file size limits?', a: 'Client-side processing has no hard limit — it depends on your device memory. API-powered tools may have limits based on your plan.' },
  { q: 'How do I use the AI features?', a: 'AI Summarizer and Translate use Groq or Gemini APIs. Configure your API keys in .env.local to enable them, or they fall back to client-side processing.' },
  { q: 'Can I use Docify offline?', a: 'Once loaded, most client-side tools work offline. API-dependent features like OCR and certain conversions require an internet connection.' },
  { q: 'Is Docify free?', a: 'Yes. All 30+ tools are free for client-side use. API-powered features have usage limits on the free tier.' },
];

export default function HelpPage() {
  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Help</h1>
        <p className="mt-3 text-sm text-slate-500">Frequently asked questions and common troubleshooting.</p>
        <div className="mt-12 space-y-4">
          {faqs.map((faq, i) => (
            <details key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden group">
              <summary className="px-6 py-4 text-sm font-bold text-slate-900 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between">
                {faq.q}
                <span className="text-slate-400 group-open:rotate-180 transition-transform">&#9660;</span>
              </summary>
              <div className="px-6 pb-4 text-sm text-slate-500 leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
