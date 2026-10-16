import { expect, test } from '@playwright/test';
import { canvasColours, openGame } from './helpers';

/** The built bundle that GitHub Pages serves. */
test('production build boots, plays and keeps dev hooks out', async ({ page }) => {
  const errors = await openGame(page);
  await expect.poll(() => canvasColours(page)).toBeGreaterThan(8);
  expect(await page.evaluate(() => '__w' in window || '__game' in window)).toBe(false);
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#ui')).toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('bilstold.save'))).not.toBeNull();
  expect(errors).toEqual([]);
});
