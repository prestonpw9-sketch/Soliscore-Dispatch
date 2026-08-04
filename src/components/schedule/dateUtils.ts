/** Shared YYYY-MM-DD helpers for Schedule hybrid views (Phoenix-local). */

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(s: string, n: number): string {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseYMD(b).getTime() - parseYMD(a).getTime()) / 86_400_000);
}

export function todayYMD(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function phoenixMonthAnchor(fromYmd = todayYMD()): Date {
  const [y, m] = fromYmd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

/** Sunday–Saturday week containing the given day. */
export function weekContaining(day: string): string[] {
  const d = parseYMD(day);
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(sunday);
    x.setDate(sunday.getDate() + i);
    return toYMD(x);
  });
}

export function formatShort(ymd: string): string {
  return parseYMD(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Stable color per technician id for bars/chips. */
export function techColor(id: string | null | undefined): string {
  if (!id) return '#94a3b8';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 55% 42%)`;
}
