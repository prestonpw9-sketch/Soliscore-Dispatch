import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppLayout from './components/AppLayout';
import LoginScreen from './components/LoginScreen';
import { AuthProvider, useAuth } from './lib/AuthContext';

// ── Theme provider ─────────────────────────────────────────────────────────
// Inline fallback until a real ThemeProvider is wired up.
// Replace this with your actual provider when ready.

const ThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);

// ── 404 fallback ───────────────────────────────────────────────────────────
// FIX: catch-all path="*" previously rendered AppLayout again, giving no
// indication to the user that the URL they typed was invalid.
// A minimal inline 404 is better than silently showing the dashboard.

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-center p-8">
      <p className="text-6xl font-black text-slate-200 dark:text-slate-800 select-none">
        404
      </p>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-2">
        Page not found
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        The URL you entered doesn't exist in this application.
      </p>
      <a
        href="/"
        className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
      >
        ← Back to Dashboard
      </a>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

// ── Auth gate ──────────────────────────────────────────────────────────────
// While the session loads, show a spinner. No session => login screen.
// Valid (allow-listed) session => the real app.

function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-7 h-7 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />} />
        {/* FIX: catch-all now shows a real 404 instead of a silent AppLayout */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <ThemeProvider>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </ThemeProvider>
);

export default App;