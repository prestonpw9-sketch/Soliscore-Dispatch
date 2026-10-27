/**
 * Unit checks for Twilio webhook signatures and the dispatch caller guard.
 * Does not call Twilio, OpenAI, or the database.
 *
 * Run: npm run test:edge-security
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  authorizeDispatchCaller,
} from '../supabase/functions/_shared/callerAuth.ts';
import {
  buildPublicWebhookUrl,
  timingSafeEqualString,
  validateTwilioSignature,
} from '../supabase/functions/_shared/twilioSignature.ts';

const AUTH_TOKEN = '12345';
const WEBHOOK_URL = 'https://mycompany.com/myapp.php?foo=1&bar=2';

function headers(map: Record<string, string> = {}): (name: string) => string | null {
  const lower = new Map(Object.entries(map).map(([key, value]) => [key.toLowerCase(), value]));
  return (name) => lower.get(name.toLowerCase()) ?? null;
}

/** Independent HMAC-SHA1, not the function under test. */
function independentSignature(url: string, params: Record<string, string>): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', AUTH_TOKEN).update(payload, 'utf8').digest('base64');
}

const postParams = {
  CallSid: 'CA1234567890ABCDE',
  Caller: '+14158675309',
  Digits: '1234',
  From: '+14158675309',
  To: '+18005551212',
};

function formBody(params: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) body.append(key, value);
  return body;
}

const validSignature = independentSignature(WEBHOOK_URL, postParams);

assert.equal(
  timingSafeEqualString(validSignature, validSignature),
  true,
);
assert.equal(
  timingSafeEqualString(validSignature, `${validSignature.slice(0, -1)}A`),
  false,
);

const valid = await validateTwilioSignature({
  authToken: AUTH_TOKEN,
  signatureHeader: validSignature,
  url: WEBHOOK_URL,
  params: formBody(postParams),
});
assert.equal(valid, true, 'valid signature');

const tampered = new URLSearchParams(formBody(postParams));
tampered.set('Digits', '9999');
const tamperedOk = await validateTwilioSignature({
  authToken: AUTH_TOKEN,
  signatureHeader: validSignature,
  url: WEBHOOK_URL,
  params: tampered,
});
assert.equal(tamperedOk, false, 'tampered param');

const wrongUrl = await validateTwilioSignature({
  authToken: AUTH_TOKEN,
  signatureHeader: validSignature,
  url: 'https://mycompany.com/myapp.php?foo=1&bar=2&extra=1',
  params: formBody(postParams),
});
assert.equal(wrongUrl, false, 'wrong URL');

const missingHeader = await validateTwilioSignature({
  authToken: AUTH_TOKEN,
  signatureHeader: null,
  url: WEBHOOK_URL,
  params: formBody(postParams),
});
assert.equal(missingHeader, false, 'missing header');

const blankHeader = await validateTwilioSignature({
  authToken: AUTH_TOKEN,
  signatureHeader: '   ',
  url: WEBHOOK_URL,
  params: formBody(postParams),
});
assert.equal(blankHeader, false, 'blank header');

const withPort = await validateTwilioSignature({
  authToken: AUTH_TOKEN,
  signatureHeader: validSignature,
  url: 'https://mycompany.com:443/myapp.php?foo=1&bar=2',
  params: formBody(postParams),
});
assert.equal(withPort, true, 'default port still matches the URL Twilio signed');

// Param insertion order must not matter; Twilio sorts by name.
const reversed = new URLSearchParams();
for (const key of Object.keys(postParams).reverse()) {
  reversed.append(key, postParams[key as keyof typeof postParams]);
}
const reversedOk = await validateTwilioSignature({
  authToken: AUTH_TOKEN,
  signatureHeader: validSignature,
  url: WEBHOOK_URL,
  params: reversed,
});
assert.equal(reversedOk, true, 'sorted params');

const publicSms = buildPublicWebhookUrl({
  requestUrl: 'https://example.supabase.co/functions/v1/super-processor',
  functionName: 'super-processor',
  getHeader: headers(),
});
assert.equal(
  publicSms,
  'https://example.supabase.co/functions/v1/super-processor',
);

const proxied = buildPublicWebhookUrl({
  requestUrl: 'http://supabase_edge_runtime:8081/super-processor',
  functionName: 'super-processor',
  getHeader: headers({
    'x-forwarded-proto': 'https, http',
    'x-forwarded-host': 'example.supabase.co',
  }),
});
assert.equal(
  proxied,
  'https://example.supabase.co/functions/v1/super-processor',
);

const voiceOverride = buildPublicWebhookUrl({
  requestUrl: 'http://127.0.0.1:54321/functions/v1/twilio-voice?step=voicemail',
  functionName: 'twilio-voice',
  getHeader: headers(),
  override: 'https://example.supabase.co',
});
assert.equal(
  voiceOverride,
  'https://example.supabase.co/functions/v1/twilio-voice?step=voicemail',
);

