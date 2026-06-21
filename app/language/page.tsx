'use client';

import Link from 'next/link';
import { useState } from 'react';

const languages = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
];

export default function LanguagePage() {
  const [selected, setSelected] = useState('en');

  return (
    <main className="flex-1 bg-slate-50 min-h-screen">
      <section className="py-20 px-6 max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors mb-8">&larr; Back to Home</Link>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Language</h1>
        <p className="mt-3 text-sm text-slate-500">Select your preferred language for the interface.</p>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setSelected(lang.code)}
              className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                selected === lang.code
                  ? 'border-red-500 bg-red-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-bold text-slate-900">{lang.native}</div>
              <div className="text-xs text-slate-400 mt-0.5">{lang.name}</div>
            </button>
          ))}
        </div>
        <div className="mt-8 text-xs text-slate-400 text-center">
          {selected !== 'en' ? 'Language selection is a UI preference. Tool content remains in English.' : 'English is currently selected.'}
        </div>
      </section>
    </main>
  );
}
