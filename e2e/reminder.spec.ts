import { test, expect, type Page } from '@playwright/test';
import { installSupabaseMock } from './supabaseMock';

/**
 * Opt-in clock-in reminder in Settings. The native shell is faked with a
 * window.Capacitor stub that records plugin calls; nothing reaches a phone.
 */
async function fakeNative(page: Page, platform: 'android' | 'ios') {
  await page.addInitScript(kind => {
    const calls: Array<[string, unknown]> = [];
    (window as unknown as { __reminderCalls: typeof calls }).__reminderCalls = calls;
    const known: Record<string, (options?: unknown) => Promise<unknown>> = {
      checkAccess: async () => ({ location: 'prompt', notifications: 'prompt' }),
      consumePendingArrival: async () => ({ jobId: null, jobName: null, open: false }),
      addListener: async () => ({ remove: async () => {} }),
      sync: async () => ({ monitoring: 0, dropped: 0, active: false }),
      drainSamples: async () => ({ samples: [] }),
      getBattery: async () => ({ percent: null }),
      setClockInReminder: async options => {
        calls.push(['set', options]);
        return { method: kind === 'android' ? 'clock-app' : 'notification' };
      },
      cancelClockInReminder: async options => {
        calls.push(['cancel', options]);
        return { removed: kind === 'ios' };
      },
      openClockAlarms: async () => {
        calls.push(['open', null]);
      },
    };
    const plugin = new Proxy(known, {
      // Not a thenable: `await loadJobGeofence()` must get the plugin itself.
      get: (target, name: string) => (name === 'then' ? undefined : target[name] ?? (async () => ({}))),
    });
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => kind,
      isPluginAvailable: (name: string) => name === 'JobGeofence',
      Plugins: { JobGeofence: plugin },
    };
  }, platform);
}

async function openPreferences(page: Page) {
  await page.goto('/?view=settings');
  await page.getByRole('button', { name: 'Preferences' }).click();
}

const toggle = (page: Page) => page.getByRole('checkbox', { name: 'Clock-in reminder' });
const timeInput = (page: Page) => page.getByLabel('Reminder time');
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __reminderCalls: Array<[string, unknown]> }).__reminderCalls);

test('browser: reminder is off and only offered in the phone app', async ({ page }) => {
  await installSupabaseMock(page, { role: 'crew' });
  await openPreferences(page);
  await expect(toggle(page)).not.toBeChecked();
  await expect(toggle(page)).toBeDisabled();
  await expect(page.getByText('Available in the ITDG Dispatch phone app.')).toBeVisible();
  await expect(page.getByLabel('Reminder time')).toHaveCount(0);
});

test('android: on sets a weekday 6:00 Clock alarm, off says to delete it in Clock', async ({ page }) => {
  await fakeNative(page, 'android');
  await installSupabaseMock(page, { role: 'crew' });
  await openPreferences(page);
  await expect(toggle(page)).not.toBeChecked();
  await toggle(page).click({ force: true });
  await expect(toggle(page)).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'Alarm set in your Clock app' })).toBeVisible();
  expect(await calls(page)).toEqual([['set', {
    hour: 6,
    minute: 0,
    weekdays: [1, 2, 3, 4, 5],
    label: 'ITDG Dispatch clock in',
    title: 'Clock in',
    body: 'Time to clock in. Open ITDG Dispatch and tap Start.',
  }]]);

  // Stays on after a reload (stored on the phone for this user).
  await page.reload();
  await page.getByRole('button', { name: 'Preferences' }).click();
  await expect(toggle(page)).toBeChecked();

  await toggle(page).click({ force: true });
  await expect(toggle(page)).not.toBeChecked();
  await expect(page.getByRole('status')).toContainText('open Clock and delete the 6:00 AM "ITDG Dispatch clock in" alarm');
  await page.getByRole('button', { name: 'Open Clock alarms' }).click();
  expect((await calls(page)).map(([name]) => name)).toEqual(['cancel', 'open']);
});

