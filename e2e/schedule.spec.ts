import { mkdir } from 'node:fs/promises';
import { test as base, expect, type Page } from '@playwright/test';
import {
  installSupabaseMock,
  JOBS,
  TECHS,
  type MockHandle,
  type RoleName,
} from './supabaseMock';

/**
 * End-to-end schedule coverage against an in-process Supabase mock.
 * Every request to the hosted project is fulfilled locally. Nothing is forwarded.
 *
 * Canonical phase / date / crew payloads are the same shapes main sends.
 * The one intentional delta is an unrecognized phase: this branch keeps it
 * (so Other survives a date edit) where main's normalizePhase would write Rough-In.
 */

const test = base.extend<{ role: RoleName; mock: MockHandle }>({
  role: ['owner', { option: true }],
  mock: async ({ page, role }, use) => {
    const mock = await installSupabaseMock(page, { role });
    await use(mock);
  },
});

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 768;
}

async function shot(page: Page, name: string, fullPage = true) {
  await mkdir('/opt/cursor/artifacts', { recursive: true });
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage });
}

async function openSchedule(page: Page) {
  await page.goto('/?view=schedule');
  await expect(page.getByLabel('Search schedule')).toBeVisible();
}

async function showMonth(page: Page) {
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.locator('#schedule-section-rough-in')).toContainText('3 jobs');
}

function jobWrites(mock: MockHandle, table = 'jobs') {
  return mock.writes.filter(write => write.table === table);
}

function section(page: Page, id: string) {
  return page.locator(`#schedule-section-${id}`);
}

async function expectBoardCounts(page: Page) {
  await expect(section(page, 'rough-in')).toContainText('3 jobs');
  await expect(section(page, 'top-out')).toContainText('2 jobs');
  await expect(section(page, 'trim')).toContainText('1 job');
  await expect(section(page, 'final')).toContainText('1 job');
  await expect(section(page, 'punch')).toContainText('1 job');
  await expect(section(page, 'service-call')).toContainText('2 jobs');
  await expect(section(page, 't-m')).toContainText('1 job');
  await expect(section(page, 'other')).toContainText('1 job');

  const rough = page.locator('#schedule-section-rough-in-panel');
  await expect(rough).toContainText('Mesa Rough House');
  await expect(rough).toContainText('Alias Rough House');
  await expect(rough).toContainText('Blank Phase House');
  await expect(page.locator('#schedule-section-service-call-panel')).toContainText('Angle Stop Call');
  await expect(page.locator('#schedule-section-service-call-panel')).toContainText('Alias Service House');
  await expect(page.locator('#schedule-section-other-panel')).toContainText('Warranty Hold');
  await expect(page.locator('#schedule-section-t-m-panel')).toContainText('Materials Extra');

  const jump = page.getByRole('navigation', { name: 'Jump to phase' });
  await expect(jump.getByRole('button', { name: 'Rough In 3' })).toBeVisible();
  await expect(jump.getByRole('button', { name: 'Service Calls 2' })).toBeVisible();
  await expect(jump.getByRole('button', { name: 'Other 1' })).toBeVisible();
}

test.afterEach(async ({ mock }) => {
  expect(mock.leaks, `request left the browser: ${mock.leaks.join(' | ')}`).toEqual([]);
});

