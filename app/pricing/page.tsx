import Link from 'next/link';

const plans = [
  { name: 'Free', price: '$0', desc: 'For individuals getting started', features: ['30 tools included', 'Client-side processing', '3 files per day (API)', 'Basic support'] },
  { name: 'Pro', price: '$9', period: '/mo', desc: 'For power users and professionals', features: ['All 30+ tools', 'Unlimited API processing', 'OCR & AI features', 'Priority support', 'No file size limits'], popular: true },
  { name: 'Team', price: '$29', period: '/mo', desc: 'For teams and small businesses', features: ['Everything in Pro', '5 team members', 'Collaboration tools', 'API access', 'Dedicated support'] },
];

export default function PricingPage() {
  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 text-center max-w-5xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Simple, transparent pricing</h1>
        <p className="mt-3 text-sm text-slate-500 max-w-xl mx-auto">All tools are free for client-side use. Upgrade for API-powered features and unlimited processing.</p>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.name} className={`relative bg-white rounded-2xl p-8 border-2 text-left ${plan.popular ? 'border-red-500 shadow-lg shadow-red-500/10' : 'border-slate-200'}`}>
              {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-wider">Most Popular</span>}
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-0.5">
                <span className="text-3xl font-black text-slate-900">{plan.price}</span>
                {plan.period && <span className="text-sm text-slate-400">{plan.period}</span>}
              </div>
              <p className="mt-2 text-xs text-slate-500">{plan.desc}</p>
              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="text-xs text-slate-600 flex items-center gap-2">
                    <span className="text-red-500 font-bold">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <button className={`mt-8 w-full py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${plan.popular ? 'bg-red-600 text-white hover:bg-red-500 shadow-md shadow-red-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                {plan.name === 'Free' ? 'Get Started' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
