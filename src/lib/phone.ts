/** US/Canada-first phone helpers for the plumber directory and Twilio. */

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Normalize a typed number to E.164. Returns null when it is not a usable US/CA cell. */
export function normalizeToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = digitsOnly(trimmed);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = digitsOnly(raw);
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length === 10) {
    return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return raw.trim();
}

export function telHref(raw: string | null | undefined): string | null {
  const e164 = normalizeToE164(raw);
  return e164 ? `tel:${e164}` : null;
}

export function smsHref(raw: string | null | undefined, body?: string): string | null {
  const e164 = normalizeToE164(raw);
  if (!e164) return null;
  if (body) return `sms:${e164}?body=${encodeURIComponent(body)}`;
  return `sms:${e164}`;
}

/** Match Twilio "From" values against stored crew cells. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digitsOnly(a ?? '');
  const db = digitsOnly(b ?? '');
  if (!da || !db) return false;
  const na = da.length === 11 && da.startsWith('1') ? da.slice(1) : da;
  const nb = db.length === 11 && db.startsWith('1') ? db.slice(1) : db;
  return na === nb;
}
