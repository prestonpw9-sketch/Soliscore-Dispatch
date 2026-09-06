/** Display helpers for YYYY-MM-DD board dates (America/Phoenix calendar days). */

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
