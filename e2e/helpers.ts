import { expect, type Page } from '@playwright/test';

export const SEED = 'E2E-STADEN';

/** Opens the game and fails the test on any uncaught page error. */
export async function openGame(page: Page, query = `seed=${SEED}`): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // The game ships no favicon; any other failed load or console error counts.
  page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text()); });
  await page.goto(`/?${query}`);
  await expect(page.locator('.panel.title')).toBeVisible();
  return errors;
}

/** The current screen from main.ts ('title', 'playing', 'paused', ...). Dev server only. */
export const screen = (page: Page) => page.evaluate(() => (window as any).__game?.screen as string | undefined);

export async function expectScreen(page: Page, name: string) {
  await expect.poll(() => screen(page)).toBe(name);
}

export async function newGame(page: Page) {
  await page.getByRole('button', { name: 'New game' }).click();
  await expectScreen(page, 'playing');
}

export const player = (page: Page) => page.evaluate(() => {
  const w = (window as any).__w;
  const p = w.player, v = p.vehicle;
  return { x: p.x, y: p.y, inCar: !!v, speed: v ? Math.hypot(v.vx, v.vy) : Math.hypot(p.vx, p.vy), city: w.city.index, score: w.ps.score };
});

/** Holds a key for a while of game time. */
export async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** How many distinct colours a sample of the canvas holds: a blank or black canvas has one. */
export const canvasColours = (page: Page) => page.evaluate(() => {
  const c = document.getElementById('game') as HTMLCanvasElement;
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const seen = new Set<number>();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return seen.size;
});

export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
