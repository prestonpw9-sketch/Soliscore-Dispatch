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

export function readTwilioCreds():
  | { ok: true; creds: TwilioCreds }
  | { ok: false; error: string } {
  const accountSid = cleanTwilioSecret(Deno.env.get('TWILIO_ACCOUNT_SID'));
  const authToken = cleanTwilioSecret(Deno.env.get('TWILIO_AUTH_TOKEN'));
  const apiKey = cleanTwilioSecret(Deno.env.get('TWILIO_API_KEY'));
  const apiSecret = cleanTwilioSecret(Deno.env.get('TWILIO_API_SECRET'));
  const from = cleanTwilioSecret(Deno.env.get('TWILIO_PHONE_NUMBER'));

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

function twilioBasicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

export async function twilioFetch(
  path: string,
  init: RequestInit,
): Promise<{ res: Response; data: TwilioErrorBody }> {
  const creds = readTwilioCreds();
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
  const loaded = readTwilioCreds();
  const fromRaw = cleanTwilioSecret(Deno.env.get('TWILIO_PHONE_NUMBER'));
  const sidRaw = cleanTwilioSecret(Deno.env.get('TWILIO_ACCOUNT_SID'));
  const tokenRaw = cleanTwilioSecret(Deno.env.get('TWILIO_AUTH_TOKEN'));
  const meta = {
    sidKind: sidRaw.slice(0, 2) || 'missing',
    tokenLength: tokenRaw.length,
    fromConfigured: Boolean(fromRaw),
    fromLooksE164: Boolean(normalizeToE164(fromRaw)),
    fromPrefix: fromRaw.slice(0, 2) || 'missing',
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
    const { res, data } = await twilioFetch('.json', { method: 'GET' });
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
