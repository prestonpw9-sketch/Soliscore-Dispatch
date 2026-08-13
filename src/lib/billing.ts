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
  /** Percent (0-100) of each milestone invoiced so far — supports partial billing. */
  roughBilledPct: number;
  topoutBilledPct: number;
  trimBilledPct: number;
  roughBillBy: string | null;
  topoutBillBy: string | null;
  trimBillBy: string | null;
};

export function milestonePctFor(
  project: Pick<ProjectBilling, 'roughBilledPct' | 'topoutBilledPct' | 'trimBilledPct'>,
  key: BillingMilestoneKey,
): number {
  if (key === 'rough') return project.roughBilledPct;
  if (key === 'topout') return project.topoutBilledPct;
  return project.trimBilledPct;
}

export function milestoneBillBy(
  project: Pick<ProjectBilling, 'roughBillBy' | 'topoutBillBy' | 'trimBillBy'>,
  key: BillingMilestoneKey,
): string | null {
  if (key === 'rough') return project.roughBillBy;
  if (key === 'topout') return project.topoutBillBy;
  return project.trimBillBy;
}

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

/** Overall % of the contract billed so far, weighted by each milestone's share (40/40/20). */
export function billedPercent(
  project: Pick<ProjectBilling, 'roughBilledPct' | 'topoutBilledPct' | 'trimBilledPct'>,
): number {
  const weighted = BILLING_MILESTONES.reduce(
    (sum, m) => sum + (milestonePctFor(project, m.key) / 100) * m.percent,
    0,
  );
  return Math.round(weighted);
}

/** Full dollar value of a milestone (its share of the contract), regardless of what's billed. */
export function milestoneAmount(contractAmount: number | null | undefined, key: BillingMilestoneKey): number | null {
  if (contractAmount == null || Number.isNaN(contractAmount)) return null;
  const meta = BILLING_MILESTONES.find(m => m.key === key)!;
  return Math.round(contractAmount * (meta.percent / 100) * 100) / 100;
}

/** Dollar amount actually billed for a milestone so far (full value × logged %). */
export function milestoneBilledAmount(
  contractAmount: number | null | undefined,
  key: BillingMilestoneKey,
  pct: number,
): number | null {
  const full = milestoneAmount(contractAmount, key);
  if (full == null) return null;
  return Math.round(full * (Math.max(0, Math.min(100, pct)) / 100) * 100) / 100;
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
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

/** Suggested invoice-by date: 20 days before work starts. */
export function suggestedBillBy(workStartDate: string): string {
  return addDays(workStartDate, -20);
}

/** Normalize free-text for fuzzy customer/project matching. */
export function normalizeMatchKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Soft-match a job to a customer when customer_id is missing:
 * builder name contained in job title, or project name match / prefix (DCS ↔ DCS Mesa).
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
    if (jobMatchesProjectName(job.customerName, pn)) return true;
  }
  return false;
}

/** Match job title to project name (exact-ish, contains, or short prefix like DCS → DCS Mesa). */
export function jobMatchesProjectName(jobTitle: string, projectName: string): boolean {
  const jobKey = normalizeMatchKey(jobTitle);
  const pKey = normalizeMatchKey(projectName);
  if (!jobKey || !pKey) return false;
  if (pKey.length >= 3 && jobKey.includes(pKey)) return true;
  if (jobKey.length >= 3 && pKey.startsWith(jobKey)) return true;
  // SC#571 ↔ Stone Canyon …571…
  const sc = projectName.match(/^sc#?\s*(\d+)/i);
  if (sc && jobKey.includes(sc[1]) && (jobKey.includes('stonecanyon') || jobKey.includes('sc'))) {
    return true;
  }
  return false;
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
  status?: string;
};

/**
 * Upcoming scheduled phase work with an estimated bill-by date.
 * No urgency / "Bill now" labels — owners decide timing from the adjustable dates.
 * Includes work up to ~90 days out so longer lead schedules (e.g. DCS Mesa) still appear.
 */
export function buildBillingLookahead(
  projects: ProjectBilling[],
  jobs: JobLike[],
  customerNameById: Map<string, string>,
  opts?: { today?: string; maxLeadDays?: number },
): BillingLookaheadItem[] {
  const today = opts?.today ?? todayIso();
  const maxLead = opts?.maxLeadDays ?? 90;
  const items: BillingLookaheadItem[] = [];
  const seen = new Set<string>();
  const projectById = new Map(projects.map(p => [p.id, p]));

  const resolveProject = (job: JobLike): ProjectBilling | undefined => {
    if (job.projectId && projectById.has(job.projectId)) return projectById.get(job.projectId);
    return projects.find(p => jobMatchesProjectName(job.customerName, p.name));
  };

  for (const job of jobs) {
    if ((job.status ?? '').toLowerCase() === 'completed') continue;
    const milestone = phaseToMilestone(job.phase, job.serviceType);
    if (!milestone) continue;
    const workDate = job.date;
    if (!workDate || workDate < today) continue;

    const daysOut = Math.round(
      (new Date(`${workDate}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime())
      / 86_400_000,
    );
    if (daysOut > maxLead) continue;

    const project = resolveProject(job);
    // Skip milestones already fully invoiced on the project.
    if (project && milestonePctFor(project, milestone) >= 100) continue;

    const customerId = job.customerId || project?.builderId || '';
    if (!customerId && !project) continue;
    const resolvedCustomerId = customerId || project!.builderId;

    const key = `${project?.id ?? job.id}:${milestone}:${workDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const meta = BILLING_MILESTONES.find(m => m.key === milestone)!;
    const billBy = (project && milestoneBillBy(project, milestone)) || suggestedBillBy(workDate);

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
      jobId: job.id,
      jobTitle: job.customerName,
    });
  }

  // Explicit bill_by dates on projects (even without a matching future job).
  for (const project of projects) {
    for (const m of BILLING_MILESTONES) {
      if (milestonePctFor(project, m.key) >= 100) continue;
      const billBy = milestoneBillBy(project, m.key);
      if (!billBy || billBy < today) continue;
      if (billBy > addDays(today, maxLead)) continue;
      if ([...seen].some(s => s.startsWith(`${project.id}:${m.key}:`))) continue;
      seen.add(`${project.id}:${m.key}:billby`);

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
      });
    }
  }

  return items.sort((a, b) => a.billBy.localeCompare(b.billBy) || a.workDate.localeCompare(b.workDate));
}
