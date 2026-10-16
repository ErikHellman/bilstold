import { expect, test } from '@playwright/test';
import { canvasColours, expectScreen, openGame, player, SEED } from './helpers';

test('title screen shows the menu over a live attract-mode city', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.getByRole('heading', { name: 'Stjäl bilar. Skapa kaos.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'City seed' })).toHaveValue(SEED);
  await expect(page.getByRole('button', { name: 'New game' })).toBeFocused();
  await expect(page.getByRole('button', { name: /^Continue/ })).toHaveCount(0);
  await expect.poll(() => canvasColours(page)).toBeGreaterThan(8);
  await expectScreen(page, 'title');
  expect(errors).toEqual([]);
});

test('controls help expands', async ({ page }) => {
  await openGame(page);
  const table = page.locator('.panel.title table.controls');
  await expect(table).toBeHidden();
  await page.getByText('Controls', { exact: true }).click();
  await expect(table).toBeVisible();
  await expect(table.getByRole('row', { name: /Enter \/ F/ })).toContainText('Enter or exit car');
});

test('dice button rolls a new seed', async ({ page }) => {
  await openGame(page);
  const field = page.getByRole('textbox', { name: 'City seed' });
  await page.getByRole('button', { name: '🎲' }).click();
  await expect(field).not.toHaveValue(SEED);
  await expect(field).not.toHaveValue('');
});

test('typing in the seed field does not move the attract camera or trigger game keys', async ({ page }) => {
  await openGame(page);
  const field = page.getByRole('textbox', { name: 'City seed' });
  await field.fill('');
  await field.pressSequentially('MAPPED');
  await expect(field).toHaveValue('MAPPED');
  await expectScreen(page, 'title');
  await expect(page.locator('.panel.title')).toBeVisible();
});

test('Enter in the seed field starts a new game in that city', async ({ page }) => {
  await openGame(page);
  const field = page.getByRole('textbox', { name: 'City seed' });
  await field.fill('ENTER-STAD');
  await field.press('Enter');
  await expectScreen(page, 'playing');
  await expect(page.locator('#ui')).toBeEmpty();
  expect((await player(page)).city).toBe(1);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('bilstold.save') ?? 'null'));
  expect(save?.seed).toBe('ENTER-STAD');
});

test('a corrupt save is discarded with a notice', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('bilstold.save', '{not json'); sessionStorage.setItem('seeded', '1'); } });
  await openGame(page);
  await expect(page.locator('.panel .notice')).toHaveText('Save was corrupt and has been discarded');
  await expect(page.getByRole('button', { name: /^Continue/ })).toHaveCount(0);
});
