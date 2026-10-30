import { phoenixToday } from '@/lib/geofence/workHours';

export interface TimePunch {
  jobId: string;
  jobName: string;
  at: string;
}

const STORAGE_KEY = 'itdg-time-card-punches';

export function loadTimePunches(): TimePunch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(row => {
      if (!row || typeof row !== 'object') return [];
      const punch = row as Partial<TimePunch>;
      if (!punch.jobId || !punch.at) return [];
      return [{
        jobId: String(punch.jobId),
        jobName: String(punch.jobName ?? 'Job site'),
        at: String(punch.at),
      }];
    });
  } catch {
    return [];
  }
}

export function punchesOnDay(punches: TimePunch[], day: string): TimePunch[] {
  return punches.filter(punch => {
    const when = new Date(punch.at);
    return !Number.isNaN(when.getTime()) && phoenixToday(when) === day;
  });
}

/** Saved on this phone only. Does not write to Supabase. */
export function addTimePunch(punch: TimePunch): TimePunch[] {
  const next = [punch, ...loadTimePunches()].slice(0, 50);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
  return next;
}

export function formatPhoenixTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