for (const role of ['owner', 'crew', 'office'] as const) {
  test.describe(`${role}`, () => {
    test.use({ role });

    test('sections and counts include blank, alias, and unknown phases', async ({ page, mock }, info) => {
      void mock;
      await openSchedule(page);
      await showMonth(page);
      await expectBoardCounts(page);
      if (role === 'owner') await shot(page, `e2e-sections-${info.project.name}`);
    });

    test('collapse and expand persist after reload', async ({ page, mock }, info) => {
      void mock;
      await openSchedule(page);
      await showMonth(page);
      const header = section(page, 'rough-in').getByRole('button');
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#schedule-section-rough-in-panel')).toHaveCount(0);

      await page.reload();
      await showMonth(page);
      await expect(section(page, 'rough-in').getByRole('button')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#schedule-section-rough-in-panel')).toHaveCount(0);
      if (role === 'owner' && info.project.name === 'desktop') await shot(page, 'e2e-collapsed-desktop');

      await section(page, 'rough-in').getByRole('button').click();
      await expect(section(page, 'rough-in').getByRole('button')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#schedule-section-rough-in-panel')).toContainText('Mesa Rough House');

      await page.reload();
      await showMonth(page);
      await expect(section(page, 'rough-in').getByRole('button')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#schedule-section-rough-in-panel')).toContainText('Mesa Rough House');
    });

    test('jump bar scrolls and opens a collapsed section', async ({ page, mock }, info) => {
      void mock;
      await openSchedule(page);
      await showMonth(page);
      const serviceHeader = section(page, 'service-call').getByRole('button');
      await serviceHeader.click();
      await expect(serviceHeader).toHaveAttribute('aria-expanded', 'false');

      const jump = page.getByRole('navigation', { name: 'Jump to phase' });
      await jump.getByRole('button', { name: 'Service Calls 2' }).click();
      await expect(section(page, 'service-call').getByRole('button')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#schedule-section-service-call-panel')).toContainText('Angle Stop Call');

      await jump.getByRole('button', { name: 'Other 1' }).click();
      await expect.poll(async () => {
        const header = await section(page, 'other').boundingBox();
        const bar = await page.locator('#schedule-phase-jump').boundingBox();
        if (!header || !bar) return 9_999;
        return Math.round(header.y - (bar.y + bar.height));
      }).toBeLessThanOrEqual(24);
      await expect.poll(async () => {
        const header = await section(page, 'other').boundingBox();
        const bar = await page.locator('#schedule-phase-jump').boundingBox();
        if (!header || !bar) return -9_999;
        return Math.round(header.y - (bar.y + bar.height));
      }).toBeGreaterThanOrEqual(-4);
      if (role === 'owner' && info.project.name === 'desktop') await shot(page, 'e2e-jump-desktop', false);
    });

    test('search filters by customer, address, crew, and task', async ({ page, mock }, info) => {
      void mock;
      await openSchedule(page);
      await showMonth(page);
      const search = page.getByLabel('Search schedule');

      await search.fill('Mesa Rough');
      await expect(section(page, 'rough-in')).toContainText('1 job');
      await expect(page.locator('#schedule-section-rough-in-panel')).toContainText('Mesa Rough House');
      await expect(section(page, 'top-out')).toHaveCount(0);

      await search.fill('9 Oak');
      await expect(page.locator('#schedule-section-service-call-panel')).toContainText('Angle Stop Call');
      await expect(section(page, 'rough-in')).toHaveCount(0);

      await search.fill('Gabe');
      await expect(page.locator('#schedule-section-rough-in-panel')).toContainText('Mesa Rough House');
      await expect(page.locator('#schedule-section-rough-in-panel')).toContainText('Gabe');
      await expect(section(page, 'service-call')).toHaveCount(0);

      await search.fill('angle stop');
      await expect(page.locator('#schedule-section-service-call-panel')).toContainText('replace angle stop');
      await expect(page.locator('#schedule-section-service-call-panel')).toContainText('Angle Stop Call');
      if (role === 'owner' && info.project.name === 'desktop') await shot(page, 'e2e-search-desktop');

      await search.fill('zzzz-not-a-job');
      await expect(page.getByText(/No jobs match/)).toBeVisible();
      await page.getByLabel('Clear search').click();
      await expectBoardCounts(page);
    });

    test('month, timeline, and my day modes', async ({ page, mock }, info) => {
      void mock;
      await openSchedule(page);
      const heading = page.locator('h2');
      if (isPhone(page)) await expect(heading).toContainText('Today');
      else await expect(heading).toHaveText(/\w+ \d{4}/);

      await page.getByRole('button', { name: 'Month', exact: true }).click();
      await expect(heading).toHaveText(/\w+ \d{4}/);
      await expect(section(page, 'rough-in')).toContainText('3 jobs');

      await page.getByRole('button', { name: 'Timeline', exact: true }).click();
      await expect(heading).toContainText('–');
      await expect(section(page, 'rough-in')).toContainText('3 jobs');
      if (role === 'owner' && info.project.name === 'desktop') await shot(page, 'e2e-timeline-desktop');

      await page.getByRole('button', { name: 'My Day', exact: true }).click();
      await expect(heading).toContainText('Today');
      await page.getByRole('combobox').selectOption({ label: 'Gabe' });
      await expect(page.getByText('Mesa Rough House')).toBeVisible();
      await expect(page.getByText('Angle Stop Call')).toHaveCount(0);
      await page.getByRole('combobox').selectOption({ label: 'Rita' });
      await expect(page.locator('#schedule-section-service-call-panel')).toContainText('Angle Stop Call');
      await expect(page.getByText('Mesa Rough House')).toHaveCount(0);
      if (role === 'owner' && info.project.name === 'phone') await shot(page, 'e2e-myday-phone');
    });

    test('week and month navigation', async ({ page, mock }) => {
      void mock;
      await openSchedule(page);
      await showMonth(page);
      const heading = page.locator('h2');
      const monthLabel = (await heading.textContent())?.trim();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(heading).not.toHaveText(monthLabel ?? '');
      await expect(page.getByText('No jobs scheduled in this range.')).toBeVisible();
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await expect(section(page, 'rough-in')).toContainText('3 jobs');

      await page.getByRole('button', { name: 'Timeline', exact: true }).click();
      const timelineLabel = (await heading.textContent())?.trim();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(heading).not.toHaveText(timelineLabel ?? '');
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await expect(section(page, 'rough-in')).toContainText('3 jobs');
    });
  });
}

for (const role of ['owner', 'crew'] as const) {
  test.describe(`${role} edits`, () => {
    test.use({ role });

    test('assign, unassign, and time off blocks a plumber', async ({ page, mock }, info) => {
      await openSchedule(page);
      await showMonth(page);
      const job = page.locator('#schedule-section-rough-in-panel div.border-b', { hasText: 'Blank Phase House' }).first();
      await job.getByRole('button', { name: 'Add crew' }).click();
      const owen = job.getByRole('button', { name: /Off Owen/ });
      await expect(owen).toBeDisabled();
      const beforeBlock = mock.writes.length;
      await owen.click({ force: true });
      expect(mock.writes.slice(beforeBlock).filter(write => write.table === 'job_tasks' || write.table === 'jobs')).toEqual([]);

      await job.getByRole('button', { name: /^Rita/ }).click();
      await expect(job).toContainText('Rita');
      const taskInsert = jobWrites(mock, 'job_tasks').find(write => write.method === 'POST');
      expect(taskInsert?.body).toEqual([{
        job_id: JOBS.blank,
        technician_id: TECHS.rita,
        task: '',
        start_date: mock.range.start,
        end_date: mock.range.end,
        status: 'not_started',
        percent_complete: 0,
      }]);
      const assignPatch = jobWrites(mock).find(write =>
        write.method === 'PATCH' && write.query.includes(JOBS.blank),
      );
      expect(assignPatch?.body).toEqual({
        technician_ids: [TECHS.rita],
        technician_id: TECHS.rita,
      });
      if (role === 'owner' && info.project.name === 'desktop') await shot(page, 'e2e-assign-desktop');

      const crewRow = job.locator('.group', { hasText: 'Rita' });
      await crewRow.hover();
      await crewRow.getByTitle('Remove crew from job').click();
      await expect(job.getByText('No crew assigned yet.')).toBeVisible();
      expect(jobWrites(mock, 'job_tasks').some(write => write.method === 'DELETE')).toBe(true);
      const unassign = [...jobWrites(mock)].reverse().find(write =>
        write.method === 'PATCH' && write.query.includes(JOBS.blank),
      );
      expect(unassign?.body).toEqual({
        technician_ids: [],
        technician_id: null,
      });
    });

    test('editing start and end dates sends the main payload', async ({ page, mock }) => {
      await openSchedule(page);
      await showMonth(page);
      const shift = (ymd: string, n: number) => {
        const [year, month, day] = ymd.split('-').map(Number);
        return new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + n)).toISOString().slice(0, 10);
      };
      const nextStart = shift(mock.range.start, 3);
      const nextEnd = shift(mock.range.start, 10);

      await page.getByRole('button', { name: 'Mesa Rough House' }).click();
      await expect(page.getByRole('heading', { name: 'Edit job schedule' })).toBeVisible();
      await page.getByLabel('Start date').fill(nextStart);
      await page.getByLabel('End date').fill(nextEnd);
      await page.getByRole('button', { name: 'Save dates' }).click();
      await expect(page.getByRole('heading', { name: 'Edit job schedule' })).toBeHidden();
      await expect(page.locator('#schedule-section-rough-in-panel')).toContainText('Mesa Rough House');

      const patch = jobWrites(mock).find(write => write.method === 'PATCH' && write.query.includes(JOBS.mesa));
      expect(patch?.body).toEqual({
        date: nextStart,
        end_date: nextEnd,
        phase: 'Rough-In',
        inspection_passed: false,
        tm_enabled: false,
        tm_approved_by: null,
        tm_work_description: null,
        tm_hours: null,
      });
      const taskPatch = jobWrites(mock, 'job_tasks').find(write => write.method === 'PATCH');
      expect(taskPatch?.body).toEqual({
        start_date: nextStart,
        end_date: shift(mock.range.end, 3),
      });
    });

    test('phase moves forward and backward and the trim gate holds', async ({ page, mock }, info) => {
      await openSchedule(page);
      await showMonth(page);

      await page.getByLabel('Phase for Mesa Rough House').selectOption('Top-Out');
      await expect(page.locator('#schedule-section-top-out-panel')).toContainText('Mesa Rough House');
      await expect(section(page, 'rough-in')).toContainText('2 jobs');
      expect(jobWrites(mock).find(write => write.query.includes(JOBS.mesa))?.body).toEqual({
        phase: 'Top-Out',
        tm_enabled: false,
      });

      await page.getByLabel('Phase for Mesa Rough House').selectOption('Rough-In');
      await expect(page.locator('#schedule-section-rough-in-panel')).toContainText('Mesa Rough House');
      const backward = [...jobWrites(mock)].reverse().find(write => write.query.includes(JOBS.mesa));
      expect(backward?.body).toEqual({ phase: 'Rough-In', tm_enabled: false });

      const beforeTrim = jobWrites(mock).length;
      await page.getByLabel('Phase for Canyon Top Out').selectOption('Trim');
      await expect(page.getByText('Trim cannot start until inspection passes.')).toBeVisible();
      await expect(page.locator('#schedule-section-top-out-panel')).toContainText('Canyon Top Out');
      expect(jobWrites(mock).slice(beforeTrim).some(write =>
        JSON.stringify(write.body).includes('Trim'),
      )).toBe(false);
      if (role === 'owner' && info.project.name === 'desktop') await shot(page, 'e2e-trim-gate-desktop');

      const canyon = page.locator('#schedule-section-top-out-panel div.border-b', { hasText: 'Canyon Top Out' }).first();
      await canyon.getByRole('checkbox', { name: 'Inspection passed' }).check();
      await expect.poll(() => jobWrites(mock).some(write =>
        write.query.includes(JOBS.canyon) && JSON.stringify(write.body).includes('inspection_passed'),
      )).toBe(true);
      expect(jobWrites(mock).find(write =>
        write.query.includes(JOBS.canyon) && JSON.stringify(write.body).includes('inspection_passed'),
      )?.body).toEqual({ inspection_passed: true });

      await page.getByLabel('Phase for Canyon Top Out').selectOption('Trim');
      await expect(page.locator('#schedule-section-trim-panel')).toContainText('Canyon Top Out');
      expect([...jobWrites(mock)].reverse().find(write => write.query.includes(JOBS.canyon) && write.method === 'PATCH')?.body).toEqual({
        phase: 'Trim',
        tm_enabled: false,
      });
    });

    test('a new job lands in Rough In', async ({ page, mock }) => {
      await openSchedule(page);
      await showMonth(page);
      await page.getByRole('button', { name: 'New Job' }).click();
      await expect(page.getByRole('heading', { name: 'Schedule New Job' })).toBeVisible();
      await page.locator('#customerName').fill('Fresh Fixture Job');
      await page.locator('#serviceAddress').fill('500 New St');
      await page.locator('#description').fill('Install a new hose bib');
      await page.locator('#jobDate').fill(mock.range.start);
      await page.locator('#jobEndDate').fill(mock.range.start);
      await page.getByRole('button', { name: 'Create Job' }).click();
      await expect(page.locator('#schedule-section-rough-in-panel')).toContainText('Fresh Fixture Job');
      await expect(section(page, 'rough-in')).toContainText('4 jobs');

      const insert = jobWrites(mock).find(write => write.method === 'POST');
      const body = (insert?.body as Record<string, unknown>[])[0];
      expect(body).toMatchObject({
        title: 'Fresh Fixture Job',
        location: '500 New St',
        description: 'Install a new hose bib',
        phase: 'Rough-In',
        status: 'scheduled',
        date: mock.range.start,
        end_date: mock.range.start,
        service_type: 'Rough',
        startTime: '08:00',
        endTime: '17:00',
        technician_id: null,
        technician_ids: [],
        customer_id: null,
        project_id: null,
        tm_enabled: false,
        tm_approved_by: null,
        tm_work_description: null,
        tm_hours: null,
      });
    });

    test('a realtime insert refreshes into Punch', async ({ page, mock }) => {
      const logs: string[] = [];
      page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error' || /realtime|channel|postgres/i.test(text)) logs.push(`${msg.type()}: ${text}`);
      });
      await openSchedule(page);
      await showMonth(page);
      await expect.poll(() => mock.jobChannelCount()).toBeGreaterThan(0);
      await page.waitForTimeout(500);
      mock.pushJobInsert({
        id: 'job-live-punch',
        title: 'Live Punch Insert',
        phase: 'Punch',
        location: '15 Live Way',
      });
      await expect(section(page, 'punch'), `channels=${mock.jobChannelCount()} sends=${mock.realtimeSends}\n${logs.join('\n')}`).toContainText('2 jobs');
      await expect(page.locator('#schedule-section-punch-panel')).toContainText('Live Punch Insert');
    });

    test('an unknown phase stays put when dates are edited', async ({ page, mock }) => {
      await openSchedule(page);
      await showMonth(page);
      const [year, month, day] = mock.range.start.split('-').map(Number);
      const nextEnd = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + 5)).toISOString().slice(0, 10);
      await page.getByRole('button', { name: 'Warranty Hold' }).click();
      await page.getByLabel('End date').fill(nextEnd);
      await page.getByRole('button', { name: 'Save dates' }).click();
      await expect(page.getByRole('heading', { name: 'Edit job schedule' })).toBeHidden();
      await expect(page.locator('#schedule-section-other-panel')).toContainText('Warranty Hold');
      const patch = jobWrites(mock).find(write => write.query.includes(JOBS.warranty));
      expect(patch?.body, JSON.stringify(mock.writes.map(write => ({
        method: write.method,
        table: write.table,
        query: write.query,
        body: write.body,
      })))).toMatchObject({
        phase: 'Warranty',
        end_date: nextEnd,
        tm_enabled: false,
      });
      expect(JSON.stringify(patch?.body)).not.toContain('Rough-In');
    });
  });
}

test.describe('office view only', () => {
  test.use({ role: 'office' });

  test('schedule controls do not write', async ({ page, mock }, info) => {
    await openSchedule(page);
    await showMonth(page);
    await expect(page.getByLabel(/Phase for/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add crew' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Inspection passed' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mesa Rough House' })).toBeDisabled();
    await expect(page.getByTitle('Change start and end dates')).toHaveCount(0);
    await page.waitForTimeout(2_500);
    expect(mock.writes.filter(write => write.table === 'jobs' || write.table === 'job_tasks' || write.table === 'schedule_history')).toEqual([]);
    if (info.project.name === 'phone') await shot(page, 'e2e-office-phone');
    if (info.project.name === 'desktop') await shot(page, 'e2e-office-desktop');
  });
});
