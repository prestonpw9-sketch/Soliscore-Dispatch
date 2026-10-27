/**
 * Reject unsigned Twilio webhook calls before any database, OpenAI, or SMS work.
 * Auth token comes from resolveTwilioAuthToken (env, then Vault RPC).
 */

import { resolveTwilioAuthToken } from './twilioAuth.ts';
import { publicWebhookUrlFromRequest, validateTwilioSignature } from './twilioSignature.ts';

export async function twilioWebhookForbidden(
  req: Request,
  functionName: string,
  params: URLSearchParams,
): Promise<Response | null> {
  const authToken = await resolveTwilioAuthToken();
  if (!authToken) {
    console.error(`${functionName}: TWILIO_AUTH_TOKEN is not configured`);
    return new Response('Forbidden', { status: 403 });
  }

  let url: string;
  try {
    url = publicWebhookUrlFromRequest(req, functionName, Deno.env.get('TWILIO_WEBHOOK_URL'));
  } catch (err) {
    console.error(
      `${functionName}: TWILIO_WEBHOOK_URL is invalid`,
      err instanceof Error ? err.message : err,
    );
    return new Response('Forbidden', { status: 403 });
  }

  const ok = await validateTwilioSignature({
    authToken,
    signatureHeader: req.headers.get('X-Twilio-Signature'),
    url,
    params,
  });
  if (!ok) {
    console.error(`${functionName}: rejected Twilio signature`, { url });
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}
