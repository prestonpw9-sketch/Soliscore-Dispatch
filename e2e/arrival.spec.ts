import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { installSupabaseMock } from './supabaseMock';

const SHOP = { latitude: 32.2217, longitude: -110.9265 };
const WEDNESDAY_MORNING = new Date('2026-10-28T15:30:00Z');

test.use({ geolocation: SHOP });

async function boot(page: Page) {
  await page.addInitScript(shop => {
    localStorage.setItem('itdg-shop', JSON.stringify({
      id: 'shop-test',
      name: 'Shop',
      latitude: shop.latitude,
      longitude: shop.longitude,
      radiusMeters: 90,
    }));
  }, SHOP);
  await installSupabaseMock(page, {
    role: 'crew',
    extraJobs: [{
      id: 'job-site-arrival',
      title: 'Congress Site',
      location: '100 E Congress St, Tucson, AZ',
      latitude: 32.25,
      longitude: -110.95,
      geofence_radius_m: 90,
      phase: 'Service Call',
    }],
  });
}

async function shot(page: Page, name: string) {
  await mkdir('/opt/cursor/artifacts', { recursive: true });
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
}

test('explains that location is recorded only while clocked in', async ({ page }) => {
  await page.clock.install({ time: WEDNESDAY_MORNING });
  await boot(page);
  await page.goto('/?view=timecard');
  await page.getByRole('button', { name: 'Start shift' }).click();
  const dialog = page.getByRole('dialog', { name: 'Location while clocked in' });
  await expect(dialog).toContainText('Location is recorded only while you are clocked in');
  await expect(dialog).toContainText('safety time');
  await shot(page, 'shift-consent');
  await dialog.getByRole('button', { name: 'Not now' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('listitem', { name: /Shop/ })).toHaveCount(0);
});

test('starts a shop segment at the shop without another tap', async ({ page, context }) => {
  await page.clock.install({ time: WEDNESDAY_MORNING });
  await context.grantPermissions(['geolocation']);
  await boot(page);
  await page.goto('/?view=timecard');
  await page.getByRole('button', { name: 'Start shift' }).click();
  await page.getByRole('button', { name: 'Start tracking' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Shop' })).toBeVisible();
  await expect(page.getByText(/Travel .+ · On site/)).toBeVisible();
  await shot(page, 'time-card');
  await page.getByRole('button', { name: 'Clock out' }).click();
  await expect(page.getByRole('button', { name: 'Start shift' })).toBeVisible();
});

test('refuses to start away from the shop', async ({ page, context }) => {
  await page.clock.install({ time: WEDNESDAY_MORNING });
  await context.setGeolocation({ latitude: 0, longitude: 0 });
  await context.grantPermissions(['geolocation']);
  await boot(page);
  await page.goto('/?view=timecard');
  await page.getByRole('button', { name: 'Start shift' }).click();
  await page.getByRole('button', { name: 'Start tracking' }).click();
  await expect(page.getByRole('status')).toContainText('not at the shop');
  await expect(page.getByRole('listitem').filter({ hasText: 'Shop' })).toHaveCount(0);
});

test('does not ask for location on the dashboard before a shift starts', async ({ page, context }) => {
  await page.clock.install({ time: WEDNESDAY_MORNING });
  await context.grantPermissions(['geolocation']);
  await boot(page);
  await page.goto('/?view=dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Allow location' })).toHaveCount(0);
});
