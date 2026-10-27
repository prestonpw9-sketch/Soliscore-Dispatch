import { test as base, expect, type Page } from '@playwright/test';
import {
  installSupabaseMock,
  JOBS,
  type MockHandle,
  type RoleName,
} from './supabaseMock';

/**
 * Completed / Under Warranty coverage against the in-process Supabase mock.
 * Nothing is forwarded to the hosted project.
 */

type Row = Record<string, unknown>;

/** Phoenix calendar day (no 5pm dispatch rollover) — what completion stamps use. */
function phoenixToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function addYears(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

const NEXT_YEAR = addYears(phoenixToday(), 1);

const COMPLETED_JOBS: Row[] = [
  {
    id: 'job-done-bath',
    title: 'Done Bath House',
    location: '42 Done Rd',
    phase: 'Trim',
    status: 'completed',
    completed_at: '2026-09-01T18:00:00.000Z',
    warranty_until: NEXT_YEAR,
  },
  {
    id: 'job-sunset-final',
    title: 'Sunset Builder',
    location: '11 Sunset Way',
    phase: 'Final',
    status: 'completed',
    customer_id: 'cust-mesa',
    completed_at: '2026-08-15T18:00:00.000Z',
    warranty_until: NEXT_YEAR,
  },
  {
    id: 'job-expired-kitchen',
    title: 'Expired Kitchen',
    location: '3 Old Mill Rd',
    phase: 'Final',
    status: 'completed',
    completed_at: '2019-01-01T18:00:00.000Z',
    warranty_until: '2020-01-01',
  },
];

// Wrapped in an object: test.use() reads a bare array as [value, options].
type Seed = { jobs: Row[] };

const test = base.extend<{ role: RoleName; seed: Seed; mock: MockHandle }>({
  role: ['owner', { option: true }],
  seed: [{ jobs: [] }, { option: true }],
  mock: async ({ page, role, seed }, use) => {
    const mock = await installSupabaseMock(page, { role, extraJobs: seed.jobs });
    await use(mock);
  },
});

test.afterEach(async ({ mock }) => {
  expect(mock.leaks, `request left the browser: ${mock.leaks.join(' | ')}`).toEqual([]);
});

function jobPatches(mock: MockHandle, id: string) {
  return mock.writes.filter(write =>
    write.table === 'jobs' && write.method === 'PATCH' && write.query.includes(id),
  );
}

async function openSchedule(page: Page) {
  await page.goto('/?view=schedule');
  await expect(page.getByLabel('Search schedule')).toBeVisible();
  await page.getByRole('button', { name: 'Month', exact: true }).click();
}

function completedHeader(page: Page) {
  return page.locator('#schedule-section-completed').getByRole('button');
}

function completedPanel(page: Page) {
  return page.locator('#schedule-section-completed-panel');
}

async function expandCompleted(page: Page) {
  const header = completedHeader(page);
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
}

for (const role of ['owner', 'crew'] as const) {
  test.describe(`${role} completes`, () => {
    test.use({ role });

    test('complete from the dashboard card moves the job to Completed', async ({ page, mock }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Mark Mesa Rough House complete', exact: true }).click();
      await expect.poll(() => jobPatches(mock, JOBS.mesa).length).toBeGreaterThan(0);

      const body = jobPatches(mock, JOBS.mesa)[0].body as Row;
      expect(body.status).toBe('completed');
      expect(typeof body.completed_at).toBe('string');
      expect(Number.isNaN(Date.parse(String(body.completed_at)))).toBe(false);
      expect(body.warranty_until).toBe(NEXT_YEAR);

      await openSchedule(page);
      await expect(page.locator('#schedule-section-rough-in')).toContainText('2 jobs');
      await expect(page.locator('#schedule-section-rough-in-panel')).not.toContainText('Mesa Rough House');
      await expect(completedHeader(page)).toContainText('1 job');
      await expandCompleted(page);
      const row = completedPanel(page).getByTestId(`completed-job-${JOBS.mesa}`);
      await expect(row).toContainText('Rough-In');
      await expect(row).toContainText('Warranty until');
      await expect(completedPanel(page)).toContainText('Mesa Rough House');
      await expect(completedPanel(page)).toContainText('100 Mesa Dr');
    });

    test('complete from Active Jobs applies to one phase row', async ({ page, mock }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /Active Jobs/ }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText('Canyon Top Out');
      await dialog.getByRole('button', { name: 'Mark Canyon Top Out complete' }).click();
      await expect(dialog).not.toContainText('Canyon Top Out');
      await expect(dialog).toContainText('Inspected Top Out');

      const patches = mock.writes.filter(write => write.table === 'jobs' && write.method === 'PATCH');
      expect(patches).toHaveLength(1);
      expect(patches[0].query).toContain(JOBS.canyon);
      expect(patches[0].body).toMatchObject({ status: 'completed', warranty_until: NEXT_YEAR });
    });
  });
}

