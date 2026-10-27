/**
 * Twilio webhook signature check (X-Twilio-Signature).
 *
 * Twilio HMAC-SHA1s the exact public URL it requested, then appends each POST
 * field name and value in sorted name order, with the Auth Token as the key.
 * Compare that digest to the header in constant time.
 *
 * Supabase often shows the function an internal URL. The signature must use the
 * public URL Twilio signed:
 * - x-forwarded-proto / x-forwarded-host / host, when those are the public host
 * - otherwise the request URL when it is already /functions/v1/<name>
 *
 * Optional env TWILIO_WEBHOOK_URL (Edge Function secret, not a Vite variable):
 * - Public origin, recommended when one value is shared by every function:
 *   https://<project-ref>.supabase.co
 *   The function path and the request query string are appended.
 * - Or the exact console webhook, for example
 *   https://<project-ref>.supabase.co/functions/v1/super-processor
 *   A query string on the override replaces the request query. Leave the query
 *   off for twilio-voice so ?step= callbacks still validate.
 * The value must match the Twilio console webhook (scheme, host, path, no extra
 * slash). Voice <Gather>/<Record>/<Dial> callbacks keep that host.
 */

export interface WebhookUrlInput {
  requestUrl: string;
  functionName: string;
  getHeader: (name: string) => string | null;
  override?: string | null;
}

function firstCsv(value: string | null | undefined): string {
  if (!value) return '';
  return value.split(',')[0].trim();
}

function stripDefaultPort(host: string, proto: string): string {
  if (proto === 'https' && host.endsWith(':443')) return host.slice(0, -4);
  if (proto === 'http' && host.endsWith(':80')) return host.slice(0, -3);
  return host;
}

function looksInternalHost(host: string): boolean {
  const name = host.split(':')[0].toLowerCase();
  return name === 'localhost'
    || name === '127.0.0.1'
    || name === '0.0.0.0'
    || name.endsWith('.internal')
    || name.includes('edge-runtime')
    || name.includes('supabase_edge');
}

function publicPath(functionName: string): string {
  return `/functions/v1/${functionName}`;
}

function pathFromRequest(pathname: string, functionName: string): string {
  const expected = publicPath(functionName);
  if (pathname === expected || pathname.startsWith(`${expected}/`)) return pathname;
  return expected;
}

function overrideTargetsFunction(pathname: string, functionName: string): boolean {
  const expected = publicPath(functionName);
  return pathname === expected
    || pathname === `${expected}/`
    || pathname.endsWith(`/${functionName}`)
    || pathname.endsWith(`/${functionName}/`);
}

export function buildPublicWebhookUrl(input: WebhookUrlInput): string {
  const incoming = new URL(input.requestUrl);
  const computedPath = pathFromRequest(incoming.pathname, input.functionName);
  const search = incoming.search;
  const override = (input.override ?? '').trim();

  if (override) {
    const parsed = new URL(override);
    const proto = parsed.protocol.replace(':', '');
    const host = stripDefaultPort(parsed.host, proto);
    const usePath = parsed.pathname && parsed.pathname !== '/' && overrideTargetsFunction(parsed.pathname, input.functionName)
      ? parsed.pathname
      : computedPath;
    const useSearch = parsed.search || search;
    return `${proto}://${host}${usePath}${useSearch}`;
  }

  const forwardedProto = firstCsv(input.getHeader('x-forwarded-proto'));
  const forwardedHost = firstCsv(input.getHeader('x-forwarded-host'));
  const hostHeader = firstCsv(input.getHeader('host'));
  const forwardedUri = input.getHeader('x-forwarded-uri') ?? input.getHeader('x-original-url');

  let uriPath = computedPath;
  let uriSearch = search;
  if (forwardedUri) {
    try {
      const parsed = forwardedUri.startsWith('http')
        ? new URL(forwardedUri)
        : new URL(forwardedUri, 'https://placeholder.local');
      if (parsed.pathname.includes(publicPath(input.functionName))) {
        uriPath = parsed.pathname;
        if (parsed.search) uriSearch = parsed.search;
      }
    } catch {
      // Ignore a malformed forwarded URI and keep the request path.
    }
  }

  const requestPathIsPublic = incoming.pathname === publicPath(input.functionName)
    || incoming.pathname.startsWith(`${publicPath(input.functionName)}/`);
  if (
    !forwardedProto
    && !forwardedHost
    && !forwardedUri
    && requestPathIsPublic
    && !looksInternalHost(incoming.host)
  ) {
    return `${incoming.origin}${incoming.pathname}${incoming.search}`;
  }

  let proto = forwardedProto || incoming.protocol.replace(':', '') || 'https';
  let host = forwardedHost || hostHeader || incoming.host;
  if (looksInternalHost(host) && hostHeader && !looksInternalHost(hostHeader)) host = hostHeader;
  if (looksInternalHost(host) && !looksInternalHost(incoming.host)) {
    host = incoming.host;
    proto = incoming.protocol.replace(':', '') || proto;
  }
  host = stripDefaultPort(host, proto);
  return `${proto}://${host}${uriPath}${uriSearch}`;
}

