/**
 * Twilio REST credential loading, secret trimming, and a no-SMS auth probe.
 * Shared by send-outbound-sms, gemini-chat, super-processor, and twilio-status.
 */

import { normalizeToE164 } from './phone.ts';

export interface TwilioCreds {
  /** Account SID used in the REST path (always AC…). */
  accountSid: string;
  /** Basic-auth username: Account SID or API Key SID (SK…). */
  username: string;
  /** Auth Token or API Key secret. */
  password: string;
  from: string;
  authMode: 'auth_token' | 'api_key';
}

export interface TwilioProbeResult {
  ok: boolean;
  error?: string;
  twilioCode?: number;
  httpStatus?: number;
  accountStatus?: string;
  authMode?: TwilioCreds['authMode'];
  sidKind?: string;
  tokenLength?: number;
  fromConfigured?: boolean;
  fromLooksE164?: boolean;
  fromPrefix?: string;
  fromDigitCount?: number;
}

export type TwilioErrorBody = {
  sid?: string;
  status?: string;
  code?: number;
  message?: string;
  more_info?: string;
};

/** Strip BOM / wrapping quotes / newlines that break Twilio Basic auth (20003). */
export function cleanTwilioSecret(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/[\r\n\t]/g, '')
    .trim();
}

export function formatTwilioError(httpStatus: number, data: TwilioErrorBody): string {
  const code = data.code;
  const message = (data.message ?? '').trim() || 'Twilio request failed.';
  if (httpStatus === 401 || code === 20003) {
    return (
      `Twilio authentication failed (20003): ${message}. ` +
      'Check Edge Function secrets TWILIO_ACCOUNT_SID (must start with AC) and TWILIO_AUTH_TOKEN ' +
      '(Twilio Console → Account → API keys & tokens). Trailing spaces/newlines in the secret will also cause this.'
    );
  }
  return code ? `Twilio error ${code}: ${message}` : message;
}

function credsFromParts(parts: {
  accountSid: string;
  authToken: string;
  apiKey: string;
  apiSecret: string;
  from: string;
}): { ok: true; creds: TwilioCreds } | { ok: false; error: string } {
  const accountSid = cleanTwilioSecret(parts.accountSid);
  const authToken = cleanTwilioSecret(parts.authToken);
  const apiKey = cleanTwilioSecret(parts.apiKey);
  const apiSecret = cleanTwilioSecret(parts.apiSecret);
  const from = cleanTwilioSecret(parts.from);

  const missing: string[] = [];
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!from) missing.push('TWILIO_PHONE_NUMBER');
  const hasAuthToken = Boolean(authToken);
  const hasApiKey = Boolean(apiKey && apiSecret);
  if (!hasAuthToken && !hasApiKey) missing.push('TWILIO_AUTH_TOKEN');
  if (missing.length) {
    return {
      ok: false,
      error: `Twilio secrets are not configured (${missing.join(', ')}).`,
    };
  }

  // API Key stored in ACCOUNT_SID (SK…) cannot be used as the /Accounts/{Sid} path.
  if (accountSid.startsWith('SK')) {
    return {
      ok: false,
      error:
        'TWILIO_ACCOUNT_SID looks like an API Key (SK…). Put the Account SID (AC…) in TWILIO_ACCOUNT_SID and the API Key in TWILIO_API_KEY.',
    };
  }
  if (!accountSid.startsWith('AC')) {
    return {
      ok: false,
      error: `TWILIO_ACCOUNT_SID must start with AC (got ${accountSid.slice(0, 2) || 'empty'}…).`,
    };
  }

  if (apiKey.startsWith('SK') && apiSecret) {
    if (apiSecret.length < 20) {
      return {
        ok: false,
        error:
          `TWILIO_API_SECRET looks truncated (${apiSecret.length} chars; Twilio API Key secrets are 32 characters). ` +
          'Update the Edge Function secret in the Supabase dashboard.',
      };
    }
    return {
      ok: true,
      creds: {
        accountSid,
        username: apiKey,
        password: apiSecret,
        from,
        authMode: 'api_key',
      },
    };
  }

  // Auth Tokens are 32 chars. A short value is a placeholder/truncated secret and
  // Twilio will only return 20003 Authenticate.
  if (authToken.length > 0 && authToken.length < 20) {
    return {
      ok: false,
      error:
        `TWILIO_AUTH_TOKEN looks truncated (${authToken.length} chars; Twilio Auth Tokens are 32 characters). ` +
        'Paste the live Auth Token from Twilio Console → Account → API keys & tokens into the Supabase Edge Function secret TWILIO_AUTH_TOKEN (project-wide).',
    };
  }

  return {
    ok: true,
    creds: {
      accountSid,
      username: accountSid,
      password: authToken,
      from,
      authMode: 'auth_token',
    },
  };
}

function envTwilioParts() {
  return {
    accountSid: cleanTwilioSecret(Deno.env.get('TWILIO_ACCOUNT_SID')),
    authToken: cleanTwilioSecret(Deno.env.get('TWILIO_AUTH_TOKEN')),
    apiKey: cleanTwilioSecret(Deno.env.get('TWILIO_API_KEY')),
    apiSecret: cleanTwilioSecret(Deno.env.get('TWILIO_API_SECRET')),
    from: cleanTwilioSecret(Deno.env.get('TWILIO_PHONE_NUMBER')),
  };
}

