'use client';

import React, { useState } from 'react';
import { X, Mail, Lock, User, Sparkles, Check } from 'lucide-react';
import confetti from 'canvas-confetti';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'signup';
  onClose: () => void;
  onSuccess: (email: string) => void;
}

export default function AuthModal({
  isOpen,
  initialMode,
  onClose,
  onSuccess
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync mode state when modal opens
  React.useEffect(() => {
    setMode(initialMode);
    setEmail('');
    setPassword('');
    setName('');
    setSuccessMsg(null);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (mode === 'signup' && !name)) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSuccessMsg(mode === 'login' ? 'Logged in successfully!' : 'Account registered successfully!');
      
      confetti({
        particleCount: 50,
        spread: 40,
        origin: { y: 0.6 }
      });

      setTimeout(() => {
        onSuccess(email);
        onClose();
      }, 1000);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm transition-opacity">
      <div 
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {mode === 'login' ? 'Log in to Docify' : 'Create Free Account'}
          </h2>
          <button 
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {successMsg ? (
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-emerald-100 p-3 mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">{successMsg}</h3>
              <p className="text-xs text-slate-400 mt-1">Directing you back to workspace...</p>
            </div>
          ) : (
            <>
              {/* Under Construction Banner */}
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200/60 p-3 flex items-start gap-2.5">
                <span className="text-sm shrink-0">⚠️</span>
                <div className="text-xs text-amber-800 leading-normal font-medium">
                  <strong>Under Construction:</strong> Docify Portal authentication is currently in sandbox testing. You can proceed using simulated mock profiles below.
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500/50 transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="name@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500/50 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500/50 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-200 text-white font-bold text-xs py-3 rounded-lg shadow-md transition-all uppercase tracking-wider"
                >
                  {isSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{mode === 'login' ? 'Log In' : 'Sign Up'}</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Social login mock separator */}
          {!successMsg && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100" /></div>
                <div className="relative flex justify-center text-[10px] uppercase font-semibold"><span className="bg-white px-2 text-slate-400">or connect with</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-700">
                <button 
                  onClick={() => {
                    confetti({ particleCount: 30, spread: 30 });
                    onSuccess('google.user@email.com');
                    onClose();
                  }}
                  className="flex items-center justify-center gap-1.5 border border-slate-200 rounded-lg py-2 hover:bg-slate-50 transition-colors"
                >
                  Google
                </button>
                <button 
                  onClick={() => {
                    confetti({ particleCount: 30, spread: 30 });
                    onSuccess('github.user@email.com');
                    onClose();
                  }}
                  className="flex items-center justify-center gap-1.5 border border-slate-200 rounded-lg py-2 hover:bg-slate-50 transition-colors"
                >
                  GitHub
                </button>
              </div>

              {/* Mode switch */}
              <p className="mt-6 text-center text-xs text-slate-400 font-semibold">
                {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                <button 
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="text-red-600 hover:underline font-bold"
                >
                  {mode === 'login' ? 'Create an account' : 'Log in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