export function publicWebhookUrlFromRequest(
  req: Request,
  functionName: string,
  override?: string | null,
): string {
  return buildPublicWebhookUrl({
    requestUrl: req.url,
    functionName,
    getHeader: (name) => req.headers.get(name),
    override,
  });
}

/**
 * POST body as Twilio signs it: names sorted, each name immediately followed by
 * its value. Repeated names use each distinct value, sorted.
 */
export function twilioSignaturePayload(url: string, params: URLSearchParams): string {
  const grouped = new Map<string, string[]>();
  for (const [key, value] of params.entries()) {
    const list = grouped.get(key);
    if (list) list.push(value);
    else grouped.set(key, [value]);
  }

  let data = url;
  for (const key of [...grouped.keys()].sort()) {
    const values = [...new Set(grouped.get(key) ?? [])].sort();
    for (const value of values) data += key + value;
  }
  return data;
}

/**
 * Twilio signs the URL with or without the default port (:443 / :80).
 * Try both so a proxy that adds or drops that port still matches.
 */
export function twilioSignatureUrls(url: string): string[] {
  const match = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)/i.exec(url);
  if (!match) return [url];
  const scheme = match[1];
  const authority = match[2];
  const rest = url.slice(match[0].length);
  const userInfoEnd = authority.lastIndexOf('@');
  const userInfo = authority.slice(0, userInfoEnd + 1);
  const hostAndPort = authority.slice(userInfoEnd + 1);
  const portStart = hostAndPort.indexOf(':', hostAndPort.lastIndexOf(']') + 1);
  const host = portStart === -1 ? hostAndPort : hostAndPort.slice(0, portStart);
  const port = portStart === -1 ? '' : hostAndPort.slice(portStart);
  const schemeLower = scheme.toLowerCase();
  const defaultPort = schemeLower === 'https://' ? ':443' : schemeLower === 'http://' ? ':80' : '';
  const withoutPort = `${scheme}${userInfo}${host}${rest}`;
  const candidates = [url];
  if (!candidates.includes(withoutPort)) candidates.push(withoutPort);
  if (defaultPort && (port === '' || port === defaultPort)) {
    const withPort = `${scheme}${userInfo}${host}${defaultPort}${rest}`;
    if (!candidates.includes(withPort)) candidates.push(withPort);
  }
  return candidates;
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return mismatch === 0;
}

export async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function validateTwilioSignature(opts: {
  authToken: string;
  signatureHeader: string | null | undefined;
  url: string;
  params: URLSearchParams;
}): Promise<boolean> {
  const header = (opts.signatureHeader ?? '').trim();
  if (!header || !opts.authToken) return false;
  let matched = 0;
  for (const url of twilioSignatureUrls(opts.url)) {
    const expected = await hmacSha1Base64(
      opts.authToken,
      twilioSignaturePayload(url, opts.params),
    );
    matched |= timingSafeEqualString(expected, header) ? 1 : 0;
  }
  return matched === 1;
}