/** Env-only. Prefer `resolveTwilioCreds` so Vault can fill truncated Edge Function secrets. */
export function readTwilioCreds():
  | { ok: true; creds: TwilioCreds }
  | { ok: false; error: string } {
  return credsFromParts(envTwilioParts());
}

async function readTwilioCredsFromVault(): Promise<Partial<{
  accountSid: string;
  authToken: string;
  from: string;
}>> {
  const url = cleanTwilioSecret(Deno.env.get('SUPABASE_URL'));
  const key = cleanTwilioSecret(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!url || !key) return {};
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_twilio_edge_secrets`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!res.ok) {
      console.error('get_twilio_edge_secrets failed', res.status);
      return {};
    }
    const data = await res.json() as Record<string, unknown>;
    return {
      accountSid: typeof data.TWILIO_ACCOUNT_SID === 'string' ? data.TWILIO_ACCOUNT_SID : undefined,
      authToken: typeof data.TWILIO_AUTH_TOKEN === 'string' ? data.TWILIO_AUTH_TOKEN : undefined,
      from: typeof data.TWILIO_PHONE_NUMBER === 'string' ? data.TWILIO_PHONE_NUMBER : undefined,
    };
  } catch (err) {
    console.error('get_twilio_edge_secrets error', err instanceof Error ? err.message : err);
    return {};
  }
}

function envCredsAreUsable(
  loaded: { ok: true; creds: TwilioCreds } | { ok: false; error: string },
): loaded is { ok: true; creds: TwilioCreds } {
  if (!loaded.ok) return false;
  if (loaded.creds.password.length < 20) return false;
  if (!normalizeToE164(loaded.creds.from)) return false;
  return true;
}

/** Edge Function env first; Vault fills in when the hosted secrets are truncated or incomplete. */
export async function resolveTwilioCreds(): Promise<
  | { ok: true; creds: TwilioCreds; source: 'env' | 'vault' }
  | { ok: false; error: string }
> {
  const envLoaded = readTwilioCreds();
  if (envCredsAreUsable(envLoaded)) {
    return { ...envLoaded, source: 'env' };
  }
  const vault = await readTwilioCredsFromVault();
  const env = envTwilioParts();
  const merged = credsFromParts({
    accountSid: vault.accountSid || env.accountSid,
    authToken: vault.authToken || env.authToken,
    apiKey: env.apiKey,
    apiSecret: env.apiSecret,
    from: vault.from || env.from,
  });
  if (!merged.ok) return merged;
  if (!envCredsAreUsable(merged)) return merged;
  return { ...merged, source: 'vault' };
}

function twilioBasicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

export async function twilioFetch(
  path: string,
  init: RequestInit,
  credsOverride?: TwilioCreds,
): Promise<{ res: Response; data: TwilioErrorBody }> {
  const creds = credsOverride
    ? { ok: true as const, creds: credsOverride }
    : await resolveTwilioCreds();
  if (!creds.ok) {
    throw new Error(creds.error);
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.creds.accountSid}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: twilioBasicAuth(creds.creds.username, creds.creds.password),
    },
  });
  let data: TwilioErrorBody = {};
  try {
    data = await res.json() as TwilioErrorBody;
  } catch {
    data = { message: `Twilio returned HTTP ${res.status}` };
  }
  return { res, data };
}

/** GET /Accounts/{Sid}.json — validates credentials without sending SMS or placing a call. */
export async function probeTwilioAuth(): Promise<TwilioProbeResult> {
  const loaded = await resolveTwilioCreds();
  const fromRaw = loaded.ok
    ? loaded.creds.from
    : cleanTwilioSecret(Deno.env.get('TWILIO_PHONE_NUMBER'));
  const sidRaw = loaded.ok
    ? loaded.creds.accountSid
    : cleanTwilioSecret(Deno.env.get('TWILIO_ACCOUNT_SID'));
  const tokenRaw = loaded.ok
    ? loaded.creds.password
    : cleanTwilioSecret(Deno.env.get('TWILIO_AUTH_TOKEN'));
  const meta = {
    sidKind: sidRaw.slice(0, 2) || 'missing',
    tokenLength: tokenRaw.length,
    fromConfigured: Boolean(fromRaw),
    fromLooksE164: Boolean(normalizeToE164(fromRaw)),
    fromPrefix: fromRaw.slice(0, 2) || 'missing',
    fromDigitCount: fromRaw.replace(/\D/g, '').length,
  };
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.error,
      ...meta,
    };
  }
  const { creds } = loaded;
  try {
    const { res, data } = await twilioFetch('.json', { method: 'GET' }, creds);
    if (!res.ok) {
      const error = formatTwilioError(res.status, data);
      console.error('Twilio auth probe failed', { httpStatus: res.status, code: data.code, message: data.message });
      return {
        ok: false,
        error,
        twilioCode: data.code,
        httpStatus: res.status,
        authMode: creds.authMode,
        ...meta,
      };
    }
    return {
      ok: true,
      httpStatus: res.status,
      accountStatus: data.status,
      authMode: creds.authMode,
      ...meta,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Twilio probe failed.';
    return { ok: false, error: message, authMode: creds.authMode, ...meta };
  }
}