test.describe('completed section', () => {
  test.use({ role: 'owner', seed: { jobs: COMPLETED_JOBS } });

  test('starts collapsed and the open state persists after reload', async ({ page, mock }) => {
    void mock;
    await openSchedule(page);
    await expect(completedHeader(page)).toContainText('3 jobs');
    await expect(completedPanel(page)).toHaveCount(0);
    await expandCompleted(page);
    await page.reload();
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(completedHeader(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(completedPanel(page)).toContainText('Done Bath House');

    await completedHeader(page).click();
    await page.reload();
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(completedHeader(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('completed jobs stay out of the phase sections', async ({ page, mock }) => {
    void mock;
    await openSchedule(page);
    await expect(page.locator('#schedule-section-trim')).toContainText('1 job');
    await expect(page.locator('#schedule-section-final')).toContainText('1 job');
    await expect(page.locator('#schedule-section-trim-panel')).not.toContainText('Done Bath House');
  });

  test('restore puts the job back on the board', async ({ page, mock }) => {
    await openSchedule(page);
    await expandCompleted(page);
    await completedPanel(page).getByRole('button', { name: 'Restore Done Bath House Trim' }).click();
    await expect(page.locator('#schedule-section-trim-panel')).toContainText('Done Bath House');
    await expect(page.locator('#schedule-section-trim')).toContainText('2 jobs');
    await expect(completedHeader(page)).toContainText('2 jobs');
    expect(jobPatches(mock, 'job-done-bath')[0]?.body).toEqual({
      status: 'scheduled',
      completed_at: null,
      warranty_until: null,
    });
  });

  test('search by builder, address, title, and phone', async ({ page, mock }) => {
    void mock;
    await openSchedule(page);
    await expandCompleted(page);
    const search = page.getByLabel('Search completed jobs');
    const panel = completedPanel(page);

    await search.fill('Sunset');
    await expect(panel).toContainText('Sunset Builder');
    await expect(panel).not.toContainText('Done Bath House');

    await search.fill('42 Done');
    await expect(panel).toContainText('Done Bath House');
    await expect(panel).not.toContainText('Sunset Builder');

    await search.fill('(520) 555-0199');
    await expect(panel).toContainText('Sunset Builder');
    await expect(panel).not.toContainText('Done Bath House');

    await search.fill('zzzz-nothing');
    await expect(panel).toContainText('No completed jobs match');

    await search.fill('');
    await expect(panel).toContainText('Expired Kitchen');
  });

  test('past-warranty jobs land in Expired and are never deleted', async ({ page, mock }) => {
    await openSchedule(page);
    await expandCompleted(page);
    const expired = page.locator('#schedule-completed-expired');
    await expect(expired).toContainText('Expired');
    await expect(expired).toContainText('Expired Kitchen');
    await expect(expired).toContainText('Warranty ended');
    await expect(page.locator('#schedule-completed-active')).not.toContainText('Expired Kitchen');
    await expect(page.locator('#schedule-completed-active')).toContainText(/Warranty until/);
    await page.waitForTimeout(1_000);
    expect(mock.writes.filter(write => write.method === 'DELETE' && write.table === 'jobs')).toEqual([]);
  });

  test('warranty date is editable per job', async ({ page, mock }) => {
    await openSchedule(page);
    await expandCompleted(page);
    await completedPanel(page).getByLabel('Warranty until for Done Bath House Trim').fill('2030-06-30');
    await expect.poll(() => jobPatches(mock, 'job-done-bath').length).toBeGreaterThan(0);
    expect(jobPatches(mock, 'job-done-bath').at(-1)?.body).toEqual({ warranty_until: '2030-06-30' });
    await expect(completedPanel(page).getByTestId('completed-job-job-done-bath')).toContainText('2030');
  });
});

test.describe('delete is owner only', () => {
  for (const role of ['crew', 'office'] as const) {
    test.describe(role, () => {
      test.use({ role });

      test(`${role} sees no Delete in Active Jobs`, async ({ page, mock }) => {
        await page.goto('/');
        await page.getByRole('button', { name: /Active Jobs/ }).first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText('Mesa Rough House');
        await expect(dialog.getByRole('button', { name: /^Delete / })).toHaveCount(0);
        if (role === 'crew') {
          await expect(dialog.getByRole('button', { name: 'Mark Mesa Rough House complete', exact: true })).toBeVisible();
        } else {
          await expect(dialog.getByRole('button', { name: /complete$/ })).toHaveCount(0);
        }
        expect(mock.writes.filter(write => write.method === 'DELETE')).toEqual([]);
      });
    });
  }

  test.describe('owner', () => {
    test.use({ role: 'owner', seed: { jobs: COMPLETED_JOBS } });

    test('owner delete asks for confirmation first', async ({ page, mock }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /Active Jobs/ }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Delete Blank Phase House' }).click();
      await expect(dialog).toContainText('Permanently delete?');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      expect(mock.writes.filter(write => write.method === 'DELETE')).toEqual([]);

      await dialog.getByRole('button', { name: 'Delete Blank Phase House' }).click();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(dialog).not.toContainText('Blank Phase House');
      const deletes = mock.writes.filter(write => write.method === 'DELETE' && write.table === 'jobs');
      expect(deletes).toHaveLength(1);
      expect(deletes[0].query).toContain(JOBS.blank);
    });

    test('completed section has no delete control', async ({ page, mock }) => {
      void mock;
      await openSchedule(page);
      await expandCompleted(page);
      await expect(completedPanel(page).getByRole('button', { name: /delete/i })).toHaveCount(0);
    });
  });
});
