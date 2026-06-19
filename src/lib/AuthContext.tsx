import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role = 'owner' | 'office' | 'crew';

interface AuthState {
  session: Session | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
  // Convenience helpers for gating UI.
  isOwner: boolean;   // Preston / Greg — full access incl. bids & proposals
  isOffice: boolean;  // read-only across the app, no bids
  isCrew: boolean;    // limited: past jobs, blueprints, submittals, photos, quick bid
  canEdit: boolean;   // owner OR crew (office is view-only). NOT a bid-access check.
}

const AuthContext = createContext<AuthState>({
  session: null,
  role: null,
  loading: true,
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
async function fetchRole(userId: string): Promise<Role | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.role as Role) ?? null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function resolve(s: Session | null) {
      if (!s) {
        if (active) { setSession(null); setRole(null); }
        return;
      }
      // A user is allowed in ONLY if they have a role row. No role => rejected.
      const r = await fetchRole(s.user.id);
      if (!active) return;
      if (!r) {
        await supabase.auth.signOut();
        setSession(null);
        setRole(null);
      } else {
        setSession(s);
        setRole(r);
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      await resolve(data.session);
      if (active) setLoading(false);
    });

    // NOTE: Supabase deadlocks if you `await` a supabase call directly inside
    // the onAuthStateChange callback (it holds an internal lock). Defer with
    // setTimeout so the role fetch runs after the callback returns.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setTimeout(() => { void resolve(s); }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
  };

  const isOwner = role === 'owner';
  const isOffice = role === 'office';
  const isCrew = role === 'crew';
  const canEdit = isOwner || isCrew; // office is read-only

  return (
    <AuthContext.Provider
      value={{ session, role, loading, signOut, isOwner, isOffice, isCrew, canEdit }}
    >
      {children}
    </AuthContext.Provider>
  );
};
