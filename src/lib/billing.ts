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

export function isMilestoneBilled(
  project: Pick<ProjectBilling, 'roughBilled' | 'topoutBilled' | 'trimBilled'>,
  key: BillingMilestoneKey,
): boolean {
  if (key === 'rough') return project.roughBilled;
  if (key === 'topout') return project.topoutBilled;
  return project.trimBilled;
}

export function milestoneBillBy(
  project: Pick<ProjectBilling, 'roughBillBy' | 'topoutBillBy' | 'trimBillBy'>,
  key: BillingMilestoneKey,
): string | null {
  if (key === 'rough') return project.roughBillBy;
  if (key === 'topout') return project.topoutBillBy;
  return project.trimBillBy;
}

/** YYYY-MM-DD offset from a base date string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Suggested invoice-by date: 20 days before work starts (midpoint of the
 * 15–30 day look-ahead window the office uses).
 */
export function suggestedBillBy(workStartDate: string): string {
  return addDays(workStartDate, -20);
}

export type BillingLookaheadItem = {
  projectId: string;
  projectName: string;
  customerId: string;
  customerName: string;
  milestone: BillingMilestoneKey;
  milestoneLabel: string;
  percent: number;
  amount: number | null;
  workDate: string;
  billBy: string;
  urgency: 'overdue' | 'due_soon' | 'upcoming';
  jobId?: string;
  jobTitle?: string;
};

type JobLike = {
  id: string;
  customerId?: string;
  customerName: string;
  projectId?: string;
  date: string;
  endDate?: string;
  phase: string;
  serviceType?: string;
};

/**
 * Build 15–30 day billing look-ahead from scheduled phase work that is not yet billed.
 * - overdue: work starts in <15 days (or bill_by already passed)
 * - due_soon: work starts in 15–30 days
 * - upcoming: bill_by set within next 30 days even without a matching job
 */
export function buildBillingLookahead(
  projects: ProjectBilling[],
  jobs: JobLike[],
  customerNameById: Map<string, string>,
  opts?: { today?: string; minLeadDays?: number; maxLeadDays?: number },
): BillingLookaheadItem[] {
  const today = opts?.today ?? todayIso();
  const minLead = opts?.minLeadDays ?? 15;
  const maxLead = opts?.maxLeadDays ?? 30;
  const windowEnd = addDays(today, maxLead);
  const items: BillingLookaheadItem[] = [];
  const seen = new Set<string>();

  const projectById = new Map(projects.map(p => [p.id, p]));

  for (const job of jobs) {
    const milestone = phaseToMilestone(job.phase, job.serviceType);
    if (!milestone) continue;
    const workDate = job.date;
    if (!workDate || workDate < today) continue;

    const project = job.projectId ? projectById.get(job.projectId) : undefined;
    // Prefer project billing state; skip if that milestone is already billed.
    if (project && isMilestoneBilled(project, milestone)) continue;

    const daysOut = Math.round(
      (new Date(`${workDate}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime())
      / 86_400_000,
    );
    // Only surface work inside/near the lead window (up to maxLead, plus overdue < minLead).
    if (daysOut > maxLead) continue;

    const customerId = job.customerId || project?.builderId || '';
    if (!customerId && !project) continue;

    const resolvedCustomerId = customerId || project!.builderId;
    const key = `${project?.id ?? 'job'}:${milestone}:${workDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const meta = BILLING_MILESTONES.find(m => m.key === milestone)!;
    const billBy = (project && milestoneBillBy(project, milestone)) || suggestedBillBy(workDate);
    let urgency: BillingLookaheadItem['urgency'] = 'upcoming';
    if (daysOut < minLead || billBy < today) urgency = 'overdue';
    else if (daysOut <= maxLead) urgency = 'due_soon';

    items.push({
      projectId: project?.id ?? '',
      projectName: project?.name ?? job.customerName,
      customerId: resolvedCustomerId,
      customerName: customerNameById.get(resolvedCustomerId) ?? job.customerName,
      milestone,
      milestoneLabel: meta.label,
      percent: meta.percent,
      amount: milestoneAmount(project?.contractAmount ?? null, milestone),
      workDate,
      billBy,
      urgency,
      jobId: job.id,
      jobTitle: job.customerName,
    });
  }

  // Explicit bill_by dates on projects (no job needed).
  for (const project of projects) {
    for (const m of BILLING_MILESTONES) {
      if (isMilestoneBilled(project, m.key)) continue;
      const billBy = milestoneBillBy(project, m.key);
      if (!billBy) continue;
      if (billBy > windowEnd) continue;
      const key = `${project.id}:${m.key}:billby`;
      if (seen.has(`${project.id}:${m.key}:${billBy}`)) continue;
      if ([...seen].some(s => s.startsWith(`${project.id}:${m.key}:`))) continue;
      seen.add(key);

      let urgency: BillingLookaheadItem['urgency'] = 'upcoming';
      if (billBy < today) urgency = 'overdue';
      else if (billBy <= addDays(today, minLead)) urgency = 'due_soon';

      items.push({
        projectId: project.id,
        projectName: project.name,
        customerId: project.builderId,
        customerName: customerNameById.get(project.builderId) ?? 'Builder',
        milestone: m.key,
        milestoneLabel: m.label,
        percent: m.percent,
        amount: milestoneAmount(project.contractAmount, m.key),
        workDate: billBy,
        billBy,
        urgency,
      });
    }
  }

  const rank = { overdue: 0, due_soon: 1, upcoming: 2 };
  return items.sort((a, b) => {
    const u = rank[a.urgency] - rank[b.urgency];
    if (u !== 0) return u;
    return a.billBy.localeCompare(b.billBy);
  });
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
