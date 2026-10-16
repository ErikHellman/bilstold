import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { expectScreen, openGame, player, SEED } from './helpers';

const sessions = new WeakMap<Page, CDPSession>();
async function touch(page: Page, type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) {
  let cdp = sessions.get(page);
  if (!cdp) sessions.set(page, cdp = await page.context().newCDPSession(page));
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}

/** Phone in landscape. Real touch through CDP so pointer events carry pointerType "touch". */
test.describe('landscape', () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page, `seed=${SEED}`);
    await expect(page.locator('body')).toHaveClass(/touch/);
    await page.getByRole('button', { name: 'New game' }).tap();
    await expectScreen(page, 'playing');
  });

  test('on-screen controls appear only while playing', async ({ page }) => {
    const pad = page.locator('#touch');
    await expect(pad).toBeVisible();
    for (const b of ['FIRE', 'ENTER', 'DRIFT', 'BRAKE', 'GUN', 'II', 'MAP', 'RADIO']) {
      await expect(pad.getByRole('button', { name: b, exact: true })).toBeVisible();
    }
    await expect(page.locator('#rotate')).toBeHidden();
    await pad.getByRole('button', { name: 'II' }).tap();
    await expectScreen(page, 'paused');
    await expect(pad).toBeHidden();
    await page.getByRole('button', { name: 'Resume' }).tap();
    await expectScreen(page, 'playing');
    await expect(pad).toBeVisible();
  });

  test('phones start on the battery saver', async ({ page }) => {
    await page.locator('#touch').getByRole('button', { name: 'II' }).tap();
    await page.getByText('Settings', { exact: true }).tap();
    await expect(page.getByRole('checkbox')).toBeChecked();
  });

  test('dragging the left-hand stick walks the player', async ({ page }) => {
    const vp = page.viewportSize()!;
    const x = vp.width * 0.2, y = vp.height * 0.6;
    const before = await player(page);
    await touch(page, 'touchStart', x, y);
    await touch(page, 'touchMove', x, y - 50);
    await expect(page.locator('#touch .stick')).toBeVisible();
    await page.waitForTimeout(700);
    await touch(page, 'touchEnd', x, y - 50);
    await expect(page.locator('#touch .stick')).toBeHidden();
    const after = await player(page);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
  });

  test('MAP opens the map and any tap closes it', async ({ page }) => {
    await page.locator('#touch').getByRole('button', { name: 'MAP' }).tap();
    await expectScreen(page, 'map');
    await expect(page.locator('#touch-overlay')).toBeVisible();
    await page.locator('#touch-overlay').tap({ position: { x: 100, y: 100 } });
    await expectScreen(page, 'playing');
    await expect(page.locator('#touch-overlay')).toBeHidden();
  });

  test('holding FIRE lights the button while held', async ({ page }) => {
    const fire = page.locator('#touch .fire');
    const box = (await fire.boundingBox())!;
    await touch(page, 'touchStart', box.x + box.width / 2, box.y + box.height / 2);
    await expect(fire).toHaveClass(/down/);
    await touch(page, 'touchEnd', 0, 0);
    await expect(fire).not.toHaveClass(/down/);
  });

});

// The first tap asks for fullscreen, and a fullscreen window can't be resized, so portrait starts that way.
test.describe('portrait', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('asks the player to rotate', async ({ page }) => {
    await openGame(page, `seed=${SEED}`);
    await expect(page.locator('#rotate')).toBeVisible();
    await expect(page.locator('#rotate')).toHaveText('Turn your device sideways');
  });
});
