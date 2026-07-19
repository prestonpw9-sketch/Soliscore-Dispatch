import React, { useEffect, useState } from 'react';
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export default function LoginScreen() {
  const { authNotice, clearAuthNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (authNotice) setError(authNotice);
  }, [authNotice]);

  const handleForgotPassword = async () => {
    const clean = email.trim().toLowerCase();
    if (!clean) {
      setNotice(null);
      setError('Enter your email above, then tap Forgot password.');
      return;
    }
    setError(null);
    setNotice(null);
    clearAuthNotice();
    setResetBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: window.location.origin,
    });
    setResetBusy(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice(`Password reset link sent to ${clean}. Check your inbox (and spam).`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    setError(null);
    setNotice(null);
    clearAuthNotice();
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: clean,
      password,
    });
    setBusy(false);

    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? 'Incorrect email or password. Use Forgot password if you need to reset it.'
          : signInError.message
      );
    }
    // On success AuthContext checks user_roles. No assigned role => signed out with authNotice.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 pt-8 pb-6 text-center border-b border-slate-800">
          <div className="mx-auto mb-4 w-40 bg-white rounded-xl p-3 shadow-lg">
            <img src="/itdg-logo.png" alt="ITDG - Innovative Technology Development Group, LLC" className="w-full h-auto" />
          </div>
          <p className="text-xs font-semibold text-teal-400 mt-1">Crew Dispatch &amp; Jobs Tracking Estimator</p>
          <p className="text-sm text-slate-400 mt-2">Secure sign-in for authorized team members.</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-300">Email</span>
              <div className="mt-1.5 relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-300">Password</span>
              <div className="mt-1.5 relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm font-medium">
                {error}
              </div>
            )}

            {notice && (
              <div className="p-3 bg-teal-900/30 border border-teal-800 rounded-xl text-teal-200 text-sm font-medium">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || resetBusy}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {busy ? 'Signing in…' : 'Sign In'}
            </button>

            <button
              type="button"
              disabled={busy || resetBusy}
              onClick={() => void handleForgotPassword()}
              className="w-full text-sm font-semibold text-teal-400 hover:text-teal-300 disabled:opacity-60 transition-colors"
            >
              {resetBusy ? 'Sending reset link…' : 'Forgot password?'}
            </button>

            <p className="text-xs text-slate-500 text-center pt-2">
              Use your ITDG email (e.g. you@itdgconstruction.com). Contact Preston if you still can&apos;t get in.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