const exactOverride = buildPublicWebhookUrl({
  requestUrl: 'http://localhost/super-processor',
  functionName: 'super-processor',
  getHeader: headers(),
  override: 'https://example.supabase.co/functions/v1/super-processor',
});
assert.equal(
  exactOverride,
  'https://example.supabase.co/functions/v1/super-processor',
);

const otherFunctionOverride = buildPublicWebhookUrl({
  requestUrl: 'http://localhost/twilio-voice?step=menu',
  functionName: 'twilio-voice',
  getHeader: headers(),
  override: 'https://example.supabase.co/functions/v1/super-processor',
});
assert.equal(
  otherFunctionOverride,
  'https://example.supabase.co/functions/v1/twilio-voice?step=menu',
);

let getUserCalls = 0;
const missing = await authorizeDispatchCaller({
  authorizationHeader: null,
  anonKey: 'anon-key',
  requireWriter: true,
  getUser: async () => {
    getUserCalls += 1;
    return { id: 'user-1' };
  },
  getRole: async () => 'owner',
});
assert.equal(missing.ok, false);
assert.equal(missing.ok === false && missing.status, 401);
assert.equal(getUserCalls, 0, 'missing header does not call getUser');

const anon = await authorizeDispatchCaller({
  authorizationHeader: 'Bearer anon-key',
  anonKey: 'anon-key',
  requireWriter: true,
  getUser: async () => {
    getUserCalls += 1;
    return { id: 'user-1' };
  },
  getRole: async () => 'owner',
});
assert.equal(anon.ok, false);
assert.equal(anon.ok === false && anon.status, 401);
assert.equal(getUserCalls, 0, 'anon key does not call getUser');

const serviceKey = await authorizeDispatchCaller({
  authorizationHeader: 'Bearer service-role-key',
  anonKey: 'anon-key',
  serviceRoleKey: 'service-role-key',
  requireWriter: true,
  getUser: async () => {
    getUserCalls += 1;
    return { id: 'user-1' };
  },
  getRole: async () => 'owner',
});
assert.equal(serviceKey.ok, false);
assert.equal(serviceKey.ok === false && serviceKey.status, 401);
assert.equal(getUserCalls, 0, 'service role key does not call getUser');

let seenToken = '';
const invalid = await authorizeDispatchCaller({
  authorizationHeader: 'Bearer not-a-user',
  anonKey: 'anon-key',
  requireWriter: true,
  getUser: async (token) => {
    seenToken = token;
    return null;
  },
  getRole: async () => 'owner',
});
assert.equal(seenToken, 'not-a-user');
assert.equal(invalid.ok, false);
assert.equal(invalid.ok === false && invalid.status, 401);

const office = await authorizeDispatchCaller({
  authorizationHeader: 'Bearer user-jwt',
  anonKey: 'anon-key',
  requireWriter: true,
  getUser: async (token) => {
    assert.equal(token, 'user-jwt');
    return { id: 'user-office' };
  },
  getRole: async (userId) => {
    assert.equal(userId, 'user-office');
    return 'office';
  },
});
assert.equal(office.ok, false);
assert.equal(office.ok === false && office.status, 403);
assert.equal(
  office.ok === false && office.error,
  'Read-only role cannot send messages.',
);

const officeRead = await authorizeDispatchCaller({
  authorizationHeader: 'Bearer user-jwt',
  anonKey: 'anon-key',
  requireWriter: false,
  getUser: async () => ({ id: 'user-office' }),
  getRole: async () => 'office',
});
assert.deepEqual(officeRead, { ok: true, userId: 'user-office', role: 'office' });

const owner = await authorizeDispatchCaller({
  authorizationHeader: 'Bearer user-jwt',
  anonKey: 'anon-key',
  requireWriter: true,
  getUser: async () => ({ id: 'user-owner' }),
  getRole: async () => 'owner',
});
assert.deepEqual(owner, { ok: true, userId: 'user-owner', role: 'owner' });

const crew = await authorizeDispatchCaller({
  authorizationHeader: 'Bearer user-jwt',
  anonKey: 'anon-key',
  requireWriter: true,
  writerError: 'Read-only role cannot edit crew abilities.',
  getUser: async () => ({ id: 'user-crew' }),
  getRole: async () => 'crew',
});
assert.deepEqual(crew, { ok: true, userId: 'user-crew', role: 'crew' });

const noRole = await authorizeDispatchCaller({
  authorizationHeader: 'Bearer user-jwt',
  anonKey: 'anon-key',
  requireWriter: true,
  getUser: async () => ({ id: 'user-new' }),
  getRole: async () => null,
});
assert.equal(noRole.ok, false);
assert.equal(noRole.ok === false && noRole.status, 403);

console.log('edge-security-checks: ok');
