/**
 * Browser-called edge functions must prove a real signed-in user.
 * The anon key and the service-role key are JWTs the gateway may accept;
 * they are not a person. Office is view-only and cannot send SMS or mutate.
 */

export type AppRole = 'owner' | 'office' | 'crew';

export type AuthSuccess = { ok: true; userId: string; role: AppRole };
export type AuthFailure = { ok: false; status: 401 | 403; error: string };
export type AuthResult = AuthSuccess | AuthFailure;

export function bearerTokenFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function isProjectApiKey(
  token: string,
  anonKey?: string | null,
  serviceRoleKey?: string | null,
): boolean {
  const anon = (anonKey ?? '').trim();
  const service = (serviceRoleKey ?? '').trim();
  if (anon && token === anon) return true;
  if (service && token === service) return true;
  return false;
}

export function normalizeRole(raw: string | null | undefined): AppRole | null {
  if (raw === 'owner' || raw === 'office' || raw === 'crew') return raw;
  return null;
}

export function roleCanWrite(role: AppRole): boolean {
  switch (role) {
    case 'owner':
    case 'crew':
      return true;
    case 'office':
      return false;
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

export async function authorizeDispatchCaller(args: {
  authorizationHeader: string | null;
  anonKey?: string | null;
  serviceRoleKey?: string | null;
  /** Office is rejected. Owner and crew pass. */
  requireWriter: boolean;
  writerError?: string;
  getUser: (token: string) => Promise<{ id: string } | null>;
  getRole: (userId: string) => Promise<string | null>;
}): Promise<AuthResult> {
  const token = bearerTokenFromHeader(args.authorizationHeader);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing authorization header.' };
  }
  if (isProjectApiKey(token, args.anonKey, args.serviceRoleKey)) {
    return { ok: false, status: 401, error: 'Unauthorized — sign out and sign back in.' };
  }

  const user = await args.getUser(token);
  if (!user?.id) {
    return { ok: false, status: 401, error: 'Unauthorized — sign out and sign back in.' };
  }

  const role = normalizeRole(await args.getRole(user.id));
  if (!role) {
    return { ok: false, status: 403, error: 'No user role assigned.' };
  }
  if (args.requireWriter && !roleCanWrite(role)) {
    return {
      ok: false,
      status: 403,
      error: args.writerError ?? 'Read-only role cannot send messages.',
    };
  }
  return { ok: true, userId: user.id, role };
}
