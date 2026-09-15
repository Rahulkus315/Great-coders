import React, { useEffect, useState } from 'react';
import { Shield, Lock, CheckCircle2, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onLoginSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingBinding, setPendingBinding] = useState<null | {
    participantId: 'user-rahul' | 'user-dileep';
    providerSubject: string;
    email: string;
  }>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bindMode = params.get('auth');
    if (!isOpen || bindMode !== 'bind') return;

    const participantId = params.get('participant') === 'user-dileep' ? 'user-dileep' : 'user-rahul';
    const providerSubject = params.get('providerSubject');
    const emailParam = params.get('email');
    if (providerSubject && emailParam) {
      setPendingBinding({
        participantId,
        providerSubject,
        email: emailParam,
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGoogleLogin = (participantId: 'user-rahul' | 'user-dileep') => {
    setLoading(true);
    setError(null);
    window.location.href = `/api/auth/google/start?participant=${participantId}`;
  };

  const handleGoogleBind = async () => {
    if (!pendingBinding) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/google/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          participantId: pendingBinding.participantId,
          providerSubject: pendingBinding.providerSubject,
          email: pendingBinding.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google binding failed');
      }

      window.history.replaceState({}, '', window.location.pathname);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-indigo-900 text-white font-black text-lg tracking-[0.18em] shadow-lg shadow-indigo-500/30 border border-indigo-300/40 mb-1">
            J.S.R
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
            Great Coders
          </h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Your 4-month coding challenge.
          </p>
        </div>

        {/* Security / Identity Lock Notice */}
        <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/50 flex items-start gap-3 text-left">
          <Lock className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
          <div className="text-[11px] text-slate-300 leading-relaxed">
            <strong className="text-indigo-200 block font-semibold mb-0.5">
              Permanent Identity Lock
            </strong>
            Once you log in, your browser session is bound to your Great Coders identity and your progress is tracked from day one.
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Google Auth Flow */}
        {pendingBinding ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left">
              <h3 className="text-base font-black text-amber-200">Permanent Account Binding</h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                You are signing in for the first time. This Google account will be permanently associated with your challenge identity.
                <span className="mt-2 block text-sm font-bold text-slate-100">Participant: {pendingBinding.participantId === 'user-dileep' ? 'Dileep' : 'Rahul'}</span>
              </p>
              <p className="mt-3 text-[11px] text-amber-200/90">
                Once confirmed, this account cannot be switched to another participant.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200"
                onClick={() => {
                  setPendingBinding(null);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white"
                onClick={handleGoogleBind}
                disabled={loading}
              >
                {loading ? 'Binding...' : 'Permanently Bind Account'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleGoogleLogin('user-rahul')}
              disabled={loading}
              className="w-full flex items-center justify-between p-3.5 bg-slate-800/90 hover:bg-slate-800 text-slate-100 rounded-xl border border-slate-700 font-medium transition-all shadow-sm cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-inner">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-100">Continue with Google</p>
                  <p className="text-[11px] text-slate-400">Use Rahul's Google account</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
            </button>

            <button
              type="button"
              onClick={() => handleGoogleLogin('user-dileep')}
              disabled={loading}
              className="w-full flex items-center justify-between p-3.5 bg-slate-800/50 hover:bg-slate-800 text-slate-200 rounded-xl border border-slate-700/60 font-medium transition-all shadow-sm cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-900/60 text-indigo-300 font-bold text-xs flex items-center justify-center border border-indigo-700/50">
                  D
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-200">Continue with Google</p>
                  <p className="text-[11px] text-slate-400">Use Dileep's Google account</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
        )}

        {/* Footer Note */}
        <div className="pt-2 text-center text-[10px] text-slate-500 border-t border-slate-800">
          Great Coders • Daily growth, discipline, and execution
        </div>
      </div>
    </div>
  );
};
