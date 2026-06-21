import Link from 'next/link';

const features = [
  { title: 'Client-Side Processing', desc: 'All PDF operations run entirely in your browser. Your files are never uploaded to any server.' },
  { title: 'No Data Storage', desc: 'We do not store, log, or retain any of your documents. Processing is ephemeral and files are cleared when you close the tab.' },
  { title: 'Encryption in Transit', desc: 'All connections use TLS 1.3 encryption. API keys are stored server-side and never exposed to the client.' },
  { title: 'Zero Tracking', desc: 'We do not use analytics cookies, tracking pixels, or third-party scripts that monitor your behavior.' },
  { title: 'Open Source', desc: 'Our code is transparent. You can inspect, audit, and self-host the entire application.' },
];

export default function SecurityPage() {
  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Security</h1>
        <p className="mt-3 text-sm text-slate-500">Your documents are your property. We built Docify with a privacy-first architecture to ensure they stay that way.</p>
        <div className="mt-12 space-y-8">
          {features.map((f, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-base font-bold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
