import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onLoginSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Invalid email or password.');
      onLoginSuccess(data.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Invalid email or password.');
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

        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block text-xs font-medium text-slate-300">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              className="mt-1 w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block text-xs font-medium text-slate-300">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              className="mt-1 w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        {/* Footer Note */}
        <div className="pt-2 text-center text-[10px] text-slate-500 border-t border-slate-800">
          Great Coders • Daily growth, discipline, and execution
        </div>
      </div>
    </div>
  );
};