test('android: picking a new time sets a new alarm and says to delete the old one', async ({ page }) => {
  await fakeNative(page, 'android');
  await installSupabaseMock(page, { role: 'crew' });
  await openPreferences(page);
  await expect(timeInput(page)).toHaveValue('06:00');
  await expect(page.getByRole('button', { name: 'Save time' })).toHaveCount(0);
  await toggle(page).click({ force: true });
  await expect(toggle(page)).toBeChecked();

  await timeInput(page).fill('05:30');
  await page.getByRole('button', { name: 'Save time' }).click();
  await expect(page.getByRole('status')).toContainText('New alarm set in your Clock app for 5:30 AM');
  await expect(page.getByRole('status')).toContainText('delete the old 6:00 AM "ITDG Dispatch clock in" alarm');
  await expect(page.getByRole('button', { name: 'Save time' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Clock alarms' }).click();
  const recorded = await calls(page);
  expect(recorded.map(([name]) => name)).toEqual(['set', 'set', 'open']);
  expect(recorded[0][1]).toMatchObject({ hour: 6, minute: 0 });
  expect(recorded[1][1]).toMatchObject({ hour: 5, minute: 30, weekdays: [1, 2, 3, 4, 5] });

  // The person's own time is kept on the phone.
  await page.reload();
  await page.getByRole('button', { name: 'Preferences' }).click();
  await expect(timeInput(page)).toHaveValue('05:30');
  await expect(page.getByText(/Adds a 5:30 AM Monday–Friday alarm/)).toBeVisible();
  await toggle(page).click({ force: true });
  await expect(page.getByRole('status')).toContainText('delete the 5:30 AM "ITDG Dispatch clock in" alarm');
  await expect(page.getByRole('button', { name: 'Open Clock alarms' })).toBeVisible();
});

test('iphone: a time picked while off is used when the reminder is turned on', async ({ page }) => {
  await fakeNative(page, 'ios');
  await installSupabaseMock(page, { role: 'crew' });
  await openPreferences(page);
  await timeInput(page).fill('06:45');
  await page.getByRole('button', { name: 'Save time' }).click();
  await expect(page.getByRole('status')).toHaveText('Reminder time saved: 6:45 AM. Turn the reminder on to set it.');
  expect(await calls(page)).toEqual([]);
  await toggle(page).click({ force: true });
  await expect(page.getByRole('status')).toContainText('a notification at 6:45 AM, Monday to Friday, holidays included');
  const recorded = await calls(page);
  expect(recorded.map(([name]) => name)).toEqual(['set']);
  expect(recorded[0][1]).toMatchObject({ hour: 6, minute: 45 });

  // Moving it while on just replaces the notifications: no Clock button.
  await timeInput(page).fill('05:15');
  await page.getByRole('button', { name: 'Save time' }).click();
  await expect(page.getByRole('status')).toContainText('a notification at 5:15 AM');
  await expect(page.getByRole('button', { name: 'Open Clock alarms' })).toHaveCount(0);
  expect((await calls(page))[1][1]).toMatchObject({ hour: 5, minute: 15 });
});

test('reminder time is limited to 4:00 AM through 9:00 AM', async ({ page }) => {
  await fakeNative(page, 'android');
  await installSupabaseMock(page, { role: 'crew' });
  await openPreferences(page);
  await expect(timeInput(page)).toHaveAttribute('min', '04:00');
  await expect(timeInput(page)).toHaveAttribute('max', '09:00');

  for (const outside of ['03:59', '09:01', '21:00']) {
    await timeInput(page).fill(outside);
    await expect(page.getByRole('alert').filter({ hasText: 'Pick a time from 4:00 AM to 9:00 AM.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save time' })).toHaveCount(0);
  }
  // Turning it on with an out-of-range time sets nothing.
  await toggle(page).click({ force: true });
  await expect(toggle(page)).not.toBeChecked();
  await expect(page.getByRole('status')).toHaveText('Pick a time from 4:00 AM to 9:00 AM.');
  expect(await calls(page)).toEqual([]);

  for (const edge of ['04:00', '09:00']) {
    await timeInput(page).fill(edge);
    await expect(page.getByRole('alert').filter({ hasText: 'Pick a time' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save time' }).click();
    await expect(page.getByRole('status')).toHaveText(`Reminder time saved: ${edge.replace(/^0/, '')} AM. Turn the reminder on to set it.`);
  }
  await toggle(page).click({ force: true });
  await expect(toggle(page)).toBeChecked();
  expect((await calls(page))[0][1]).toMatchObject({ hour: 9, minute: 0 });
});

test('iphone: on schedules notifications, off removes them', async ({ page }) => {
  await fakeNative(page, 'ios');
  await installSupabaseMock(page, { role: 'crew' });
  await openPreferences(page);
  await expect(page.getByText(/iPhone apps can't set Clock alarms/)).toBeVisible();
  await toggle(page).click({ force: true });
  await expect(page.getByRole('status')).toContainText('a notification at 6:00 AM, Monday to Friday');
  await toggle(page).click({ force: true });
  await expect(page.getByRole('status')).toHaveText('Reminder off.');
  await expect(page.getByRole('button', { name: 'Open Clock alarms' })).toHaveCount(0);
  expect((await calls(page)).map(([name]) => name)).toEqual(['set', 'cancel']);
});
