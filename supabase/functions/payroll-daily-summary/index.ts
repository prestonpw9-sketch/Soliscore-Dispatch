/**
 * Daily owner payroll summary by SMS. DISABLED BY DEFAULT, three ways:
 *   1. supabase/config.toml has enabled = false for this function.
 *   2. payroll_settings.daily_summary_enabled defaults to false.
 *   3. Nothing schedules it. To turn it on, deploy it, set the
 *      PAYROLL_SUMMARY_SECRET secret, tick "Send each evening" on the Payroll
 *      page, and add a pg_cron / scheduler POST with header
 *      x-payroll-summary-secret.
 *
 *   POST {}                         today's (Phoenix) summary
 *   POST { date: "2026-10-28" }     a specific day
 *   POST { dryRun: true }           return the text, send nothing
 *
 * Callers: the scheduler (shared secret) or a signed-in owner.
 * This function never inserts jobs and does not touch the SMS job flow.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireDispatchUser } from '../_shared/callerAuthLive.ts';
import { timingSafeEqualString } from '../_shared/twilioSignature.ts';
import { sendTwilioSms } from '../_shared/twilio.ts';
import {
  addDaysYmd,
  buildPayroll,
  dailySummaryText,
  payrollSettingsFromRow,
  phoenixDayStartIso,
  phoenixWorkDate,
  type PayrollJobInfo,
  type PayrollSegmentRow,
  type PayrollShiftRow,
} from '../_shared/payroll.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-payroll-summary-secret',
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function authorized(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const secret = (Deno.env.get('PAYROLL_SUMMARY_SECRET') ?? '').trim();
  const presented = (req.headers.get('x-payroll-summary-secret') ?? '').trim();
  if (secret && presented && timingSafeEqualString(presented, secret)) return { ok: true };
  const caller = await requireDispatchUser(req, { requireWriter: true });
  if (!caller.ok) return { ok: false, status: caller.status, error: caller.error };
  if (caller.role !== 'owner') return { ok: false, status: 403, error: 'Owners only.' };
  return { ok: true };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const auth = await authorized(req);
  if (auth.ok === false) return json({ error: auth.error }, auth.status);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json() as Record<string, unknown>;
  } catch { /* empty body is fine */ }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is missing Supabase credentials.' }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: settingsRows, error: settingsError } = await admin.from('payroll_settings').select('*').limit(1);
  if (settingsError) return json({ error: `payroll_settings: ${settingsError.message}` }, 500);
  const settingsRow = (settingsRows?.[0] ?? null) as Record<string, unknown> | null;
  const dryRun = body.dryRun === true;
  if (!dryRun && settingsRow?.daily_summary_enabled !== true) {
    return json({ skipped: 'Daily summary is turned off in payroll settings.' });
  }
  const phone = typeof settingsRow?.daily_summary_phone === 'string' ? settingsRow.daily_summary_phone.trim() : '';
  if (!dryRun && !phone) return json({ skipped: 'No owner phone in payroll settings.' });

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : phoenixWorkDate(new Date());

  const { data: shifts, error: shiftError } = await admin
    .from('shifts')
    .select('*')
    .gte('started_at', phoenixDayStartIso(date))
    .lt('started_at', phoenixDayStartIso(addDaysYmd(date, 1)));
  if (shiftError) return json({ error: `shifts: ${shiftError.message}` }, 500);
  const shiftRows = (shifts ?? []) as PayrollShiftRow[];
  const shiftIds = shiftRows.map(shift => shift.id);

  const segments: PayrollSegmentRow[] = [];
  if (shiftIds.length) {
    const { data, error } = await admin.from('time_segments').select('*').in('shift_id', shiftIds);
    if (error) return json({ error: `time_segments: ${error.message}` }, 500);
    segments.push(...((data ?? []) as PayrollSegmentRow[]));
  }

  const jobIds = Array.from(new Set(segments.map(segment => segment.job_id).filter(id => id != null)));
  const jobs = new Map<string, PayrollJobInfo>();
  if (jobIds.length) {
    const { data } = await admin.from('jobs').select('id, title, latitude, longitude').in('id', jobIds);
    for (const row of (data ?? []) as Array<{ id: number; title: string | null; latitude: number | null; longitude: number | null }>) {
      jobs.set(String(row.id), {
        id: String(row.id),
        name: row.title?.trim() || `Job ${row.id}`,
        pinned: row.latitude != null && row.longitude != null,
      });
    }
  }

  const names: Record<string, string> = {};
  const { data: roles } = await admin.from('user_roles').select('user_id, email, full_name');
  for (const row of (roles ?? []) as Array<{ user_id: string; email: string | null; full_name: string | null }>) {
    names[row.user_id] = row.full_name?.trim() || row.email?.trim() || 'Crew';
  }

  const { days } = buildPayroll({
    shifts: shiftRows,
    segments,
    jobs,
    settings: payrollSettingsFromRow(settingsRow),
  });
  const text = dailySummaryText(date, days, names);

  if (dryRun) return json({ date, text, sent: false });
  const sent = await sendTwilioSms(phone, text);
  if (!sent.ok) return json({ date, text, sent: false, error: sent.error }, 502);
  return json({ date, text, sent: true, sid: sent.sid });
});
