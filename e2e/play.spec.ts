import { expect, test } from '@playwright/test';
import { expectScreen, hold, newGame, openGame, player } from './helpers';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await newGame(page);
});

test('walking with the keyboard moves the player', async ({ page }) => {
  const before = await player(page);
  await hold(page, 'KeyW', 700);
  const after = await player(page);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
});

test('the city name is announced and the HUD renders', async ({ page }) => {
  const big = await page.evaluate(() => (window as any).__game.renderer.hud.big?.text);
  const city = await page.evaluate(() => (window as any).__w.city.theme.name.toUpperCase());
  expect(big).toBe(city);
});

test('pause menu: resume, difficulty and settings persist', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expectScreen(page, 'paused');
  const panel = page.locator('.panel');
  await expect(panel.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(panel.getByRole('progressbar')).toBeVisible();
  await expect(panel).toContainText('City 1: $0 of');

  // The world is frozen while paused.
  const a = await page.evaluate(() => (window as any).__w.ps.playTime);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__w.ps.playTime)).toBe(a);

  await panel.getByRole('button', { name: 'Hard' }).click();
  await expect(panel.getByRole('button', { name: 'Hard' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as any).__w.difficulty)).toBe('hard');

  await panel.getByText('Settings', { exact: true }).click();
  await panel.getByRole('slider', { name: 'Music' }).fill('25');
  await panel.getByRole('checkbox').check();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bilstold.settings')!));
  expect(saved).toMatchObject({ difficulty: 'hard', music: 0.25, batterySaver: true });

  await panel.getByText('Stats', { exact: true }).click();
  await expect(panel.getByRole('row', { name: /Jobs done/ })).toBeVisible();

  await panel.getByRole('button', { name: 'Resume' }).click();
  await expectScreen(page, 'playing');
  await expect(page.locator('#ui')).toBeEmpty();

  // P pauses too, and pressing it again resumes.
  await page.keyboard.press('KeyP');
  await expectScreen(page, 'paused');
  await page.keyboard.press('KeyP');
  await expectScreen(page, 'playing');
});

test('settings survive a reload', async ({ page }) => {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Easy' }).click();
  await page.reload();
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'true');
});

test('map and vehicle registry open and close', async ({ page }) => {
  await page.keyboard.press('KeyM');
  await expectScreen(page, 'map');
  expect(await page.evaluate(() => (window as any).__game.renderer.showMap)).toBe(true);
  await page.keyboard.press('KeyM');
  await expectScreen(page, 'playing');

  await page.keyboard.press('KeyC');
  await expectScreen(page, 'registry');
  expect(await page.evaluate(() => (window as any).__game.renderer.showRegistry)).toBe(true);
  await page.keyboard.press('Escape');
  await expectScreen(page, 'playing');
  expect(await page.evaluate(() => (window as any).__game.renderer.showRegistry)).toBe(false);
});

test('save & quit, then continue where you left off', async ({ page }) => {
  await hold(page, 'KeyW', 500);
  await page.keyboard.press('Escape');
  const { x, y } = await player(page);
  await page.getByRole('button', { name: 'Save & quit to title' }).click();
  await expectScreen(page, 'title');

  const cont = page.getByRole('button', { name: /^Continue/ });
  await expect(cont).toContainText('seed "E2E-STADEN", city 1');
  await expect(cont).toBeFocused();
  await cont.click();
  await expectScreen(page, 'playing');
  const p = await player(page);
  expect(Math.hypot(p.x - x, p.y - y)).toBeLessThan(2);
});

test('new game over a save asks before overwriting', async ({ page }) => {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & quit to title' }).click();
  await page.getByRole('button', { name: 'New game' }).click();
  const confirm = page.locator('.confirm');
  await expect(confirm).toContainText('Overwrite your saved game?');
  await confirm.getByRole('button', { name: 'No' }).click();
  await expect(confirm).toBeHidden();
  await expectScreen(page, 'title');

  await page.getByRole('button', { name: 'New game' }).click();
  await confirm.getByRole('button', { name: 'Yes, start over' }).click();
  await expectScreen(page, 'playing');
});

test('switching tabs pauses the game', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expectScreen(page, 'paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expectScreen(page, 'playing');
});

test('a storyline phone call pauses for the briefing', async ({ page }) => {
  await page.evaluate(() => (window as any).__w.bus.emit('missionStart', {
    title: 'Steal the red car', brief: { speaker: 'Boss Testsson', gang: 0, lines: ['Get me that car.'] },
  }));
  await expectScreen(page, 'briefing');
  const panel = page.locator('.panel.briefing');
  await expect(panel.getByRole('heading', { name: 'Boss Testsson' })).toBeVisible();
  await expect(panel).toContainText('“Get me that car.”');
  await expect(panel.locator('.job')).toHaveText('Steal the red car');
  await expect(panel.locator('canvas.portrait')).toBeVisible();
  await panel.getByRole('button', { name: 'Take the job' }).click();
  await expectScreen(page, 'playing');
});

test('completing a city moves on to the next one', async ({ page }) => {
  const first = await page.evaluate(() => (window as any).__w.city.theme.name);
  await page.evaluate(() => (window as any).__w.bus.emit('cityComplete', { index: 1 }));
  await expectScreen(page, 'cityComplete');
  await expect(page.getByRole('heading', { name: `${first} is yours!` })).toBeVisible();
  await page.getByRole('button', { name: /^Continue to / }).click();
  await expectScreen(page, 'playing');
  const p = await player(page);
  expect(p.city).toBe(2);
  expect(await page.evaluate(() => (window as any).__w.city.theme.name)).not.toBe(first);
});
