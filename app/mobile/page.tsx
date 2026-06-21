import Link from 'next/link';

const features = [
  { title: 'Scan to PDF', desc: 'Use your phone camera to scan documents and convert them to PDF instantly.' },
  { title: 'On-the-Go Processing', desc: 'Merge, split, compress, and convert PDFs directly from your phone or tablet.' },
  { title: 'Cloud Sync', desc: 'Access your documents across devices. Start on mobile, finish on desktop.' },
  { title: 'Touch Optimized', desc: 'Full touch interface designed for iOS and Android. Drag, tap, and swipe through documents.' },
  { title: 'Share & Export', desc: 'Share processed PDFs via email, messaging apps, or cloud storage with one tap.' },
  { title: 'Biometric Security', desc: 'Protect sensitive documents with Face ID or fingerprint unlock.' },
];

export default function MobilePage() {
  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Mobile App</h1>
        <p className="mt-3 text-sm text-slate-500 max-w-xl leading-relaxed">Available for iOS and Android. Take your PDF tools wherever you go.</p>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-base font-bold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex items-center justify-center gap-4">
          <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-4 px-8 rounded-xl transition-all cursor-pointer">Download on the App Store</button>
          <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-4 px-8 rounded-xl transition-all cursor-pointer">Get it on Google Play</button>
        </div>
      </section>
    </main>
  );
}
