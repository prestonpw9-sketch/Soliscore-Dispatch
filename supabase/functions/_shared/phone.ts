/** US/Canada-first phone helpers shared by Twilio + dispatch AI edge functions. */

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

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

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digitsOnly(a ?? '');
  const db = digitsOnly(b ?? '');
  if (!da || !db) return false;
  const na = da.length === 11 && da.startsWith('1') ? da.slice(1) : da;
  const nb = db.length === 11 && db.startsWith('1') ? db.slice(1) : db;
  return na === nb;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
