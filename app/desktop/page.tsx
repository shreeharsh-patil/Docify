import Link from 'next/link';

const features = [
  { title: 'Offline Mode', desc: 'Process PDFs without an internet connection. All client-side tools work offline on desktop.' },
  { title: 'Batch Processing', desc: 'Select and process multiple files at once. Merge, convert, or compress entire folders in one click.' },
  { title: 'Keyboard Shortcuts', desc: 'Speed up your workflow with keyboard shortcuts for every tool. No context switching needed.' },
  { title: 'Native Performance', desc: 'Built with Electron for native-level performance. Handles large files and complex operations smoothly.' },
  { title: 'File System Integration', desc: 'Open PDFs directly from your file system. Save results with one click — no browser download prompts.' },
  { title: 'Auto-Update', desc: 'Stay current with automatic updates. New tools and features delivered seamlessly.' },
];

export default function DesktopPage() {
  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Desktop App</h1>
        <p className="mt-3 text-sm text-slate-500 max-w-xl leading-relaxed">Available for Mac and Windows. The full power of Docify, native on your machine.</p>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-base font-bold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex items-center justify-center gap-4">
          <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-4 px-8 rounded-xl transition-all cursor-pointer">Download for Mac</button>
          <button className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-4 px-8 rounded-xl transition-all cursor-pointer">Download for Windows</button>
        </div>
      </section>
    </main>
  );
}
