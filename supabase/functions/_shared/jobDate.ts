/**
 * Board dates for the superintendent SMS/voice dispatcher.
 * GPT-4o often emits 2023 (training-data year) when a super says "11/20" with no year.
 * Always snap those onto the current/next America/Phoenix year.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MDY = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/;

export function phoenixYMD(at: Date = new Date(), offsetDays = 0): string {
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return offsetDays ? addDays(todayStr, offsetDays) : todayStr;
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Reinterpret a past / stale-year date as the next occurrence of that month/day. */
export function snapToUpcomingYear(year: number, month: number, day: number, today: string): string | null {
  const currentYear = Number(today.slice(0, 4));
  if (!currentYear) return ymd(year, month, day);
  const yesterday = addDays(today, -1);
  const asGiven = ymd(year, month, day);
  if (!asGiven) return null;

  if (asGiven >= yesterday && year >= currentYear && year <= currentYear + 2) {
    return asGiven;
  }

  let next = ymd(currentYear, month, day);
  if (!next) return asGiven;
  if (next < yesterday) {
    next = ymd(currentYear + 1, month, day);
  }
  return next ?? asGiven;
}

export function parseFlexibleDate(raw: unknown, today: string): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  const iso = s.match(ISO);
  if (iso) {
    return snapToUpcomingYear(Number(iso[1]), Number(iso[2]), Number(iso[3]), today);
  }

  const mdy = s.match(MDY);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = mdy[3] ? Number(mdy[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    return snapToUpcomingYear(year, month, day, today);
  }

  return null;
}

/** Accept YYYY-MM-DD (or M/D[/YYYY]); remap stale years; default to tomorrow. */
export function resolveBoardDate(raw: unknown, today: string = phoenixYMD()): string {
  return parseFlexibleDate(raw, today) ?? addDays(today, 1);
}

export function formatBoardDate(ymdStr: string): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  if (!y || !m || !d) return ymdStr;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatBoardSpan(start: string, end?: string | null): string {
  if (!end || end === start) return formatBoardDate(start);
  return `${formatBoardDate(start)} – ${formatBoardDate(end)}`;
}

export function phoenixNowLabel(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(at);
}
