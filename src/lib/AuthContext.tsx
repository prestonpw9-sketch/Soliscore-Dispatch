import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Only these two accounts are allowed into the app. Even if someone else
// somehow obtains a session, they are signed out immediately.
export const ALLOWED_EMAILS = [
  'preston@solidcoreplumb.com',
  'greg@itdgconstruction.com',
];

interface AuthState {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function isAllowed(session: Session | null): boolean {
  const email = session?.user?.email?.toLowerCase();
  return !!email && ALLOWED_EMAILS.includes(email);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const s = data.session;
      if (s && !isAllowed(s)) {
        // Not on the allow-list — kick them out.
        void supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(s);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s && !isAllowed(s)) {
        void supabase.auth.signOut();
        setSession(null);
        return;
      }
      setSession(s);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
