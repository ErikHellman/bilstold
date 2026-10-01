import { pickInDirection, type Box } from '../src/ui/padnav';

const b = (x: number, y: number, w = 100, h = 30): Box => ({ x, y, w, h });

test('picks the nearest control in the pressed direction', () => {
  const from = b(0, 0);
  const cands = [b(0, 50), b(0, 100), b(200, 50), b(0, -50)];
  expect(pickInDirection(from, cands, 'down')).toBe(0);
  expect(pickInDirection(from, cands, 'up')).toBe(3);
  expect(pickInDirection(from, cands, 'right')).toBe(2);
  expect(pickInDirection(from, cands, 'left')).toBe(-1);
});
test('prefers staying in the same column of a grid', () => {
  const from = b(150, 0);
  const cands = [b(0, 40), b(150, 40), b(300, 40)];
  expect(pickInDirection(from, cands, 'down')).toBe(1);
});
test('a wide control reaches a right-aligned row below it before a full-width one further down', () => {
  const resume = b(0, 0, 400, 30);
  const cands = [b(250, 40, 60, 30), b(320, 40, 60, 30), b(0, 80, 400, 20)];
  expect([0, 1]).toContain(pickInDirection(resume, cands, 'down'));
});
test('controls side by side in a row are not above or below each other', () => {
  const input = b(0, 1, 200, 35), dice = b(210, 0, 45, 37);
  expect(pickInDirection(input, [dice], 'down')).toBe(-1);
  expect(pickInDirection(input, [dice], 'right')).toBe(0);
});
test('moving left along a row does not jump to a full-width control underneath', () => {
  const easy = b(443, 277, 60, 33), normal = b(512, 277, 79, 33), settings = b(339, 320, 321, 19);
  expect(pickInDirection(normal, [easy, settings], 'left')).toBe(0);
});
