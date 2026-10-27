/**
 * Live wiring for authorizeDispatchCaller.
 * Verifies the bearer token with supabase.auth.getUser(token) — not getSession.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  authorizeDispatchCaller,
  bearerTokenFromHeader,
  type AppRole,
  type AuthResult,
} from './callerAuth.ts';

export type DispatchUser =
  | { ok: true; userId: string; role: AppRole; userClient: SupabaseClient }
  | Extract<AuthResult, { ok: false }>;

export async function requireDispatchUser(
  req: Request,
  opts: { requireWriter: boolean; writerError?: string },
): Promise<DispatchUser> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authorizationHeader = req.headers.get('Authorization');
  const token = bearerTokenFromHeader(authorizationHeader);

  const supabase = supabaseUrl && anonKey && token
    ? createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    : null;

  const decision = await authorizeDispatchCaller({
    authorizationHeader,
    anonKey,
    serviceRoleKey,
    requireWriter: opts.requireWriter,
    writerError: opts.writerError,
    getUser: async (jwt) => {
      if (!supabase) return null;
      const { data: { user }, error } = await supabase.auth.getUser(jwt);
      if (error || !user) return null;
      return { id: user.id };
    },
    getRole: async (userId) => {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        console.error('user_roles lookup failed', error.message);
        return null;
      }
      return typeof data?.role === 'string' ? data.role : null;
    },
  });

  if (!decision.ok) return decision;
  if (!supabase) {
    return { ok: false, status: 401, error: 'Unauthorized — sign out and sign back in.' };
  }
  return { ok: true, userId: decision.userId, role: decision.role, userClient: supabase };
}
