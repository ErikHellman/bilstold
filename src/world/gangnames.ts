import { type Rng, pick } from '../core/rng';

const A = ['Söder', 'Hamn', 'Norr', 'Rost', 'Järn', 'Svart', 'Guld', 'Neon', 'Is', 'Krom'];
const B = ['gänget', 'brödraskapet', 'maffian', 'klanen', 'kartellen', 'ligan'];

/** Three distinct gang names. */
export function gangNames(r: Rng): string[] {
  const prefixes = A.slice();
  for (let i = prefixes.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [prefixes[i], prefixes[j]] = [prefixes[j], prefixes[i]];
  }
  return [0, 1, 2].map(i => prefixes[i] + pick(r, B));
}

/** Gang names built on fixed prefixes (a city theme's), with seeded endings that never repeat. */
export function themedGangNames(r: Rng, prefixes: readonly string[]): string[] {
  const ends = B.slice();
  return prefixes.map(p => p + ends.splice(Math.floor(r() * ends.length), 1)[0]);
}
