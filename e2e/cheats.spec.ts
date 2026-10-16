import { expect, test } from '@playwright/test';
import { expectScreen, hold, KONAMI, newGame, openGame, player } from './helpers';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await newGame(page);
});

async function openCheats(page: import('@playwright/test').Page) {
  for (const k of KONAMI) await page.keyboard.press(k);
  await expectScreen(page, 'cheats');
}

test('the Konami code opens the cheats menu', async ({ page }) => {
  await openCheats(page);
  const panel = page.locator('.panel.cheats');
  await expect(panel.locator('.status')).toHaveText('Pick your poison.');
  await expect(panel.getByText('Get in a car to fit car weapons.')).toBeVisible();

  await panel.getByRole('button', { name: 'God mode: OFF' }).click();
  await expect(panel.getByRole('button', { name: 'God mode: ON' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).__w.godMode)).toBe(true);

  await panel.getByRole('button', { name: 'Back to game' }).click();
  await expectScreen(page, 'playing');
});

test('the code does nothing on the title screen', async ({ page }) => {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & quit to title' }).click();
  await page.locator('.panel.title h2').click();
  for (const k of KONAMI) await page.keyboard.press(k);
  await expectScreen(page, 'title');
});

test('cheat in a weapon and a car, then drive it', async ({ page }) => {
  await openCheats(page);
  const panel = page.locator('.panel.cheats');
  const firstWeapon = panel.locator('.grid').first().getByRole('button').first();
  const name = await firstWeapon.textContent();
  await firstWeapon.click();
  await expect(panel.locator('.status')).toHaveText(`${name} added`);
  expect(Object.keys(await page.evaluate(() => (window as any).__w.ps.weapons)).length).toBeGreaterThan(1);

  const car = panel.locator('h3:has-text("Spawn a car") + .grid button').first();
  const model = await car.textContent();
  await car.click();
  await expectScreen(page, 'playing');
  await expect.poll(() => page.evaluate(() => (window as any).__game.renderer.hud.messages.map((m: any) => m.text)))
    .toContain(`${model} delivered`);

  // Walk to the car and get in.
  await page.keyboard.press('KeyF');
  await expect.poll(async () => (await player(page)).inCar, { timeout: 8000 }).toBe(true);

  const start = await player(page);
  await hold(page, 'KeyW', 1200);
  const moving = await player(page);
  expect(Math.hypot(moving.x - start.x, moving.y - start.y)).toBeGreaterThan(20);

  // The cheats menu now offers car weapons.
  await openCheats(page);
  await expect(page.getByText('Get in a car to fit car weapons.')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expectScreen(page, 'playing');

  await page.keyboard.press('KeyF');
  await expect.poll(async () => (await player(page)).inCar).toBe(false);
});
