import Link from 'next/link';

const benefits = [
  { title: 'Team Collaboration', desc: 'Share PDF workflows across your team. Merge, review, and process documents together with shared project spaces.' },
  { title: 'API Access', desc: 'Integrate Docify processing into your own tools with our REST API. Automate document workflows at scale.' },
  { title: 'Admin Dashboard', desc: 'Monitor usage, manage team members, and configure processing preferences from a central dashboard.' },
  { title: 'Priority Support', desc: 'Dedicated support channel with guaranteed response times for business-critical document processing.' },
  { title: 'Custom Branding', desc: 'White-label the interface with your company logo and brand colors for client-facing document tools.' },
  { title: 'Audit Logs', desc: 'Full audit trail of all document processing activity for compliance and security requirements.' },
];

export default function BusinessPage() {
  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Docify for Business</h1>
        <p className="mt-3 text-sm text-slate-500 max-w-xl leading-relaxed">Streamlined PDF editing and document workflows designed for business teams. Process, collaborate, and automate at scale.</p>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          {benefits.map((b) => (
            <div key={b.title} className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-base font-bold text-slate-900">{b.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <button className="bg-red-600 hover:bg-red-500 text-white font-bold text-sm py-4 px-10 rounded-xl shadow-lg shadow-red-600/20 transition-all cursor-pointer uppercase tracking-wider">Contact Sales</button>
        </div>
      </section>
    </main>
  );
}
