/** Billing milestones: Rough 40% / Top-out 40% / Trim 20%. */

export const BILLING_MILESTONES = [
  { key: 'rough',  label: 'Rough-In', percent: 40 },
  { key: 'topout', label: 'Top-Out',  percent: 40 },
  { key: 'trim',   label: 'Trim',     percent: 20 },
] as const;

export type BillingMilestoneKey = (typeof BILLING_MILESTONES)[number]['key'];

export type ProjectBilling = {
  id: string;
  builderId: string;
  name: string;
  address: string | null;
  status: string | null;
  contractAmount: number | null;
  roughBilled: boolean;
  topoutBilled: boolean;
  trimBilled: boolean;
  roughBillBy: string | null;
  topoutBillBy: string | null;
  trimBillBy: string | null;
};

/** Map a job phase / service type onto a billable milestone (or null). */
export function phaseToMilestone(
  phase: string | null | undefined,
  serviceType?: string | null,
): BillingMilestoneKey | null {
  const raw = `${phase ?? ''} ${serviceType ?? ''}`.toLowerCase();
  if (/trim|finish/.test(raw)) return 'trim';
  if (/top[\s-]?out/.test(raw)) return 'topout';
  if (/rough|underground|pre[\s-]?slab|slab/.test(raw)) return 'rough';
  return null;
}

/** Work-complete % inferred from the furthest plumbing phase reached. */
export function phaseCompletePercent(phase: string | null | undefined): number {
  const p = (phase ?? '').toLowerCase();
  if (/trim|finish/.test(p)) return 100;
  if (/top[\s-]?out/.test(p)) return 80;
  if (/rough|underground/.test(p)) return 40;
  if (/service|t&m|inspection/.test(p)) return 0;
  return 0;
}

export function billedPercent(project: Pick<ProjectBilling, 'roughBilled' | 'topoutBilled' | 'trimBilled'>): number {
  let pct = 0;
  if (project.roughBilled) pct += 40;
  if (project.topoutBilled) pct += 40;
  if (project.trimBilled) pct += 20;
  return pct;
}

export function milestoneAmount(contractAmount: number | null | undefined, key: BillingMilestoneKey): number | null {
  if (contractAmount == null || Number.isNaN(contractAmount)) return null;
  const pct = key === 'trim' ? 0.2 : 0.4;
  return Math.round(contractAmount * pct * 100) / 100;
}

/** YYYY-MM-DD offset from a base date string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Suggested invoice-by date: 20 days before work starts. */
export function suggestedBillBy(workStartDate: string): string {
  return addDays(workStartDate, -20);
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Normalize free-text for fuzzy customer/project matching. */
export function normalizeMatchKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Soft-match a job to a customer when customer_id is missing:
 * builder name contained in job title, or project name match.
 */
export function jobMatchesCustomer(
  job: { customerId?: string; customerName: string; address?: string },
  customer: { id: string; name: string },
  projectNames: string[] = [],
): boolean {
  if (job.customerId && job.customerId === customer.id) return true;
  const jobKey = normalizeMatchKey(job.customerName);
  const nameKey = normalizeMatchKey(customer.name);
  if (nameKey.length >= 3 && jobKey.includes(nameKey)) return true;
  for (const pn of projectNames) {
    const pKey = normalizeMatchKey(pn);
    if (pKey.length >= 3 && jobKey.includes(pKey)) return true;
    // SC#571 ↔ Stone Canyon …571…
    const sc = pn.match(/^sc#?\s*(\d+)/i);
    if (sc && jobKey.includes(sc[1]) && (jobKey.includes('stonecanyon') || jobKey.includes('sc'))) {
      return true;
    }
  }
  return false;
}
