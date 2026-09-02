/**
 * Twilio SMS / voice helpers plus crew-directory paging.
 * Used by send-outbound-sms, gemini-chat (via dispatchAi), super-processor, and twilio-voice.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { escapeXml, normalizeToE164, phonesMatch } from './phone.ts';

export interface CrewContact {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  emergency_contact: boolean;
}

export interface NotifyTargetResult {
  id: string;
  name: string;
  phone: string;
  sid?: string;
  status?: string;
}

export interface NotifySkip {
  id?: string;
  name: string;
  reason: string;
}

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
}

type TwilioErrorBody = {
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

function formatTwilioError(httpStatus: number, data: TwilioErrorBody): string {
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

async function twilioFetch(
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
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.error,
      fromConfigured: Boolean(cleanTwilioSecret(Deno.env.get('TWILIO_PHONE_NUMBER'))),
      sidKind: cleanTwilioSecret(Deno.env.get('TWILIO_ACCOUNT_SID')).slice(0, 2) || 'missing',
      tokenLength: cleanTwilioSecret(Deno.env.get('TWILIO_AUTH_TOKEN')).length,
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
        sidKind: creds.accountSid.slice(0, 2),
        tokenLength: creds.password.length,
        fromConfigured: true,
        fromLooksE164: Boolean(normalizeToE164(creds.from)),
      };
    }
    return {
      ok: true,
      httpStatus: res.status,
      accountStatus: data.status,
      authMode: creds.authMode,
      sidKind: creds.accountSid.slice(0, 2),
      tokenLength: creds.password.length,
      fromConfigured: true,
      fromLooksE164: Boolean(normalizeToE164(creds.from)),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Twilio probe failed.';
    return { ok: false, error: message, authMode: creds.authMode };
  }
}

export async function sendTwilioSms(
  to: string,
  body: string,
): Promise<{ ok: true; sid: string; status: string } | { ok: false; error: string }> {
  const loaded = readTwilioCreds();
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const e164 = normalizeToE164(to);
  if (!e164) return { ok: false, error: `Invalid phone number: ${to}` };

  const from = normalizeToE164(loaded.creds.from) ?? loaded.creds.from;
  const formData = new URLSearchParams();
  formData.append('To', e164);
  formData.append('From', from);
  formData.append('Body', body);

  const { res, data } = await twilioFetch('/Messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });
  if (!res.ok) {
    const error = formatTwilioError(res.status, data);
    console.error('Twilio SMS failed', { httpStatus: res.status, code: data.code, message: data.message });
    return { ok: false, error };
  }
  return { ok: true, sid: String(data.sid ?? ''), status: String(data.status ?? '') };
}

export async function sendTwilioVoiceSay(
  to: string,
  sayText: string,
): Promise<{ ok: true; sid: string; status: string } | { ok: false; error: string }> {
  const loaded = readTwilioCreds();
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const e164 = normalizeToE164(to);
  if (!e164) return { ok: false, error: `Invalid phone number: ${to}` };

  const from = normalizeToE164(loaded.creds.from) ?? loaded.creds.from;
  const spoken = sayText.replace(/\s+/g, ' ').trim().slice(0, 900);
  const twiml =
    `<Response><Say voice="Polly.Matthew">${escapeXml(spoken)}</Say></Response>`;

  const formData = new URLSearchParams();
  formData.append('To', e164);
  formData.append('From', from);
  formData.append('Twiml', twiml);

  const { res, data } = await twilioFetch('/Calls.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });
  if (!res.ok) {
    const error = formatTwilioError(res.status, data);
    console.error('Twilio voice failed', { httpStatus: res.status, code: data.code, message: data.message });
    return { ok: false, error };
  }
  return { ok: true, sid: String(data.sid ?? ''), status: String(data.status ?? '') };
}

export async function loadCrewDirectory(admin: SupabaseClient): Promise<CrewContact[]> {
  const full = await admin
    .from('technicians')
    .select('id, name, role, phone, emergency_contact')
    .order('name');
  const rows = full.error
    ? (await admin.from('technicians').select('id, name, role').order('name')).data ?? []
    : full.data ?? [];

  return (rows as Array<Record<string, unknown>>).map(t => ({
    id: String(t.id ?? ''),
    name: String(t.name ?? ''),
    role: String(t.role ?? ''),
    phone: normalizeToE164(t.phone == null ? null : String(t.phone)),
    emergency_contact: Boolean(t.emergency_contact),
  }));
}

/** On-call techs with a number; if none are flagged, every tech who has a cell. */
export function pickEmergencyRecipients(crew: CrewContact[]): CrewContact[] {
  const withPhone = crew.filter(c => c.phone);
  const onCall = withPhone.filter(c => c.emergency_contact);
  return onCall.length ? onCall : withPhone;
}

