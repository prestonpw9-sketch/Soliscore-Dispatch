import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { installSupabaseMock, type MockHandle } from './supabaseMock';

const SITE = { latitude: 32.2217, longitude: -110.9265 };
const WEDNESDAY_MORNING = new Date('2026-10-28T15:30:00Z');
const SATURDAY_MORNING = new Date('2026-10-31T15:00:00Z');

test.use({ geolocation: SITE });

async function boot(page: Page): Promise<MockHandle> {
  return installSupabaseMock(page, {
    role: 'crew',
    extraJobs: [{
      id: 'job-site-arrival',
      title: 'Congress Site',
      location: '100 E Congress St, Tucson, AZ',
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      geofence_radius_m: 90,
      phase: 'Service Call',
    }],
  });
}

async function shot(page: Page, name: string) {
  await mkdir('/opt/cursor/artifacts', { recursive: true });
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
}

test('prompts to update the time card when the open app is inside a job geofence', async ({ page, context }) => {
  await page.clock.install({ time: WEDNESDAY_MORNING });
  await context.grantPermissions(['geolocation']);
  await boot(page);
  await page.goto('/?view=dashboard');

  await expect(page.locator('[data-arrival-watch="arrived"]')).toBeAttached();
  const dialog = page.getByRole('dialog', { name: 'Job site arrival' });
  await expect(dialog).toContainText("You're at Congress Site, update your time card?");
  await shot(page, 'arrival-prompt');

  await dialog.getByRole('button', { name: 'Update time card' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Time card' })).toBeVisible();
  await expect(page.getByText("You're at Congress Site, update your time card?")).toBeVisible();

  const row = page.getByRole('listitem').filter({ hasText: 'Congress Site' });
  await row.getByRole('button', { name: 'Clock in' }).click();
  await expect(row).toContainText(/Clocked in at/);
  await shot(page, 'time-card');
});

test('asks before using location, then shows the same arrival prompt', async ({ page, context }) => {
  await page.clock.install({ time: WEDNESDAY_MORNING });
  await boot(page);
  await page.goto('/?view=dashboard');

  const allow = page.getByRole('button', { name: 'Allow location' });
  await expect(allow).toBeVisible();
  await expect(page.getByText(/weekdays from 6:00 AM to 4:00 PM Phoenix time/)).toBeVisible();
  await context.grantPermissions(['geolocation']);
  // The click replaces this button with the arrival dialog. Drive it directly so
  // Playwright does not wait for the button to survive its own re-render.
  await allow.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('[data-arrival-watch="arrived"]')).toBeAttached();
  await expect(page.getByRole('dialog', { name: 'Job site arrival' })).toContainText(
    "You're at Congress Site, update your time card?",
  );
});

test('stays quiet off hours and when the phone is away from the job', async ({ page, context }) => {
  await page.clock.install({ time: SATURDAY_MORNING });
  await context.grantPermissions(['geolocation']);
  await boot(page);
  await page.goto('/?view=dashboard');
  await expect(page.locator('[data-arrival-watch="off-hours"]')).toBeAttached();
  await expect(page.getByRole('dialog', { name: 'Job site arrival' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Allow location' })).toHaveCount(0);
});

test('does not prompt when the phone is outside the geofence', async ({ page, context }) => {
  await page.clock.install({ time: WEDNESDAY_MORNING });
  await context.setGeolocation({ latitude: 0, longitude: 0 });
  await context.grantPermissions(['geolocation']);
  await boot(page);
  await page.goto('/?view=dashboard');
  await expect(page.locator('[data-arrival-watch="watching"]')).toBeAttached();
  await expect(page.getByRole('dialog', { name: 'Job site arrival' })).toHaveCount(0);
});

test('opens the time card from the notification link', async ({ page }) => {
  await page.clock.install({ time: SATURDAY_MORNING });
  await boot(page);
  await page.goto('/?view=timecard&job=job-site-arrival');
  await expect(page.getByRole('heading', { level: 1, name: 'Time card' })).toBeVisible();
  await expect(page.getByText("You're at Congress Site, update your time card?")).toBeVisible();
  await expect(page.locator('[data-arrival-watch="off-hours"]')).toBeAttached();
});
