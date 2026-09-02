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

export async function sendTwilioSms(
  to: string,
  body: string,
): Promise<{ ok: true; sid: string; status: string } | { ok: false; error: string }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!sid || !token || !from) {
    return { ok: false, error: 'Twilio secrets are not configured (TWILIO_ACCOUNT_SID / AUTH_TOKEN / PHONE_NUMBER).' };
  }

  const e164 = normalizeToE164(to);
  if (!e164) return { ok: false, error: `Invalid phone number: ${to}` };

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const formData = new URLSearchParams();
  formData.append('To', e164);
  formData.append('From', from);
  formData.append('Body', body);

  const twilioRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
    },
    body: formData,
  });
  const data = await twilioRes.json() as { sid?: string; status?: string; message?: string };
  if (!twilioRes.ok) {
    return { ok: false, error: data.message ?? 'Twilio SMS request failed.' };
  }
  return { ok: true, sid: String(data.sid ?? ''), status: String(data.status ?? '') };
}

export async function sendTwilioVoiceSay(
  to: string,
  sayText: string,
): Promise<{ ok: true; sid: string; status: string } | { ok: false; error: string }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!sid || !token || !from) {
    return { ok: false, error: 'Twilio secrets are not configured (TWILIO_ACCOUNT_SID / AUTH_TOKEN / PHONE_NUMBER).' };
  }

  const e164 = normalizeToE164(to);
  if (!e164) return { ok: false, error: `Invalid phone number: ${to}` };

  const spoken = sayText.replace(/\s+/g, ' ').trim().slice(0, 900);
  const twiml =
    `<Response><Say voice="Polly.Matthew">${escapeXml(spoken)}</Say></Response>`;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;
  const formData = new URLSearchParams();
  formData.append('To', e164);
  formData.append('From', from);
  formData.append('Twiml', twiml);

  const twilioRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
    },
    body: formData,
  });
  const data = await twilioRes.json() as { sid?: string; status?: string; message?: string };
  if (!twilioRes.ok) {
    return { ok: false, error: data.message ?? 'Twilio voice request failed.' };
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

  return { ok: sent.length > 0, channel, sent, skipped };
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