async function isOptedOut(admin: SupabaseClient, phone: string): Promise<boolean> {
  const { data } = await admin
    .from('sms_opt_outs')
    .select('phone_number, opted_out');
  const rows = (data ?? []) as Array<{ phone_number: string; opted_out: boolean }>;
  return rows.some(r => r.opted_out && phonesMatch(r.phone_number, phone));
}

export async function notifyCrew(
  admin: SupabaseClient,
  opts: {
    message: string;
    technicianIds?: string[];
    pageOnCall?: boolean;
    pageAllWithPhone?: boolean;
    channel?: 'sms' | 'voice';
  },
): Promise<{
  ok: boolean;
  channel: 'sms' | 'voice';
  sent: NotifyTargetResult[];
  skipped: NotifySkip[];
  error?: string;
}> {
  const channel = opts.channel === 'voice' ? 'voice' : 'sms';
  const message = String(opts.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!message) {
    return { ok: false, channel, sent: [], skipped: [], error: 'Message is empty.' };
  }

  const crew = await loadCrewDirectory(admin);
  let targets: CrewContact[] = [];

  if (opts.technicianIds?.length) {
    const wanted = new Set(opts.technicianIds.map(String));
    targets = crew.filter(c => wanted.has(c.id));
    for (const id of wanted) {
      if (!crew.some(c => c.id === id)) {
        return {
          ok: false,
          channel,
          sent: [],
          skipped: [],
          error: `Unknown technician_id ${id}`,
        };
      }
    }
  } else if (opts.pageOnCall) {
    targets = pickEmergencyRecipients(crew);
  } else if (opts.pageAllWithPhone) {
    targets = crew.filter(c => c.phone);
  } else {
    return {
      ok: false,
      channel,
      sent: [],
      skipped: [],
      error: 'Say who to contact (technician_ids), or page on-call / everyone with a number.',
    };
  }

  if (targets.length > 8) {
    return {
      ok: false,
      channel,
      sent: [],
      skipped: [],
      error: `Refusing to contact ${targets.length} people at once (max 8). Narrow the list.`,
    };
  }

  const sent: NotifyTargetResult[] = [];
  const skipped: NotifySkip[] = [];

  for (const tech of targets) {
    if (!tech.phone) {
      skipped.push({ id: tech.id, name: tech.name, reason: 'no phone on file' });
      continue;
    }
    if (await isOptedOut(admin, tech.phone)) {
      skipped.push({ id: tech.id, name: tech.name, reason: 'opted out of SMS' });
      continue;
    }

    const result = channel === 'voice'
      ? await sendTwilioVoiceSay(tech.phone, message)
      : await sendTwilioSms(tech.phone, message);

    if (!result.ok) {
      skipped.push({ id: tech.id, name: tech.name, reason: result.error });
      continue;
    }

    sent.push({
      id: tech.id,
      name: tech.name,
      phone: tech.phone,
      sid: result.sid,
      status: result.status,
    });

    await admin.from('dispatch_messages').insert({
      phone_number: tech.phone,
      message,
      direction: 'outbound',
    });
  }

  const authFail = skipped.find(s => s.reason.includes('Twilio authentication failed'));
  return {
    ok: sent.length > 0,
    channel,
    sent,
    skipped,
    error: sent.length > 0 ? undefined : authFail?.reason,
  };
}

export function formatEmergencyPageMessage(opts: {
  title: string;
  address: string;
  callerPhone: string;
  notes?: string;
}): string {
  const bits = [
    'URGENT — Solidcore emergency',
    opts.title,
    opts.address ? `at ${opts.address}` : '',
    opts.callerPhone && opts.callerPhone !== 'Unknown' ? `caller ${opts.callerPhone}` : '',
    opts.notes ? opts.notes : '',
    'Reply to dispatch when en route.',
  ].filter(Boolean);
  return bits.join(' — ').slice(0, 400);
}
