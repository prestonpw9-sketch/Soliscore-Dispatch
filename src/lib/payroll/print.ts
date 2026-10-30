import {
  approvalKey,
  formatHours,
  formatPhoenixClock,
  type PayrollWeek,
} from './data';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function payrollPrintHtml(
  title: string,
  weeks: PayrollWeek[],
  names: Record<string, string>,
  approved: Set<string>,
): string {
  const sections = weeks.map(week => {
    const name = names[week.userId] ?? 'Crew member';
    const weekApproved = approved.has(approvalKey(week.userId, 'week', week.weekStart));
    const rows = week.days.map(day => {
      const flags = day.anomalies.map(anomaly => escapeHtml(anomaly.message)).join('<br>');
      const jobs = day.jobs
        .map(job => `${escapeHtml(job.jobName)}: travel ${formatHours(job.travelMinutes)} · on site ${formatHours(job.onsiteMinutes)}${job.pinned === false ? ' (unpinned)' : ''}`)
        .join('<br>');
      return `<tr>
        <td>${escapeHtml(day.workDate)}</td>
        <td>${day.shifts.map(shift => escapeHtml(formatPhoenixClock(shift.clockIn))).join('<br>')}</td>
        <td>${day.shifts.map(shift => escapeHtml(formatPhoenixClock(shift.clockOut))).join('<br>')}</td>
        <td>${day.shifts.map(shift => escapeHtml(shift.endReason === 'auto_stop' ? 'Auto-stop' : shift.endReason === 'clock_out' ? 'Clock-out' : 'Open')).join('<br>')}</td>
        <td class="n">${formatHours(day.shopMinutes)}</td>
        <td class="n">${formatHours(day.travelMinutes)}</td>
        <td class="n">${formatHours(day.onsiteMinutes)}</td>
        <td class="n">${formatHours(day.lunchDeductedMinutes)}</td>
        <td class="n"><b>${formatHours(day.paidMinutes)}</b></td>
        <td class="n">${day.overtimeMinutes ? formatHours(day.overtimeMinutes) : ''}</td>
        <td>${approved.has(approvalKey(day.userId, 'day', day.workDate)) ? '✓' : ''}</td>
        <td class="s">${jobs}${jobs && flags ? '<br>' : ''}${flags ? `<span class="f">${flags}</span>` : ''}</td>
      </tr>`;
    }).join('');
    return `<section>
      <h2>${escapeHtml(name)} — week of ${escapeHtml(week.weekStart)} to ${escapeHtml(week.weekEnd)}</h2>
      <table>
        <thead><tr>
          <th>Date</th><th>In</th><th>Out</th><th>End</th><th>Shop</th><th>Travel</th><th>On site</th>
          <th>Lunch ded.</th><th>Paid</th><th>OT</th><th>Appr.</th><th>Jobs / flags</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="8">Week total${week.overtime ? ' — OVERTIME' : ''}${weekApproved ? ' — approved' : ''}</td>
          <td class="n"><b>${formatHours(week.paidMinutes)}</b></td>
          <td class="n">${week.overtimeMinutes ? formatHours(week.overtimeMinutes) : ''}</td>
          <td colspan="2">Regular ${formatHours(week.regularMinutes)} h</td>
        </tr></tfoot>
      </table>
      <p class="sig">Employee signature ____________________ &nbsp; Owner ____________________</p>
    </section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font: 11px/1.35 system-ui, sans-serif; color: #111; margin: 16px; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  h2 { font-size: 13px; margin: 16px 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 3px 4px; vertical-align: top; text-align: left; }
  th { background: #eee; }
  td.n { text-align: right; white-space: nowrap; }
  td.s { font-size: 10px; }
  .f { color: #a00; }
  .sig { margin-top: 18px; }
  section { page-break-inside: avoid; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p>Hours are decimal. Times are America/Phoenix. Lunch deducted is unpaid time removed from the day.</p>
${sections || '<p>No shifts in this period.</p>'}
</body></html>`;
}

export function openPrintView(html: string): boolean {
  const view = window.open('', '_blank');
  if (!view) return false;
  view.document.open();
  view.document.write(html);
  view.document.close();
  view.focus();
  setTimeout(() => view.print(), 250);
  return true;
}
