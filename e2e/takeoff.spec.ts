import { mkdir } from 'node:fs/promises';
import { test as base, expect, type Page } from '@playwright/test';
import { installSupabaseMock, type MockHandle, type RoleName } from './supabaseMock';

/**
 * Full Bid Takeoff: delete a saved estimate, and print its material lines.
 * The Supabase mock never forwards requests to the hosted project.
 */
const test = base.extend<{ role: RoleName; mock: MockHandle }>({
  role: ['owner', { option: true }],
  mock: async ({ page, role }, use) => {
    const mock = await installSupabaseMock(page, { role });
    await use(mock);
  },
});

async function openTakeoff(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('solidcore:full-takeoff-draft');
  });
  await page.goto('/?view=takeoff');
  await expect(page.getByLabel('Project name')).toBeVisible();
}

test.describe('owner', () => {
  test.use({ role: 'owner' });

  test('prints materials and deletes a saved takeoff from the sheet and the list', async ({ page, mock }, info) => {
    await openTakeoff(page);
    await page.getByLabel('Project name').fill('Mesa Rough Takeoff');
    await page.getByLabel('GC / Owner').fill('Mesa Builder');
    await page.getByLabel('Bid date').fill('2026-11-15');
    await page.locator('input[type="number"]').first().fill('4');

    await page.getByRole('button', { name: 'Print takeoff materials' }).click();
    await expect(page.getByRole('heading', { name: 'Takeoff materials' })).toBeVisible();
    const sheet = page.locator('.takeoff-print-sheet');
    await expect(sheet).toContainText('Mesa Rough Takeoff');
    await expect(sheet).toContainText('GC / Owner: Mesa Builder');
    await expect(sheet).toContainText('Nov 15, 2026');
    await expect(sheet).toContainText('8 PVC DWV HXH 90 ELL');
    await expect(sheet).toContainText('PAGE 1 TOTAL');
    await expect(sheet).toContainText('TOTAL MATERIAL');
    await expect(sheet).not.toContainText('8 PVC DWV HXHXH COMB WYE');
    await mkdir('/opt/cursor/artifacts', { recursive: true });
    await sheet.screenshot({ path: `/opt/cursor/artifacts/takeoff-print-${info.project.name}.png` });

    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed += 1;
      };
    });
    await page.getByRole('button', { name: 'Print this materials list' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed?: number }).__printed ?? 0)).toBe(1);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('mesa-rough-takeoff-materials.pdf');
    await page.getByRole('button', { name: 'Back to estimate' }).click();
    await expect(page.getByRole('heading', { name: 'Takeoff materials' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Save Bid' }).click();
    await expect(page.getByRole('button', { name: 'Delete saved takeoff' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete saved takeoff' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Mesa Rough Takeoff');
    await expect(page.getByRole('alertdialog')).toContainText('cannot be undone');
    await page.getByRole('alertdialog').screenshot({
      path: `/opt/cursor/artifacts/takeoff-delete-confirm-${info.project.name}.png`,
    });

    const beforeCancel = mock.writes.filter(write => write.method === 'DELETE').length;
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(mock.writes.filter(write => write.method === 'DELETE').length).toBe(beforeCancel);
    await expect(page.getByRole('button', { name: 'Delete saved takeoff' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete saved takeoff' }).click();
    await page.getByRole('button', { name: 'Delete takeoff' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText('unsaved copy')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete saved takeoff' })).toHaveCount(0);

    const detailDelete = mock.writes.filter(write => write.method === 'DELETE' && write.table === 'project_bids');
    expect(detailDelete).toHaveLength(1);
    expect(detailDelete[0]?.query).toContain('id=eq.');

    await page.getByLabel('Project name').fill('Second Takeoff');
    await page.getByRole('button', { name: 'Save Bid' }).click();
    await page.getByRole('button', { name: 'Open Saved' }).click();
    await expect(page.getByRole('heading', { name: 'Open Saved Takeoff' })).toBeVisible();
    const savedRow = page.getByRole('button', { name: /^Second Takeoff/ });
    await expect(savedRow).toBeVisible();
    await page.getByRole('button', { name: 'Delete Second Takeoff' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(savedRow).toBeVisible();
    await page.getByRole('button', { name: 'Print materials for Second Takeoff' }).click();
    await expect(page.getByRole('heading', { name: 'Takeoff materials' })).toBeVisible();
    await expect(page.locator('.takeoff-print-sheet')).toContainText('Second Takeoff');
    await page.getByRole('button', { name: 'Back to estimate' }).click();
    await page.getByRole('button', { name: 'Delete Second Takeoff' }).click();
    await page.getByRole('button', { name: 'Delete takeoff' }).click();
    await expect(page.getByText('No saved takeoffs yet')).toBeVisible();
    expect(mock.writes.filter(write => write.method === 'DELETE' && write.table === 'project_bids')).toHaveLength(2);
  });
});

for (const role of ['crew', 'office'] as const) {
  test.describe(role, () => {
    test.use({ role });

    test('cannot open the full takeoff or delete an estimate', async ({ page, mock }) => {
      void mock;
      await page.goto('/?view=takeoff');
      await expect(page.getByText('Access restricted')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete saved takeoff' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Print takeoff materials' })).toHaveCount(0);
    });
  });
}
