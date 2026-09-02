/**
 * Twilio SMS / voice helpers plus crew-directory paging.
 * Used by send-outbound-sms, gemini-chat (via dispatchAi), super-processor, and twilio-voice.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { escapeXml, normalizeToE164, phonesMatch } from './phone.ts';
import {
  formatTwilioError,
  readTwilioCreds,
  twilioFetch,
} from './twilioAuth.ts';

export {
  cleanTwilioSecret,
  probeTwilioAuth,
  readTwilioCreds,
  type TwilioCreds,
  type TwilioProbeResult,
} from './twilioAuth.ts';

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

function resolveFromNumber(raw: string): { ok: true; from: string } | { ok: false; error: string } {
  const from = normalizeToE164(raw);
  if (!from) {
    return {
      ok: false,
      error: 'TWILIO_PHONE_NUMBER must be E.164 (e.g. +15205551234). Update the Edge Function secret.',
    };
  }
  return { ok: true, from };
}

export async function sendTwilioSms(
  to: string,
  body: string,
): Promise<{ ok: true; sid: string; status: string } | { ok: false; error: string }> {
  const loaded = readTwilioCreds();
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const e164 = normalizeToE164(to);
  if (!e164) return { ok: false, error: `Invalid phone number: ${to}` };

  const fromNum = resolveFromNumber(loaded.creds.from);
  if (!fromNum.ok) return fromNum;
  const formData = new URLSearchParams();
  formData.append('To', e164);
  formData.append('From', fromNum.from);
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

  const fromNum = resolveFromNumber(loaded.creds.from);
  if (!fromNum.ok) return fromNum;
  const spoken = sayText.replace(/\s+/g, ' ').trim().slice(0, 900);
  const twiml =
    `<Response><Say voice="Polly.Matthew">${escapeXml(spoken)}</Say></Response>`;

  const formData = new URLSearchParams();
  formData.append('To', e164);
  formData.append('From', fromNum.from);
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
