import { expect, test, type Page } from '@playwright/test';
import { expectScreen, openGame, player } from './helpers';

/** A fake standard-mapping pad the test presses buttons on through window.__pad. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'e2e pad', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as any).__pad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
});

async function press(page: Page, button: number) {
  await setButton(page, button, true);
  await page.waitForTimeout(80);
  await setButton(page, button, false);
  await page.waitForTimeout(80);
}

const setButton = (page: Page, button: number, on: boolean) => page.evaluate(([b, v]) => {
  const btn = (window as any).__pad.buttons[b as number];
  btn.pressed = v; btn.value = v ? 1 : 0;
}, [button, on] as const);

const A = 0, B = 1, VIEW = 8, START = 9, DOWN = 13;

test('menus, play and pause work from a gamepad', async ({ page }) => {
  await openGame(page);
  await expect(page.getByRole('button', { name: 'New game' })).toBeFocused();
  await press(page, A);
  await expectScreen(page, 'playing');

  // Left stick walks.
  const before = await player(page);
  await page.evaluate(() => { (window as any).__pad.axes[1] = -1; });
  await page.waitForTimeout(700);
  await page.evaluate(() => { (window as any).__pad.axes[1] = 0; });
  const after = await player(page);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);

  await press(page, START);
  await expectScreen(page, 'paused');
  await expect(page.locator('body')).toHaveClass(/gamepad/);
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await press(page, DOWN);
  await expect(page.getByRole('button', { name: 'Resume' })).not.toBeFocused();
  await press(page, B);
  await expectScreen(page, 'playing');
});

test('every screen opens from the pad, and the help shows pad buttons', async ({ page }) => {
  await openGame(page);
  await press(page, A);
  await expectScreen(page, 'playing');

  await press(page, DOWN);
  await expectScreen(page, 'registry');
  await press(page, B);
  await expectScreen(page, 'playing');
  await press(page, VIEW);
  await expectScreen(page, 'map');
  await press(page, VIEW);
  await expectScreen(page, 'playing');

  await press(page, START);
  await expectScreen(page, 'paused');
  await page.getByText('Controls', { exact: true }).click();
  const help = page.locator('table.controls.help');
  await expect(help).toContainText('Vehicle registry');
  await expect(help.locator('.btn.y')).toHaveText('Y');
  await expect(help).not.toContainText('Esc / P');
});
