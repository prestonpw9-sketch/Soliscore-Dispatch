import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  CORS_HEADERS,
  createServiceClient,
  createUserClient,
  handleDispatchAiChat,
  jsonResponse,
  loadAllMemories,
  resolveUserRole,
  saveTechnicianSkillsDirect,
} from '../_shared/dispatchAi.ts';

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function normalizeSkills(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

async function handleOutboundSms(body: Record<string, unknown>): Promise<Response> {
  const phone   = typeof body.phone   === 'string' ? body.phone.trim()   : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!phone)   return jsonResponse({ error: 'Missing required field: phone.'   }, 400);
  if (!message) return jsonResponse({ error: 'Missing required field: message.' }, 400);

  const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID');
  const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
  const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
    return jsonResponse({ error: 'Server misconfiguration: Twilio secrets not set.' }, 500);
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const formData = new URLSearchParams();
  formData.append('To',   phone);
  formData.append('From', TWILIO_PHONE);
  formData.append('Body', message);

  const twilioRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
    },
    body: formData,
  });

  const data = await twilioRes.json();

  if (!twilioRes.ok) {
    return jsonResponse({ error: data.message ?? 'Twilio request failed.', detail: data }, twilioRes.status);
  }

  return jsonResponse({ sid: data.sid, status: data.status }, 200);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400);
    }

    if (body.action === 'ai-chat' || Array.isArray(body.messages)) {
      return await handleDispatchAiChat(req, body);
    }

    if (body.action === 'list-ai-memories') {
      const userClient = createUserClient(req);
      if (!userClient) return jsonResponse({ error: 'Missing authorization header.' }, 401);
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return jsonResponse({ error: 'Unauthorized.' }, 401);
      const admin = createServiceClient();
      if (!admin) return jsonResponse({ error: 'Server misconfiguration.' }, 500);
      const memories = await loadAllMemories(admin);
      return jsonResponse({ memories });
    }

    if (body.action === 'save-tech-skills') {
      const technicianId = String(body.technician_id ?? '');
      const skills = normalizeSkills(body.skills);
      if (!technicianId) return jsonResponse({ error: 'Missing technician_id.' }, 400);

      const userClient = createUserClient(req);
      if (!userClient) return jsonResponse({ error: 'Missing authorization header.' }, 401);
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return jsonResponse({ error: 'Unauthorized.' }, 401);
      const role = await resolveUserRole(userClient, user.id);
      if (role !== 'owner' && role !== 'crew') {
        return jsonResponse({ error: 'Read-only role cannot edit crew abilities.' }, 403);
      }

      const admin = createServiceClient();
      if (!admin) return jsonResponse({ error: 'Server misconfiguration.' }, 500);

      const saved = await saveTechnicianSkillsDirect(admin, {
        technicianId,
        skills,
        userId: user.id,
      });
      if (!saved.ok) return jsonResponse({ error: saved.error }, 400);
      return jsonResponse({
        ok: true,
        skills: saved.skills,
        name: saved.name,
        skills_column_updated: saved.skillsColumnUpdated,
        didMutate: true,
      });
    }

    return await handleOutboundSms(body);
  } catch (err) {
    const msg = getErrorMessage(err, 'Unexpected server error.');
    console.error('send-outbound-sms error:', err);
    return jsonResponse({ error: msg }, 500);
  }
});
