import React, { useState } from 'react';
import { Loader2, Mail, CheckCircle2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ALLOWED_EMAILS } from '@/lib/AuthContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    setError(null);

    if (!ALLOWED_EMAILS.includes(clean)) {
      setError('This email is not authorized for Soliscore Dispatch.');
      return;
    }

    setSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);

    if (otpError) setError(otpError.message);
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 pt-8 pb-6 text-center border-b border-slate-800">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-teal-600/20 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-teal-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Soliscore Dispatch</h1>
          <p className="text-sm text-slate-400 mt-1">Secure sign-in for authorized team members.</p>
        </div>

        <div className="p-8">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-teal-400 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-white">Check your email</h2>
              <p className="text-sm text-slate-400 mt-2">
                We sent a secure sign-in link to <span className="font-semibold text-slate-200">{email.trim().toLowerCase()}</span>.
                Click the link in that email to enter the app.
              </p>
              <button
                type="button"
                onClick={() => { setSent(false); setEmail(''); }}
                className="mt-6 text-sm font-semibold text-teal-400 hover:text-teal-300 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-300">Email address</span>
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

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sending ? 'Sending link…' : 'Send me a sign-in link'}
              </button>

              <p className="text-xs text-slate-500 text-center pt-2">
                No password needed. You'll receive a one-time secure link by email.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
