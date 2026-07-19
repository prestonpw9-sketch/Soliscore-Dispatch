import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role = 'owner' | 'office' | 'crew';

interface AuthState {
  session: Session | null;
  role: Role | null;
  loading: boolean;
  /** Shown on the login screen when credentials work but the account has no role row. */
  authNotice: string | null;
  clearAuthNotice: () => void;
  /** True when the user arrived via a password-reset email link. */
  passwordRecovery: boolean;
  completePasswordRecovery: () => void;
  signOut: () => Promise<void>;
  // Convenience helpers for gating UI.
  isOwner: boolean;   // owner role — full access incl. bids & proposals
  isOffice: boolean;  // read-only across the app, no bids
  isCrew: boolean;    // limited: past jobs, blueprints, submittals, photos, quick bid
  canEdit: boolean;   // owner OR crew (office is view-only). NOT a bid-access check.
}

const AuthContext = createContext<AuthState>({
  session: null,
  role: null,
  loading: true,
  authNotice: null,
  clearAuthNotice: () => {},
  passwordRecovery: false,
  completePasswordRecovery: () => {},
  signOut: async () => {},
  isOwner: false,
  isOffice: false,
  isCrew: false,
  canEdit: false,
});

export const useAuth = () => useContext(AuthContext);

// Fetch the signed-in user's role from public.user_roles.
// Filter by the current user's id so owners (who can read all rows) still get
// exactly their own role, and maybeSingle never errors on multiple rows.
type RoleLookup = { role: Role | null; failed: boolean };

async function fetchRole(userId: string): Promise<RoleLookup> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) {
      return { role: (data.role as Role) ?? null, failed: false };
    }
    if (error) console.error('user_roles lookup failed:', error.message);
    if (attempt === 0) await new Promise(r => setTimeout(r, 400));
  }
  return { role: null, failed: true };
}

const UNAUTHORIZED_NOTICE =
  'Your account is not authorized to use this app. Contact Preston if you need access.';
const ROLE_LOOKUP_FAILED_NOTICE =
  'Signed in, but we could not verify your access. Check your connection and try again.';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('type=recovery'),
  );

  useEffect(() => {
    let active = true;

    async function resolve(s: Session | null) {
      if (!s) {
        if (active) { setSession(null); setRole(null); }
        return;
      }
      // A user is allowed in ONLY if they have a role row. No role => rejected.
      const lookup = await fetchRole(s.user.id);
      if (!active) return;
      if (lookup.failed) {
        setAuthNotice(ROLE_LOOKUP_FAILED_NOTICE);
        await supabase.auth.signOut();
        setSession(null);
        setRole(null);
      } else if (!lookup.role) {
        setAuthNotice(UNAUTHORIZED_NOTICE);
        await supabase.auth.signOut();
        setSession(null);
        setRole(null);
      } else {
        setAuthNotice(null);
        setSession(s);
        setRole(lookup.role);
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      await resolve(data.session);
      if (active) setLoading(false);
    });

    // NOTE: Supabase deadlocks if you `await` a supabase call directly inside
    // the onAuthStateChange callback (it holds an internal lock). Defer with
    // setTimeout so the role fetch runs after the callback returns.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setTimeout(() => { void resolve(s); }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const clearAuthNotice = () => setAuthNotice(null);

  const completePasswordRecovery = () => {
    setPasswordRecovery(false);
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setAuthNotice(null);
    setPasswordRecovery(false);
  };

  const isOwner = role === 'owner';
  const isOffice = role === 'office';
  const isCrew = role === 'crew';
  const canEdit = isOwner || isCrew; // office is read-only

  return (
    <AuthContext.Provider
      value={{
        session, role, loading, authNotice, clearAuthNotice,
        passwordRecovery, completePasswordRecovery,
        signOut, isOwner, isOffice, isCrew, canEdit,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
